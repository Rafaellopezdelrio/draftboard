use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager as _};
use tokio::sync::Mutex;
use tokio::time::sleep;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::Connector;

#[derive(Debug, Clone, Serialize)]
pub struct LcuStatus {
    pub connected: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct Lockfile {
    port: u16,
    password: String,
}

pub struct LcuState {
    pub status: Mutex<LcuStatus>,
}

impl Default for LcuState {
    fn default() -> Self {
        Self {
            status: Mutex::new(LcuStatus {
                connected: false,
                reason: None,
            }),
        }
    }
}

pub fn spawn_watcher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Backoff so we don't hammer the filesystem when LoL isn't
        // running. Fast reconnect (3s) keeps the user's lock-in flow
        // responsive AFTER LoL launches; slower (10s) baseline before
        // they launch keeps the idle CPU near zero.
        loop {
            let lockfile_existed = match try_connect(&app).await {
                Ok(()) => {
                    update_status(&app, false, Some("disconnected".into())).await;
                    true
                }
                Err(e) => {
                    let was_present = !e.to_string().contains("lockfile not found");
                    update_status(&app, false, Some(e.to_string())).await;
                    was_present
                }
            };
            let delay_secs = if lockfile_existed { 3 } else { 10 };
            sleep(Duration::from_secs(delay_secs)).await;
        }
    });
}

async fn try_connect(app: &AppHandle) -> Result<()> {
    // No eprintln on lockfile-missing — that's the expected steady state
    // while LoL is closed. Previously every 3s a "[LCU] read_lockfile
    // failed: ..." line spammed stderr + the log file, costing disk
    // I/O and bloating logs. The watcher loop already broadcasts the
    // disconnected status to the frontend; no log needed.
    let lf = read_lockfile()?;
    eprintln!(
        "[LCU] lockfile OK port={} password=({} chars)",
        lf.port,
        lf.password.len()
    );

    let auth = format!("riot:{}", lf.password);
    let auth_b64 = B64.encode(auth.as_bytes());

    let url = format!("wss://127.0.0.1:{}/", lf.port);
    eprintln!("[LCU] connecting to {}", url);
    let mut req = url.into_client_request()?;
    req.headers_mut()
        .insert("Authorization", format!("Basic {}", auth_b64).parse()?);

    // The LCU uses a self-signed cert. Disable verification only against localhost.
    let tls = rustls_dangerous_config()?;
    let connector = Connector::Rustls(std::sync::Arc::new(tls));
    let (mut stream, _) =
        tokio_tungstenite::connect_async_tls_with_config(req, None, false, Some(connector))
            .await
            .map_err(|e| {
                eprintln!("[LCU] websocket connect failed: {}", e);
                anyhow!("LCU websocket connect: {}", e)
            })?;

    eprintln!("[LCU] WebSocket connected ✓");
    update_status(app, true, None).await;

    // Subscribe to champion select session updates.
    let sub = serde_json::to_string(&serde_json::json!([
        5,
        "OnJsonApiEvent_lol-champ-select_v1_session"
    ]))?;
    stream.send(Message::Text(sub)).await?;

    // Bootstrap: the WebSocket only fires when the session CHANGES.
    // If the user is already in champ select when Draftboard launches,
    // we'd never see them until the next state transition. Do an initial
    // REST GET to seed the frontend immediately. Failure is fine — we
    // just rely on the websocket from that point.
    if let Ok(initial) = fetch_lcu_json("/lol-champ-select/v1/session").await {
        if initial.is_object() {
            let _ = app.emit("lcu:champ-select", &initial);
        }
    }

    while let Some(msg) = stream.next().await {
        let msg = match msg {
            Ok(m) => m,
            Err(_) => break,
        };
        if let Message::Text(txt) = msg {
            if let Ok(val) = serde_json::from_str::<Value>(&txt) {
                // LCU websocket payload shape: `[8, "OnJsonApiEvent_<topic>",
                // { eventType: "Create"|"Update"|"Delete", uri, data }]`.
                // We need `.data` for the actual session — emitting the
                // wrapper means the frontend reads `eventType.myTeam` which
                // is undefined and the champion select detection silently
                // fails (this was the bug behind "Draftboard didn't detect
                // my champ pick").
                if let Some(envelope) = val.get(2) {
                    // LCU sends `eventType: "Delete"` with `data: null` when
                    // the user leaves champ select. Emitting `null` made the
                    // frontend listener access `.myTeam` on null and silently
                    // halt — picks would freeze on the last known state.
                    // Only emit when `data` is an actual object.
                    if let Some(data) = envelope.get("data") {
                        if data.is_object() {
                            let _ = app.emit("lcu:champ-select", data);
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

async fn update_status(app: &AppHandle, connected: bool, reason: Option<String>) {
    if let Some(state) = app.try_state::<LcuState>() {
        let mut s = state.status.lock().await;
        s.connected = connected;
        s.reason = reason.clone();
    }
    let _ = app.emit("lcu:status", LcuStatus { connected, reason });
}

/// Parse the raw lockfile string into structured Port + Password.
/// Pure function — no IO — so it's directly unit-testable. Real
/// production callers use `read_lockfile` which walks candidate paths
/// + reads the file before delegating here.
///
/// LCU lockfile format: `LeagueClient:PID:PORT:PASSWORD:PROTOCOL`
/// (colon-separated, 5 fields, always trailing newline that we trim).
pub(crate) fn parse_lockfile_content(content: &str) -> Result<Lockfile> {
    let trimmed = content.trim();
    let parts: Vec<&str> = trimmed.split(':').collect();
    if parts.len() < 4 {
        return Err(anyhow!(
            "lockfile has only {} fields, expected at least 4",
            parts.len()
        ));
    }
    let port: u16 = parts[2].parse().context("parse lockfile port")?;
    let password = parts[3].to_string();
    if password.is_empty() {
        return Err(anyhow!("lockfile password is empty"));
    }
    Ok(Lockfile { port, password })
}

fn read_lockfile() -> Result<Lockfile> {
    let candidates = lockfile_candidates();
    for path in candidates {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(lock) = parse_lockfile_content(&content) {
                return Ok(lock);
            }
        }
    }
    Err(anyhow!("LoL client lockfile not found"))
}

fn lockfile_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();

    // Step 1: Auto-detect from running LeagueClient.exe process. This is the
    // most reliable: works for ANY install path the user picked.
    if let Some(path) = detect_lol_install_from_process() {
        out.push(path.join("lockfile"));
    }

    // Step 2: Read Riot's installs config (works even when client not running)
    if let Some(paths) = detect_lol_installs_from_config() {
        for p in paths {
            out.push(p.join("lockfile"));
        }
    }

    // Step 3: Fallback hardcoded common paths (covers users with weird env)
    let drives = ["C", "D", "E", "F", "G"];
    for d in drives {
        out.push(PathBuf::from(format!(
            "{}:\\Riot Games\\League of Legends\\lockfile",
            d
        )));
        out.push(PathBuf::from(format!(
            "{}:\\Program Files\\Riot Games\\League of Legends\\lockfile",
            d
        )));
        out.push(PathBuf::from(format!(
            "{}:\\Program Files (x86)\\Riot Games\\League of Legends\\lockfile",
            d
        )));
    }
    out
}

/// Walk running processes looking for LeagueClient.exe; return its folder.
fn detect_lol_install_from_process() -> Option<PathBuf> {
    use sysinfo::{ProcessRefreshKind, RefreshKind, System};
    let sys = System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
    );
    for proc in sys.processes().values() {
        let name = proc.name().to_string_lossy();
        if name.eq_ignore_ascii_case("LeagueClient.exe") {
            if let Some(exe) = proc.exe() {
                if let Some(dir) = exe.parent() {
                    return Some(dir.to_path_buf());
                }
            }
        }
    }
    None
}

/// Read RiotClientInstalls.json (maintained by Riot Client) to find LoL paths.
/// Works even when League client isn't running.
fn detect_lol_installs_from_config() -> Option<Vec<PathBuf>> {
    let candidates = [
        PathBuf::from(std::env::var("PROGRAMDATA").ok()?)
            .join("Riot Games")
            .join("RiotClientInstalls.json"),
        PathBuf::from(std::env::var("LOCALAPPDATA").ok()?)
            .join("Riot Games")
            .join("RiotClientInstalls.json"),
    ];
    for path in candidates {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(val) = serde_json::from_str::<Value>(&content) {
                let mut out = Vec::new();
                if let Some(map) = val.get("associated_client").and_then(|v| v.as_object()) {
                    for key in map.keys() {
                        // Keys are install paths like "C:/Riot Games/League of Legends/"
                        out.push(PathBuf::from(key.replace('/', "\\")));
                    }
                }
                if !out.is_empty() {
                    return Some(out);
                }
            }
        }
    }
    None
}

fn rustls_dangerous_config() -> Result<rustls::ClientConfig> {
    use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
    use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
    use rustls::DigitallySignedStruct;

    #[derive(Debug)]
    struct NoVerify;
    impl ServerCertVerifier for NoVerify {
        fn verify_server_cert(
            &self,
            _end_entity: &CertificateDer<'_>,
            _intermediates: &[CertificateDer<'_>],
            _server_name: &ServerName<'_>,
            _ocsp: &[u8],
            _now: UnixTime,
        ) -> std::result::Result<ServerCertVerified, rustls::Error> {
            Ok(ServerCertVerified::assertion())
        }
        fn verify_tls12_signature(
            &self,
            _: &[u8],
            _: &CertificateDer<'_>,
            _: &DigitallySignedStruct,
        ) -> std::result::Result<HandshakeSignatureValid, rustls::Error> {
            Ok(HandshakeSignatureValid::assertion())
        }
        fn verify_tls13_signature(
            &self,
            _: &[u8],
            _: &CertificateDer<'_>,
            _: &DigitallySignedStruct,
        ) -> std::result::Result<HandshakeSignatureValid, rustls::Error> {
            Ok(HandshakeSignatureValid::assertion())
        }
        fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
            vec![
                rustls::SignatureScheme::RSA_PKCS1_SHA256,
                rustls::SignatureScheme::RSA_PKCS1_SHA384,
                rustls::SignatureScheme::RSA_PKCS1_SHA512,
                rustls::SignatureScheme::ECDSA_NISTP256_SHA256,
                rustls::SignatureScheme::ECDSA_NISTP384_SHA384,
                rustls::SignatureScheme::RSA_PSS_SHA256,
                rustls::SignatureScheme::RSA_PSS_SHA384,
                rustls::SignatureScheme::RSA_PSS_SHA512,
                rustls::SignatureScheme::ED25519,
            ]
        }
    }

    let cfg = rustls::ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(std::sync::Arc::new(NoVerify))
        .with_no_client_auth();
    Ok(cfg)
}

#[tauri::command]
pub async fn lcu_status(state: tauri::State<'_, LcuState>) -> Result<LcuStatus, String> {
    Ok(state.status.lock().await.clone())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LcuSummoner {
    pub puuid: String,
    #[serde(rename = "gameName")]
    pub game_name: Option<String>,
    #[serde(rename = "tagLine")]
    pub tag_line: Option<String>,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    #[serde(rename = "summonerLevel")]
    pub summoner_level: Option<u32>,
    pub region: Option<String>,
}

#[tauri::command]
pub async fn lcu_current_summoner() -> Result<LcuSummoner, String> {
    fetch_current_summoner().await.map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LcuSummonerLite {
    pub puuid: String,
    #[serde(rename = "gameName")]
    pub game_name: Option<String>,
    #[serde(rename = "tagLine")]
    pub tag_line: Option<String>,
    #[serde(rename = "summonerId")]
    pub summoner_id: Option<u64>,
}

#[tauri::command]
pub async fn lcu_summoner_by_id(summoner_id: u64) -> Result<LcuSummonerLite, String> {
    fetch_summoner_by_id(summoner_id)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunePageInput {
    pub name: String,
    #[serde(rename = "primaryStyleId")]
    pub primary_style_id: u32,
    #[serde(rename = "subStyleId")]
    pub sub_style_id: u32,
    #[serde(rename = "selectedPerkIds")]
    pub selected_perk_ids: Vec<u32>,
}

#[tauri::command]
pub async fn lcu_apply_runes(page: RunePageInput) -> Result<(), String> {
    apply_runes(page).await.map_err(|e| e.to_string())
}

async fn apply_runes(page: RunePageInput) -> Result<()> {
    let lf = read_lockfile()?;
    let auth = format!("riot:{}", lf.password);
    let auth_b64 = B64.encode(auth.as_bytes());

    let tls = rustls_dangerous_config()?;
    let client = reqwest::Client::builder()
        .use_preconfigured_tls(tls)
        .timeout(Duration::from_secs(5))
        .connect_timeout(Duration::from_secs(2))
        .build()?;

    let base = format!("https://127.0.0.1:{}", lf.port);

    // 1) Get current rune page id
    let pages: Vec<serde_json::Value> = client
        .get(format!("{}/lol-perks/v1/pages", base))
        .header("Authorization", format!("Basic {}", auth_b64))
        .send()
        .await?
        .json()
        .await?;

    let editable = pages.iter().find(|p| {
        p.get("isEditable")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    });

    if let Some(existing) = editable {
        if let Some(id) = existing.get("id").and_then(|v| v.as_i64()) {
            let _ = client
                .delete(format!("{}/lol-perks/v1/pages/{}", base, id))
                .header("Authorization", format!("Basic {}", auth_b64))
                .send()
                .await;
        }
    }

    let body = serde_json::json!({
        "name": page.name,
        "primaryStyleId": page.primary_style_id,
        "subStyleId": page.sub_style_id,
        "selectedPerkIds": page.selected_perk_ids,
        "current": true,
    });

    let resp = client
        .post(format!("{}/lol-perks/v1/pages", base))
        .header("Authorization", format!("Basic {}", auth_b64))
        .json(&body)
        .send()
        .await?;
    if !resp.status().is_success() {
        return Err(anyhow!("apply runes returned {}", resp.status()));
    }
    Ok(())
}

#[tauri::command]
pub async fn lcu_get_json(path: String) -> Result<serde_json::Value, String> {
    fetch_lcu_json(&path).await.map_err(|e| e.to_string())
}

// ============================================================================
// Riot Live Client Data API (localhost:2999)
// ============================================================================
// Separate from the LCU because it's a DIFFERENT API: while you're in a real
// game, Riot exposes an HTTP server on port 2999 with current match data.
// Used by every overlay tool out there (Blitz, Mobalytics, Porofessor in-game,
// OBS LoL plugins, etc). Officially documented and read-only.
//
// Same self-signed-cert situation as the LCU, so we reuse rustls_dangerous_config.
// Different port + no auth header needed (it's localhost-only).
//
// Endpoint: https://127.0.0.1:2999/liveclientdata/allgamedata
// Returns: { activePlayer, allPlayers[], events: { Events[] }, gameData }

#[tauri::command]
pub async fn live_client_all_game_data() -> Result<serde_json::Value, String> {
    fetch_live_client_json("/liveclientdata/allgamedata")
        .await
        .map_err(|e| e.to_string())
}

async fn fetch_live_client_json(path: &str) -> Result<serde_json::Value> {
    let tls = rustls_dangerous_config()?;
    // Short timeouts: if we're not in a game the connection refuses immediately,
    // so a 1s connect timeout is plenty. The 4s read timeout covers the slow
    // initial response when a game JUST started and the API is warming up.
    let client = reqwest::Client::builder()
        .use_preconfigured_tls(tls)
        .timeout(Duration::from_secs(4))
        .connect_timeout(Duration::from_secs(1))
        .build()?;

    let url = format!("https://127.0.0.1:2999{}", path);
    let resp = client.get(&url).send().await?;
    if !resp.status().is_success() {
        return Err(anyhow!("live client returned {}", resp.status()));
    }
    let value: serde_json::Value = resp.json().await?;
    Ok(value)
}

/// Push a recommended item set to the LCU so it shows up in the in-game
/// shop's left sidebar. The user can click an item once and a full
/// build path expands.
///
/// LCU endpoint: PUT /lol-item-sets/v1/item-sets/{summonerId}/sets
/// Body shape per Riot's spec:
///   {
///     "accountId": <summonerId>,
///     "itemSets": [{
///       "uid": "...",            // unique-ish, we generate from champion+role
///       "title": "...",
///       "associatedChampions": [<championId>],
///       "associatedMaps": [11, 12],
///       "blocks": [
///         { "type": "Starter", "items": [{"id":"1054","count":1}] },
///         { "type": "Core",    "items": [...] },
///         { "type": "Situational", "items": [...] }
///       ]
///     }, ...]
///   }
///
/// Fail-soft: if we can't reach the LCU (client closed), return false
/// without raising. Caller can show a "open LoL client first" hint.

#[derive(Debug, serde::Deserialize)]
pub struct ItemSetInput {
    #[serde(rename = "championId")]
    pub champion_id: u32,
    pub title: String,
    pub blocks: Vec<ItemSetBlock>,
}

#[derive(Debug, serde::Deserialize)]
pub struct ItemSetBlock {
    /// Block label: "Starter" | "Core" | "Situational" | etc. — free text.
    #[serde(rename = "type")]
    pub block_type: String,
    pub items: Vec<ItemSetItem>,
}

#[derive(Debug, serde::Deserialize)]
pub struct ItemSetItem {
    /// Riot item id (will be stringified for the LCU body).
    pub id: u32,
    #[serde(default = "default_one")]
    pub count: u32,
}
fn default_one() -> u32 {
    1
}

#[tauri::command]
pub async fn lcu_push_item_set(set: ItemSetInput) -> Result<bool, String> {
    push_item_set(set).await.map_err(|e| e.to_string())
}

async fn push_item_set(set: ItemSetInput) -> Result<bool> {
    let lf = read_lockfile()?;
    let auth = format!("riot:{}", lf.password);
    let auth_b64 = B64.encode(auth.as_bytes());

    let tls = rustls_dangerous_config()?;
    let client = reqwest::Client::builder()
        .use_preconfigured_tls(tls)
        .timeout(Duration::from_secs(5))
        .connect_timeout(Duration::from_secs(2))
        .build()?;
    let base = format!("https://127.0.0.1:{}", lf.port);

    // Resolve the current summoner so we can scope the item set to them.
    let me: serde_json::Value = client
        .get(format!("{}/lol-summoner/v1/current-summoner", base))
        .header("Authorization", format!("Basic {}", auth_b64))
        .send()
        .await?
        .json()
        .await?;
    let Some(summoner_id) = me.get("summonerId").and_then(|v| v.as_u64()) else {
        return Ok(false); // not logged in to client
    };

    // Build the body Riot expects. Items in the `items` array carry their
    // id as a STRING (their schema is loose — strings everywhere).
    let blocks: Vec<serde_json::Value> = set
        .blocks
        .iter()
        .map(|b| {
            serde_json::json!({
                "type": b.block_type,
                "items": b.items.iter().map(|it| serde_json::json!({
                    "id": it.id.to_string(),
                    "count": it.count,
                })).collect::<Vec<_>>(),
            })
        })
        .collect();

    let uid = format!("draftboard-{}-{}", set.champion_id, summoner_id);
    let body = serde_json::json!({
        "accountId": summoner_id,
        "itemSets": [{
            "uid": uid,
            "title": set.title,
            "associatedChampions": [set.champion_id],
            "associatedMaps": [11, 12], // SR + ARAM
            "blocks": blocks,
            "mode": "any",
            "type": "custom",
            "map": "any",
            "priority": false,
            "sortrank": 1,
            "preferredItemSlots": [],
            "startedFrom": "Imported",
            "isGlobalForChampions": true,
        }]
    });

    let resp = client
        .put(format!(
            "{}/lol-item-sets/v1/item-sets/{}/sets",
            base, summoner_id
        ))
        .header("Authorization", format!("Basic {}", auth_b64))
        .json(&body)
        .send()
        .await?;
    if resp.status().as_u16() == 404 {
        // Not in a state where sets can be written (login screen, etc).
        return Ok(false);
    }
    if !resp.status().is_success() {
        return Err(anyhow!("push item set returned {}", resp.status()));
    }
    Ok(true)
}

/// Apply two summoner spells to the local player's pick in champ select.
///
/// The LCU exposes spells through PATCH on
/// `/lol-champ-select/v1/session/my-selection` with `spell1Id` / `spell2Id`.
/// Riot's IDs are: 4=Flash, 14=Ignite, 11=Smite, 12=Teleport, 7=Heal,
/// 3=Exhaust, 1=Cleanse, 6=Ghost, 21=Barrier.
///
/// Returns Ok even if champ select is over or the player isn't in champ
/// select — fail-soft so an auto-apply on hover doesn't spam errors when
/// the user is just hovering outside a real lobby. Hard errors (lockfile
/// missing, network) still bubble up.
#[tauri::command]
pub async fn lcu_apply_summoner_spells(spell1: u32, spell2: u32) -> Result<bool, String> {
    apply_summoner_spells(spell1, spell2)
        .await
        .map_err(|e| e.to_string())
}

async fn apply_summoner_spells(spell1: u32, spell2: u32) -> Result<bool> {
    let lf = read_lockfile()?;
    let auth = format!("riot:{}", lf.password);
    let auth_b64 = B64.encode(auth.as_bytes());

    let tls = rustls_dangerous_config()?;
    let client = reqwest::Client::builder()
        .use_preconfigured_tls(tls)
        .timeout(Duration::from_secs(5))
        .connect_timeout(Duration::from_secs(2))
        .build()?;

    let base = format!("https://127.0.0.1:{}", lf.port);
    let body = serde_json::json!({
        "spell1Id": spell1,
        "spell2Id": spell2,
    });

    let resp = client
        .patch(format!("{}/lol-champ-select/v1/session/my-selection", base))
        .header("Authorization", format!("Basic {}", auth_b64))
        .json(&body)
        .send()
        .await?;

    // 204 No Content is the success path. 404 means we're not in champ
    // select right now — return false so the caller can no-op instead of
    // showing an error toast.
    if resp.status().as_u16() == 404 {
        return Ok(false);
    }
    if !resp.status().is_success() {
        return Err(anyhow!("apply summoner spells returned {}", resp.status()));
    }
    Ok(true)
}

/// Guard the frontend-supplied LCU path before it's concatenated into the
/// authenticated `https://127.0.0.1:{port}{path}` GET. Without this, any string
/// — including one smuggled through an interpolated puuid (lobbyScout,
/// lcuPersonalData) or injected via the frontend — could reach ARBITRARY LCU
/// endpoints as the logged-in user. Restrict to the read-only `/lol-<service>/
/// v<n>/...` shape we actually call: leading `/lol-`, no traversal, only
/// URL-safe characters (blocks `@` userinfo, whitespace, `\`, control chars).
fn validate_lcu_path(path: &str) -> Result<()> {
    if path.len() > 512 {
        return Err(anyhow!("LCU path too long"));
    }
    if !path.starts_with("/lol-") {
        return Err(anyhow!("LCU path must target a /lol- service"));
    }
    if path.contains("..") || path.contains("//") {
        return Err(anyhow!("LCU path contains traversal"));
    }
    // Validate the route and an optional query string separately.
    let (route, query) = match path.split_once('?') {
        Some((r, q)) => (r, Some(q)),
        None => (path, None),
    };
    let route_ok = route
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'/' | b'-' | b'_' | b'.'));
    if !route_ok {
        return Err(anyhow!("LCU path has illegal characters"));
    }
    // Query is only used for match-history begIndex/endIndex pagination.
    if let Some(q) = query {
        let query_ok = q
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'=' | b'&' | b'_' | b'-' | b'.'));
        if !query_ok {
            return Err(anyhow!("LCU query has illegal characters"));
        }
    }
    Ok(())
}

async fn fetch_lcu_json(path: &str) -> Result<serde_json::Value> {
    validate_lcu_path(path)?;
    let lf = read_lockfile()?;
    let auth = format!("riot:{}", lf.password);
    let auth_b64 = B64.encode(auth.as_bytes());

    let tls = rustls_dangerous_config()?;
    let client = reqwest::Client::builder()
        .use_preconfigured_tls(tls)
        .timeout(Duration::from_secs(5))
        .connect_timeout(Duration::from_secs(2))
        .build()?;

    let url = format!("https://127.0.0.1:{}{}", lf.port, path);
    let resp = client
        .get(&url)
        .header("Authorization", format!("Basic {}", auth_b64))
        .send()
        .await
        .context("LCU GET request")?;
    if !resp.status().is_success() {
        return Err(anyhow!("LCU GET {} returned {}", path, resp.status()));
    }
    Ok(resp.json::<serde_json::Value>().await?)
}

async fn fetch_summoner_by_id(summoner_id: u64) -> Result<LcuSummonerLite> {
    let lf = read_lockfile()?;
    let auth = format!("riot:{}", lf.password);
    let auth_b64 = B64.encode(auth.as_bytes());

    let tls = rustls_dangerous_config()?;
    let client = reqwest::Client::builder()
        .use_preconfigured_tls(tls)
        .timeout(Duration::from_secs(5))
        .connect_timeout(Duration::from_secs(2))
        .build()?;

    let url = format!(
        "https://127.0.0.1:{}/lol-summoner/v2/summoners/{}",
        lf.port, summoner_id
    );
    let resp = client
        .get(&url)
        .header("Authorization", format!("Basic {}", auth_b64))
        .send()
        .await
        .context("LCU summoner-by-id request")?;
    if !resp.status().is_success() {
        return Err(anyhow!("LCU returned {}", resp.status()));
    }
    Ok(resp.json::<LcuSummonerLite>().await?)
}

async fn fetch_current_summoner() -> Result<LcuSummoner> {
    let lf = read_lockfile()?;
    let region = read_region().ok();
    let auth = format!("riot:{}", lf.password);
    let auth_b64 = B64.encode(auth.as_bytes());

    let tls = rustls_dangerous_config()?;
    let client = reqwest::Client::builder()
        .use_preconfigured_tls(tls)
        .timeout(Duration::from_secs(5))
        .connect_timeout(Duration::from_secs(2))
        .build()?;

    let url = format!(
        "https://127.0.0.1:{}/lol-summoner/v1/current-summoner",
        lf.port
    );
    let resp = client
        .get(&url)
        .header("Authorization", format!("Basic {}", auth_b64))
        .send()
        .await
        .context("LCU current-summoner request")?;
    if !resp.status().is_success() {
        return Err(anyhow!("LCU returned {}", resp.status()));
    }
    let mut s: LcuSummoner = resp.json().await.context("parse summoner")?;
    s.region = region;
    Ok(s)
}

fn read_region() -> Result<String> {
    // ProductSettings is in: <LeagueInstall>\Config\LeagueClientSettings.yaml or
    // %LOCALAPPDATA%\Riot Games\Riot Client\Data\RiotClientSettings.yaml
    // Easier: read from LeagueClientSettings.yaml
    use std::fs;
    let candidates = [format!(
        "{}\\Riot Games\\Riot Client\\Data\\RiotClientSettings.yaml",
        std::env::var("LOCALAPPDATA").unwrap_or_default()
    )];
    for path in candidates {
        if let Ok(content) = fs::read_to_string(&path) {
            // very small parse: look for "region:"
            for line in content.lines() {
                let l = line.trim();
                if let Some(rest) = l.strip_prefix("region:") {
                    return Ok(rest.trim().trim_matches('"').to_lowercase());
                }
            }
        }
    }
    Err(anyhow!("region not found"))
}

// ──────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────
//
// Pure-function tests only — anything involving IO (file reads, HTTPS,
// LCU WebSocket) needs an integration test harness or a running client.
// `cargo test --lib` runs these without any LoL session present.

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)] // unwrap/expect idiomatic in tests

    use super::*;

    #[test]
    fn parse_lockfile_canonical_format() {
        let lock = parse_lockfile_content("LeagueClient:12345:2999:abcdef:https")
            .expect("canonical format should parse");
        assert_eq!(lock.port, 2999);
        assert_eq!(lock.password, "abcdef");
    }

    #[test]
    fn parse_lockfile_trims_trailing_newline() {
        let lock = parse_lockfile_content("LeagueClient:12345:2999:abcdef:https\n")
            .expect("trailing newline should be stripped");
        assert_eq!(lock.port, 2999);
    }

    #[test]
    fn parse_lockfile_rejects_short_input() {
        assert!(parse_lockfile_content("only:three:fields").is_err());
    }

    #[test]
    fn parse_lockfile_rejects_non_numeric_port() {
        assert!(parse_lockfile_content("LeagueClient:pid:notaport:pw:https").is_err());
    }

    #[test]
    fn parse_lockfile_rejects_empty_password() {
        assert!(parse_lockfile_content("LeagueClient:12345:2999::https").is_err());
    }

    #[test]
    fn parse_lockfile_handles_extra_fields() {
        // Riot historically appended extra fields in some versions — we
        // ignore anything beyond field 4 instead of rejecting.
        let lock = parse_lockfile_content("LeagueClient:1:2999:pw:https:extra:more")
            .expect("extra fields should be tolerated");
        assert_eq!(lock.password, "pw");
    }

    #[test]
    fn validate_lcu_path_accepts_every_endpoint_we_call() {
        // The exact paths used across lcuPersonalData / lcuService / lobbyScout
        // / inGameDetection. A regression here would break a real feature.
        for p in [
            "/lol-summoner/v1/current-summoner",
            "/lol-match-history/v1/products/lol/abc-123-DEF/matches?begIndex=0&endIndex=20",
            "/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=5",
            "/lol-champion-mastery/v1/local-player/champion-mastery",
            "/lol-ranked/v1/current-ranked-stats",
            "/lol-champ-select/v1/session",
            "/lol-ranked/v1/ranked-stats/0a1b2c3d-4e5f-6789-abcd-ef0123456789",
            "/lol-gameflow/v1/session",
        ] {
            assert!(validate_lcu_path(p).is_ok(), "should accept: {p}");
        }
    }

    #[test]
    fn validate_lcu_path_rejects_attack_shapes() {
        for p in [
            "/riotclient/region-locale",            // non-/lol- root
            "/lol-summoner/../../riotclient/foo",    // traversal
            "/lol-summoner/v1//double-slash",         // smuggled //
            "/lol-summoner/v1/x@evil.com/y",          // userinfo injection
            "/lol-summoner/v1/x y",                    // whitespace
            "/lol-summoner/v1/x\\y",                  // backslash
            "https://evil.com/lol-x",                  // absolute URL (no leading /lol-)
            "/lol-match-history/v1/m?cb=http://evil", // illegal query chars (: /)
        ] {
            assert!(validate_lcu_path(p).is_err(), "should reject: {p}");
        }
    }
}
