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
struct Lockfile {
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
        loop {
            match try_connect(&app).await {
                Ok(()) => {
                    update_status(&app, false, Some("disconnected".into())).await;
                }
                Err(e) => {
                    update_status(&app, false, Some(e.to_string())).await;
                }
            }
            sleep(Duration::from_secs(3)).await;
        }
    });
}

async fn try_connect(app: &AppHandle) -> Result<()> {
    let lf = read_lockfile()?;
    let auth = format!("riot:{}", lf.password);
    let auth_b64 = B64.encode(auth.as_bytes());

    let url = format!("wss://127.0.0.1:{}/", lf.port);
    let mut req = url.into_client_request()?;
    req.headers_mut()
        .insert("Authorization", format!("Basic {}", auth_b64).parse()?);

    // The LCU uses a self-signed cert. Disable verification only against localhost.
    let tls = rustls_dangerous_config()?;
    let connector = Connector::Rustls(std::sync::Arc::new(tls));

    let (mut stream, _) = tokio_tungstenite::connect_async_tls_with_config(
        req,
        None,
        false,
        Some(connector),
    )
    .await
    .context("LCU websocket connect")?;

    update_status(app, true, None).await;

    // Subscribe to champion select session updates.
    let sub = serde_json::to_string(&serde_json::json!([
        5,
        "OnJsonApiEvent_lol-champ-select_v1_session"
    ]))?;
    stream.send(Message::Text(sub.into())).await?;

    while let Some(msg) = stream.next().await {
        let msg = match msg {
            Ok(m) => m,
            Err(_) => break,
        };
        if let Message::Text(txt) = msg {
            if let Ok(val) = serde_json::from_str::<Value>(&txt) {
                if let Some(payload) = val.get(2) {
                    let _ = app.emit("lcu:champ-select", payload);
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
    let _ = app.emit(
        "lcu:status",
        LcuStatus {
            connected,
            reason,
        },
    );
}

fn read_lockfile() -> Result<Lockfile> {
    let candidates = lockfile_candidates();
    for path in candidates {
        if let Ok(content) = std::fs::read_to_string(&path) {
            // Format: LeagueClient:PID:PORT:PASSWORD:PROTOCOL
            let parts: Vec<&str> = content.split(':').collect();
            if parts.len() >= 4 {
                let port: u16 = parts[2].parse().context("parse lockfile port")?;
                let password = parts[3].to_string();
                return Ok(Lockfile { port, password });
            }
        }
    }
    Err(anyhow!("LoL client lockfile not found"))
}

fn lockfile_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    // Common Windows install paths
    let drives = ["C", "D", "E", "F"];
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
    fetch_summoner_by_id(summoner_id).await.map_err(|e| e.to_string())
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

    let editable = pages
        .iter()
        .find(|p| p.get("isEditable").and_then(|v| v.as_bool()).unwrap_or(false));

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

async fn fetch_summoner_by_id(summoner_id: u64) -> Result<LcuSummonerLite> {
    let lf = read_lockfile()?;
    let auth = format!("riot:{}", lf.password);
    let auth_b64 = B64.encode(auth.as_bytes());

    let tls = rustls_dangerous_config()?;
    let client = reqwest::Client::builder()
        .use_preconfigured_tls(tls)
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
        .build()?;

    let url = format!("https://127.0.0.1:{}/lol-summoner/v1/current-summoner", lf.port);
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
    let candidates = [
        format!("{}\\Riot Games\\Riot Client\\Data\\RiotClientSettings.yaml", std::env::var("LOCALAPPDATA").unwrap_or_default()),
    ];
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
