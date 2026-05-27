mod db;
mod lcu;

use db::{epoch_secs_to_ymd, ymd_to_epoch_secs};
use lcu::{
    lcu_apply_runes, lcu_apply_summoner_spells, lcu_current_summoner, lcu_get_json,
    lcu_push_item_set, lcu_status, lcu_summoner_by_id, live_client_all_game_data, LcuState,
};

// ============================================================================
// In-game overlay window control
// ============================================================================
// The "overlay" window is declared in tauri.conf.json (transparent, always
// on top, no decorations). It stays hidden until the LiveGame hook detects
// the user is in a real LoL match — then we show it as a corner widget.
//
// Click-through lets the cursor pass through the overlay's empty/transparent
// areas to the game underneath. When the user wants to interact with the
// overlay (drag, close, expand) we toggle click-through off briefly via a
// modifier key. Implementation uses Tauri's set_ignore_cursor_events.

#[tauri::command]
async fn overlay_set_visible(
    app: tauri::AppHandle,
    visible: bool,
) -> Result<(), String> {
    let win = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window not found".to_string())?;
    if visible {
        win.show().map_err(|e| e.to_string())?;
        // Re-assert always-on-top in case Windows lost it after focus changes.
        let _ = win.set_always_on_top(true);
    } else {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn overlay_set_clickthrough(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<(), String> {
    let win = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window not found".to_string())?;
    win.set_ignore_cursor_events(enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn overlay_set_position(
    app: tauri::AppHandle,
    x: i32,
    y: i32,
) -> Result<(), String> {
    use tauri::{PhysicalPosition, Position};
    let win = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window not found".to_string())?;
    win.set_position(Position::Physical(PhysicalPosition { x, y }))
        .map_err(|e| e.to_string())
}

/// Resize the overlay window to match the rendered content's bounding box.
/// Lets us "shrink-wrap" the window to the visible chip — pixels outside
/// the chip aren't part of any window, so clicks naturally fall through
/// to LoL underneath. Standard technique used by lightweight overlays
/// that don't want per-pixel hit-test logic.
#[tauri::command]
async fn overlay_set_size(
    app: tauri::AppHandle,
    width: u32,
    height: u32,
) -> Result<(), String> {
    use tauri::{LogicalSize, Size};
    let win = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window not found".to_string())?;
    // Clamp to a minimum so the window can never become zero-area
    // (Windows refuses 0×0 and Tauri panics). 40×40 = enough for a small
    // status dot if the content collapses.
    let w = width.max(40);
    let h = height.max(40);
    win.set_size(Size::Logical(LogicalSize {
        width: w as f64,
        height: h as f64,
    }))
    .map_err(|e| e.to_string())
}

/// Find the running LoL game window's HWND. Riot's IN-GAME window uses
/// class `RiotWindowClass` and title `"League of Legends (TM) Client"`;
/// the LAUNCHER/lobby uses different class+title. We always prefer the
/// game window for anchoring (that's where the player is actually
/// playing); fall back to the launcher window when no game is running so
/// the overlay still tracks something useful in champ select.
#[cfg(windows)]
fn find_lol_hwnd() -> Option<windows::Win32::Foundation::HWND> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{FindWindowW, IsIconic, IsWindowVisible};

    // Candidate matchers ordered by priority. For each, try class name
    // first (most reliable — survives locale + title changes), then exact
    // title match.
    let candidates: &[(&str, &str)] = &[
        // In-game (real match running)
        ("RiotWindowClass", "League of Legends (TM) Client"),
        // Some patches drop the "(TM) Client" suffix
        ("RiotWindowClass", "League of Legends"),
        // Launcher / client (champ select, lobby, etc.)
        ("RCLIENT", "League of Legends"),
    ];

    let try_find = |class: Option<&str>, title: Option<&str>| -> Option<HWND> {
        let class_buf: Option<Vec<u16>> =
            class.map(|s| format!("{s}\0").encode_utf16().collect());
        let title_buf: Option<Vec<u16>> =
            title.map(|s| format!("{s}\0").encode_utf16().collect());
        let class_ptr = class_buf
            .as_ref()
            .map(|v| PCWSTR::from_raw(v.as_ptr()))
            .unwrap_or(PCWSTR::null());
        let title_ptr = title_buf
            .as_ref()
            .map(|v| PCWSTR::from_raw(v.as_ptr()))
            .unwrap_or(PCWSTR::null());
        let hwnd: HWND = unsafe { FindWindowW(class_ptr, title_ptr) }.ok()?;
        if hwnd.0.is_null() {
            return None;
        }
        if !unsafe { IsWindowVisible(hwnd) }.as_bool() {
            return None;
        }
        if unsafe { IsIconic(hwnd) }.as_bool() {
            return None;
        }
        Some(hwnd)
    };

    for (class, title) in candidates {
        if let Some(h) = try_find(Some(class), Some(title)) {
            return Some(h);
        }
        // Title-only fallback for the same candidate
        if let Some(h) = try_find(None, Some(title)) {
            return Some(h);
        }
        // Class-only fallback (matches ANY visible LoL window with that class)
        if let Some(h) = try_find(Some(class), None) {
            return Some(h);
        }
    }
    None
}

/// Returns the LoL window's screen rect as `{x, y, width, height}` or
/// `null` (JSON) when the client isn't running / not visible.
///
/// Used by the overlay positioning code to anchor the widget to the
/// top-left corner of LoL's window and follow it when the user drags the
/// game window across monitors. Same Win32 read-only inspection as the
/// mode detector — no injection, no memory reads.
#[tauri::command]
async fn get_lol_window_rect() -> Result<Option<serde_json::Value>, String> {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::RECT;
        use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

        let hwnd = match find_lol_hwnd() {
            Some(h) => h,
            None => return Ok(None),
        };
        let mut rect = RECT::default();
        if unsafe { GetWindowRect(hwnd, &mut rect) }.is_err() {
            return Ok(None);
        }

        Ok(Some(serde_json::json!({
            "x": rect.left,
            "y": rect.top,
            "width": rect.right - rect.left,
            "height": rect.bottom - rect.top,
        })))
    }
    #[cfg(not(windows))]
    {
        Ok(None)
    }
}

/// Restart the running app — kills the current process and spawns a
/// fresh one with the same args. Used after DB restore (SQLite handle is
/// cached, new DB file isn't visible until reopen) and after critical
/// settings changes that need a clean boot. The auto-updater plugin
/// uses the same primitive internally.
#[tauri::command]
async fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

/// Wipe local user state to first-launch defaults. Triggered by the
/// `--reset` CLI flag on app launch. Removes:
///   - `lol-draft-advisor.db` (the SQLite DB — also kept as a safety
///     copy at `lol-draft-advisor.db.pre-reset` so the user can
///     recover by hand if they hit `--reset` by mistake)
///   - `localStorage` is also blown away by the frontend on boot when
///     the same flag is detected; this fn only handles the OS side.
///
/// Backup files (`backups/auto-*.db`) are PRESERVED — they're the
/// user's actual data and we want them available for restore-from-
/// backup after a reset.
fn emergency_reset(app: &tauri::AppHandle) -> Result<(), String> {
    use std::fs;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    let db = app_data.join("lol-draft-advisor.db");
    if db.exists() {
        let safety = app_data.join("lol-draft-advisor.db.pre-reset");
        let _ = fs::copy(&db, &safety);
        fs::remove_file(&db).map_err(|e| format!("remove db: {e}"))?;
    }
    // Touch a marker file so the JS side knows to also clear localStorage
    // on this boot. The marker is consumed (deleted) by the frontend so
    // subsequent launches don't keep wiping prefs.
    let marker = app_data.join(".reset-pending");
    fs::write(&marker, b"1").ok();
    Ok(())
}

/// Frontend-callable: returns true and CONSUMES the reset marker created
/// by `emergency_reset`. App.tsx reads this at boot and, when true,
/// also clears localStorage before any pref/Sentry init reads it.
#[tauri::command]
async fn consume_reset_marker(app: tauri::AppHandle) -> Result<bool, String> {
    use std::fs;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    let marker = app_data.join(".reset-pending");
    if marker.exists() {
        let _ = fs::remove_file(&marker);
        return Ok(true);
    }
    Ok(false)
}

/// Rolling auto-backup of the SQLite DB. Called from `setup()` BEFORE
/// the SQL plugin opens its first connection, so the snapshot is always
/// pre-migration. Behaviour:
///
///   1. If no DB file exists yet (first launch), no-op.
///   2. Copy `lol-draft-advisor.db` → `backups/auto-{YYYY-MM-DD}.db`
///      inside the app data dir. Idempotent per day — running multiple
///      times the same day overwrites that day's snapshot.
///   3. Prune backups older than 5 days so we don't fill the disk.
///
/// User-facing exposure: Settings → "Mis datos" lists these auto-backups
/// alongside manual ones (future work).
fn rolling_db_backup(app: &tauri::AppHandle) -> Result<(), String> {
    use std::fs;

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app data dir: {e}"))?;
    let db_path = app_data.join("lol-draft-advisor.db");
    if !db_path.exists() {
        return Ok(()); // first launch — nothing to back up yet
    }

    let backup_dir = app_data.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|e| format!("mkdir backups: {e}"))?;

    // YYYY-MM-DD via a tiny home-grown formatter so we don't pull `chrono`
    // for one line. UNIX epoch days = floor(secs / 86_400).
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("clock: {e}"))?
        .as_secs();
    let date_label = epoch_secs_to_ymd(now);
    let snapshot = backup_dir.join(format!("auto-{date_label}.db"));
    fs::copy(&db_path, &snapshot).map_err(|e| format!("copy: {e}"))?;

    // Prune anything older than 5 days. Conservative — small files, low
    // cost — and gives the user a full work-week rollback window.
    const KEEP_DAYS: u64 = 5;
    let cutoff = now.saturating_sub(KEEP_DAYS * 86_400);
    if let Ok(entries) = fs::read_dir(&backup_dir) {
        for e in entries.flatten() {
            let p = e.path();
            let Some(name) = p.file_name().and_then(|n| n.to_str()) else { continue };
            if !name.starts_with("auto-") || !name.ends_with(".db") {
                continue;
            }
            if let Ok(meta) = e.metadata() {
                if let Ok(modified) = meta.modified() {
                    if let Ok(age_secs) =
                        std::time::SystemTime::now().duration_since(modified)
                    {
                        if age_secs.as_secs() > KEEP_DAYS * 86_400 {
                            let _ = fs::remove_file(&p);
                            continue;
                        }
                    }
                }
            }
            // Belt-and-suspenders: also check name-encoded date.
            if let Some(ymd) = name
                .strip_prefix("auto-")
                .and_then(|s| s.strip_suffix(".db"))
            {
                if let Some(ymd_secs) = ymd_to_epoch_secs(ymd) {
                    if ymd_secs < cutoff {
                        let _ = fs::remove_file(&p);
                    }
                }
            }
        }
    }
    Ok(())
}

/// List the auto-rolling DB backups currently on disk. Surfaced in
/// Settings → Mis datos so the user can restore a specific snapshot
/// without using a file picker. Returns newest first.
#[tauri::command]
async fn db_list_auto_backups(
    app: tauri::AppHandle,
) -> Result<Vec<serde_json::Value>, String> {
    use std::fs;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    let backup_dir = app_data.join("backups");
    if !backup_dir.exists() {
        return Ok(vec![]);
    }
    let mut entries: Vec<(String, String, u64, u64)> = Vec::new();
    for e in fs::read_dir(&backup_dir).map_err(|e| format!("readdir: {e}"))? {
        let Ok(entry) = e else { continue };
        let p = entry.path();
        let Some(name) = p.file_name().and_then(|n| n.to_str()) else { continue };
        if !name.starts_with("auto-") || !name.ends_with(".db") {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let date_label = name
            .strip_prefix("auto-")
            .and_then(|s| s.strip_suffix(".db"))
            .unwrap_or("")
            .to_string();
        let modified_secs = meta
            .modified()
            .ok()
            .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        entries.push((
            p.to_string_lossy().into_owned(),
            date_label,
            meta.len(),
            modified_secs,
        ));
    }
    // Newest first by modified time.
    entries.sort_by(|a, b| b.3.cmp(&a.3));
    Ok(entries
        .into_iter()
        .map(|(path, date_label, size, modified)| {
            serde_json::json!({
                "path": path,
                "dateLabel": date_label,
                "sizeBytes": size,
                "modifiedSecs": modified,
            })
        })
        .collect())
}

/// Copy the SQLite DB file from the app's data dir to a user-chosen
/// target path. Used by Settings → "Exportar DB" so users can save a
/// backup before risky operations (upgrades, factory reset, machine
/// Pre-boot integrity check + auto-quarantine.
///
/// Runs from `setup()` BEFORE tauri-plugin-sql opens its handle. Uses
/// rusqlite (bundled) for a sync open + `PRAGMA integrity_check`. If
/// the DB is missing, fresh (no exists), or passes the check, no-op.
/// If the check fails OR the open errors out, renames the file to
/// `corrupt-{epoch}.db` and removes sidecars so the SQL plugin will
/// create a fresh DB on its first load.
///
/// Side effects: writes a `recovery-marker.json` next to the DB if a
/// quarantine happened. The frontend reads + consumes this on boot to
/// show the user a toast explaining their data was reset.
fn preboot_db_integrity_check_and_quarantine(app: &tauri::AppHandle) -> Result<(), String> {
    use std::fs;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app data dir: {e}"))?;
    let db_path = app_data.join("lol-draft-advisor.db");
    if !db_path.exists() {
        // First launch — nothing to check.
        return Ok(());
    }

    // Try open + integrity_check. Both failures are treated as
    // "corrupt enough to quarantine" — better safe than letting the
    // SQL plugin hit it and throw forever.
    //
    // Also: switch the DB to WAL journal mode if it isn't already.
    // WAL mode persists in the DB file header, so this only needs to
    // run once per file — subsequent opens automatically use WAL.
    // Benefits:
    //   - Concurrent reads + 1 write without blocking each other
    //     (rollback journal blocks readers during writes).
    //   - ~30% faster on write-heavy workloads (match sync, draft
    //     logging, agg writes).
    //   - WAL files can be checkpointed lazily, fewer fsync calls.
    // `synchronous=NORMAL` is the WAL-recommended setting; full sync
    // is overkill given we already have the rolling backup safety net.
    let check_result: Result<(), String> = (|| {
        let conn = rusqlite::Connection::open(&db_path)
            .map_err(|e| format!("open: {e}"))?;
        let s: String = conn
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .map_err(|e| format!("query: {e}"))?;
        if s != "ok" {
            return Err(format!("integrity_check returned: {s}"));
        }
        // Force WAL mode + NORMAL sync. Idempotent — no-op if already set.
        // We swallow inner errors because they're non-fatal: the DB still
        // works in rollback journal mode, just slower.
        let _ = conn.pragma_update(None, "journal_mode", &"WAL");
        let _ = conn.pragma_update(None, "synchronous", &"NORMAL");
        Ok(())
    })();

    if check_result.is_ok() {
        return Ok(());
    }

    let reason = check_result.unwrap_err();
    eprintln!("[db-integrity] CORRUPT: {reason} — quarantining");

    let epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("clock: {e}"))?
        .as_secs();
    let dest = app_data.join(format!("corrupt-{epoch}.db"));
    fs::rename(&db_path, &dest).map_err(|e| format!("rename failed: {e}"))?;
    // Drop sidecars so SQLite can reopen cleanly without picking up
    // dirty WAL/shm state from the corrupt file.
    for ext in &["-shm", "-wal"] {
        let sidecar = app_data.join(format!("lol-draft-advisor.db{ext}"));
        if sidecar.exists() {
            let _ = fs::remove_file(&sidecar);
        }
    }

    // Marker file so the frontend can surface a one-time toast on the
    // next boot tick. Simple JSON to avoid pulling extra deps for a
    // 3-field payload.
    let marker = app_data.join("recovery-marker.json");
    let payload = format!(
        "{{\"epoch\":{epoch},\"reason\":{:?},\"quarantinedTo\":{:?}}}",
        reason,
        dest.display().to_string()
    );
    let _ = fs::write(&marker, payload);

    Ok(())
}

/// Consume the recovery marker if present. Returns Some(json) on first
/// call (and deletes the file), None on subsequent calls. Frontend
/// invokes this once at boot to decide whether to show the user a
/// "your data was reset" toast.
#[tauri::command]
async fn consume_db_recovery_marker(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use std::fs;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app data dir: {e}"))?;
    let marker = app_data.join("recovery-marker.json");
    if !marker.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&marker).map_err(|e| format!("read marker: {e}"))?;
    let _ = fs::remove_file(&marker);
    Ok(Some(contents))
}

/// Quarantine a corrupt DB file by renaming it to
/// `corrupt-{epoch}.db` in the app data dir. Called from the frontend
/// when `Database.load` fails — moving the file aside lets the SQL
/// plugin recreate a fresh DB on the next `load()` attempt instead of
/// throwing forever. The corrupt file is kept (not deleted) so the
/// user can recover data later if needed.
///
/// Returns the path to the quarantined file (for logging / user toast)
/// or an error if the file doesn't exist / can't be renamed.
#[tauri::command]
async fn db_quarantine_corrupt(app: tauri::AppHandle) -> Result<String, String> {
    use std::fs;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app data dir: {e}"))?;
    let source = app_data.join("lol-draft-advisor.db");
    if !source.exists() {
        // Nothing to quarantine — fresh boot or already moved.
        return Err("DB file not found, nothing to quarantine".to_string());
    }
    let epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("clock: {e}"))?
        .as_secs();
    let dest = app_data.join(format!("corrupt-{epoch}.db"));
    fs::rename(&source, &dest).map_err(|e| format!("rename failed: {e}"))?;
    // Also clean up sidecar files (-shm, -wal) so SQLite can reopen
    // cleanly. These are journal artefacts that can themselves be
    // corrupt and prevent a fresh DB from opening.
    for ext in &["-shm", "-wal"] {
        let sidecar = app_data.join(format!("lol-draft-advisor.db{ext}"));
        if sidecar.exists() {
            let _ = fs::remove_file(&sidecar);
        }
    }
    Ok(dest.display().to_string())
}

/// migration).
///
/// We don't expose the source path or let the frontend pick the source —
/// it's always the app's own DB. The target comes from a native file
/// picker so we never write to arbitrary locations.
#[tauri::command]
async fn db_backup_to(
    app: tauri::AppHandle,
    target_path: String,
) -> Result<u64, String> {
    use std::fs;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("can't resolve app data dir: {e}"))?;
    let source = app_data.join("lol-draft-advisor.db");
    if !source.exists() {
        return Err(format!("DB file not found at {}", source.display()));
    }
    let bytes = fs::copy(&source, &target_path)
        .map_err(|e| format!("copy failed: {e}"))?;
    Ok(bytes)
}

/// Replace the app's SQLite DB with a user-chosen file. The new file is
/// validated as a SQLite database (first 16 bytes match the magic header)
/// before we overwrite. After restore the user MUST restart the app to
/// reopen the DB connection — we surface that in the UI.
#[tauri::command]
async fn db_restore_from(
    app: tauri::AppHandle,
    source_path: String,
) -> Result<u64, String> {
    use std::fs;
    use std::io::Read;

    // Validate magic header. SQLite 3 files start with "SQLite format 3\0".
    let mut f =
        fs::File::open(&source_path).map_err(|e| format!("can't open source: {e}"))?;
    let mut header = [0u8; 16];
    f.read_exact(&mut header)
        .map_err(|e| format!("can't read header: {e}"))?;
    if &header[..15] != b"SQLite format 3" {
        return Err("Not a valid SQLite database file".to_string());
    }

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("can't resolve app data dir: {e}"))?;
    fs::create_dir_all(&app_data)
        .map_err(|e| format!("can't create app data dir: {e}"))?;
    let target = app_data.join("lol-draft-advisor.db");

    // Keep a safety copy of the CURRENT DB before overwriting — gives
    // the user one undo hop if the imported file turns out to be wrong.
    if target.exists() {
        let safety = app_data.join("lol-draft-advisor.db.pre-restore");
        let _ = fs::copy(&target, &safety);
    }

    let bytes = fs::copy(&source_path, &target)
        .map_err(|e| format!("copy failed: {e}"))?;
    Ok(bytes)
}

/// Detect which window mode the running LoL client is in. Returns one of:
///   - "not-running"          : no LoL window found
///   - "windowed"             : standard windowed (has WS_CAPTION title bar)
///   - "borderless"           : borderless fullscreen (no caption, covers
///                              monitor, but standard Win32 window — overlays
///                              CAN sit on top)
///   - "fullscreen-exclusive" : exclusive fullscreen via DXGI (overlay
///                              IMPOSSIBLE without injection — we tell the
///                              user to switch to Borderless)
///
/// Detection logic mirrors what Mobalytics/Itero do (visible in their JS
/// bundle): iterate top-level windows, match by title "League of Legends",
/// then inspect window style flags.
///
/// Non-bannable: pure Win32 read-only inspection, no process injection, no
/// memory reads, no DLL hook. The same calls any standard window manager
/// or accessibility tool makes.
#[tauri::command]
async fn detect_lol_window_mode() -> Result<String, String> {
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, GWL_STYLE, WS_CAPTION,
        };

        // Reuse the same Win32 finder as the positioning code so we always
        // classify the SAME window we're anchoring to. Previously the mode
        // detector used a title-only match that found the launcher; once
        // the game started, the title changed and we'd report "not-running"
        // even though LoL was clearly open.
        let hwnd = match find_lol_hwnd() {
            Some(h) => h,
            None => return Ok("not-running".to_string()),
        };

        // Read window style flags. WS_CAPTION present = windowed (title bar).
        // No caption = borderless or fullscreen-exclusive — we lump them
        // together as "borderless" since true exclusive detection needs
        // DXGI swap-chain inspection (out of scope) and the user advice
        // is the same in either case.
        let style = unsafe { GetWindowLongPtrW(hwnd, GWL_STYLE) };
        let has_caption = (style & (WS_CAPTION.0 as isize)) != 0;
        if has_caption {
            Ok("windowed".to_string())
        } else {
            Ok("borderless".to_string())
        }
    }
    #[cfg(not(windows))]
    {
        Ok("not-running".to_string())
    }
}

/// Force the overlay window to the absolute top of the Z-order via
/// SetWindowPos(HWND_TOPMOST). Tauri's `set_always_on_top(true)` only
/// asserts once; Windows demotes us as soon as the LoL window grabs focus.
///
/// Mobalytics/Itero achieve this via the Overwolf SDK; we call the same
/// Win32 primitive directly. Non-bannable — no game memory access, no
/// process injection, just a standard window-manager call any Win32 app
/// can make.
///
/// No-op on non-Windows platforms.
#[tauri::command]
async fn overlay_assert_topmost(app: tauri::AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window not found".to_string())?;

    #[cfg(windows)]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        };

        // CRITICAL: do NOT pass SWP_SHOWWINDOW here. A previous version did
        // and it forced the overlay back to visible every 1s, even after
        // setOverlayVisible(false) had hidden it. Result: the overlay
        // permanently floated over the Windows taskbar with clickthrough
        // OFF, swallowing every click in its rectangle. Visibility is
        // owned by setOverlayVisible — this command ONLY re-asserts the
        // z-order via HWND_TOPMOST, nothing else.
        let hwnd: HWND = win.hwnd().map_err(|e| e.to_string())?;
        unsafe {
            SetWindowPos(
                hwnd,
                Some(HWND_TOPMOST),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            )
            .map_err(|e| e.to_string())?;
        }
    }
    #[cfg(not(windows))]
    {
        // Other platforms: Tauri's own helper is the best we can do.
        let _ = win.set_always_on_top(true);
    }
    Ok(())
}

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use tauri::Manager as _;

/// Center the main window on the active monitor. Recovery action for
/// the "I dragged the window off-screen and now I can't reach it" case
/// — common with multi-monitor setups where the user disconnects the
/// second monitor while Draftboard was on it.
#[tauri::command]
async fn center_main_window(app: tauri::AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    win.center().map_err(|e| e.to_string())
}

/// Update the system tray tooltip with a live health string ("LCU: OK ·
/// Worker: OK"). Called by the frontend at ~5s cadence from the
/// existing diagnostic poll loop. Keeps the UX promise "hover the tray
/// icon to see if everything's reachable" without needing a separate
/// always-on background watcher in Rust.
#[tauri::command]
async fn set_tray_tooltip(app: tauri::AppHandle, text: String) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_tooltip(Some(text)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Install a custom panic hook that pipes Rust panics through `log::error!`
/// so they end up in the rotated draftboard.log file alongside frontend
/// JS errors. Without this, panics print to stderr and vanish — invisible
/// to users + impossible to triage from a bug report.
///
/// Falls back to the default hook after logging so the panic still
/// crashes the thread (we don't want to silently swallow corruption).
fn install_panic_logger() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "<unknown>".into());
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| (*s).to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<non-string panic>".into());
        log::error!("[PANIC] at {location}: {payload}");
        default_hook(info);
    }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_logger();
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    // SQLite migrations. Each file lives under `src/db/migrations/`
    // following the `NNN_name.sql` convention so the order is encoded
    // in the filename. tauri-plugin-sql tracks applied versions in
    // `__db_migrations` and only runs new ones.
    //
    // Adding a new migration:
    //   1. Drop a `00X_description.sql` in src/db/migrations/.
    //   2. Append a Migration entry below with version = X.
    //   3. NEVER edit applied migrations — append a new one instead.
    use tauri_plugin_sql::{Migration, MigrationKind};
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial schema",
            sql: include_str!("../../src/db/migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "aggregation tables",
            sql: include_str!("../../src/db/migrations/002_aggregation_tables.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "preferences",
            sql: include_str!("../../src/db/migrations/003_preferences.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "matchup tracking",
            sql: include_str!("../../src/db/migrations/004_matchup_tracking.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "ai memory + lesson plans + ai guides",
            sql: include_str!("../../src/db/migrations/005_ai_memory.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "ai matchup tips cache",
            sql: include_str!("../../src/db/migrations/006_ai_matchup_tips_cache.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        // Auto-update: pulls signed manifest from our CF Worker, verifies
        // signature against the embedded public key, downloads + replaces
        // the binary. Frontend triggers the check via the updater plugin's
        // JS API on app startup.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Autostart: registers under HKCU\Software\Microsoft\Windows\
        // CurrentVersion\Run on Windows. User toggles via Settings. We
        // arg with `--minimized` so we boot straight to the tray and
        // don't steal focus on every Windows login.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        // Persistent logging: rotates daily, keeps 7 days of history. Both
        // Rust panics + JS `console.log` (when bridged) end up here.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .max_file_size(5_000_000) // 5MB per file
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("draftboard".into()),
                    }),
                ])
                .build(),
        )
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:lol-draft-advisor.db", migrations)
                .build(),
        )
        .manage(LcuState::default())
        .setup(|app| {
            // Emergency reset escape hatch. If the user launched with
            // `--reset` (e.g. `Draftboard.exe --reset` from a CMD prompt
            // when the app boots into a broken state), wipe prefs and
            // the SQL DB BEFORE any plugin opens them. This is the last
            // line of defence for "app crashes on boot because of a
            // corrupt pref" — without it the user would have to dig
            // into %APPDATA% manually.
            //
            // We still keep the rolling DB backup that ran earlier, so
            // the user can restore later if they reset by mistake.
            let args: Vec<String> = std::env::args().collect();
            if args.iter().any(|a| a == "--reset") {
                if let Err(e) = emergency_reset(app.handle()) {
                    eprintln!("[reset] emergency reset failed: {e}");
                }
            }

            // Pre-boot SQLite integrity check. tauri-plugin-sql opens the
            // DB lazily on the first frontend Database.load() call —
            // we run our own rusqlite open + PRAGMA integrity_check
            // RIGHT HERE so we can quarantine a corrupt file by rename
            // (no file-lock conflict with the plugin). Previous
            // TS-side recovery couldn't rename because the plugin
            // already held the handle by the time it ran.
            if let Err(e) = preboot_db_integrity_check_and_quarantine(app.handle()) {
                eprintln!("[db-integrity] pre-boot check error (non-fatal): {e}");
            }

            // Rolling auto-backup of the SQLite DB on every boot. Runs
            // BEFORE the first DB connection so the snapshot is always
            // pre-migration. Keeps the last 5 days of snapshots —
            // gives users a one-click rollback if a migration corrupts
            // data or a new build introduces a bad schema change.
            //
            // Failures here are silent (logged only) — we never want
            // backup logic to block app startup. The user can still
            // boot, see their data, and manually export from Settings.
            if let Err(e) = rolling_db_backup(app.handle()) {
                eprintln!("[db-backup] rolling snapshot failed: {e}");
            }

            lcu::spawn_watcher(app.handle().clone());

            // System tray with show/hide/quit
            let show = MenuItem::with_id(app, "show", "Mostrar", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Ocultar", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Intercept the main window's close button so X → hide-to-tray
            // instead of quit. The user explicitly quits via tray menu
            // "Salir" or Ctrl+Shift+Q. Standard Discord/Mobalytics UX —
            // overlay stays running so we don't lose the in-game widget.
            if let Some(main_win) = app.get_webview_window("main") {
                let main_clone = main_win.clone();
                main_win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // Prevent default (quit) and hide instead.
                        api.prevent_close();
                        let _ = main_clone.hide();
                    }
                });
            }

            // Boot-minimized flag: when launched with `--minimized` (from
            // autostart on Windows login), don't pop the window up.
            let argv: Vec<String> = std::env::args().collect();
            if argv.iter().any(|a| a == "--minimized") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            lcu_status,
            lcu_current_summoner,
            lcu_summoner_by_id,
            lcu_apply_runes,
            lcu_apply_summoner_spells,
            lcu_push_item_set,
            lcu_get_json,
            live_client_all_game_data,
            overlay_set_visible,
            overlay_set_clickthrough,
            overlay_set_position,
            overlay_set_size,
            overlay_assert_topmost,
            detect_lol_window_mode,
            get_lol_window_rect,
            db_backup_to,
            db_restore_from,
            db_list_auto_backups,
            db_quarantine_corrupt,
            consume_db_recovery_marker,
            restart_app,
            consume_reset_marker,
            center_main_window,
            set_tray_tooltip
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
