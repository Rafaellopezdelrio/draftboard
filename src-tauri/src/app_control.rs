// App-lifecycle commands: restart, emergency reset, window centering, tray
// tooltip updates. Each is a thin shim over Tauri primitives that the
// frontend invokes from Settings / Diagnostics views.

use tauri::Manager as _;

/// Restart the running app — kills the current process and spawns a
/// fresh one with the same args. Used after DB restore (SQLite handle is
/// cached, new DB file isn't visible until reopen) and after critical
/// settings changes that need a clean boot. The auto-updater plugin
/// uses the same primitive internally.
#[tauri::command]
pub async fn restart_app(app: tauri::AppHandle) {
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
pub fn emergency_reset(app: &tauri::AppHandle) -> Result<(), String> {
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
pub async fn consume_reset_marker(app: tauri::AppHandle) -> Result<bool, String> {
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

/// Center the main window on the active monitor. Recovery action for
/// the "I dragged the window off-screen and now I can't reach it" case
/// — common with multi-monitor setups where the user disconnects the
/// second monitor while Draftboard was on it.
#[tauri::command]
pub async fn center_main_window(app: tauri::AppHandle) -> Result<(), String> {
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
pub async fn set_tray_tooltip(app: tauri::AppHandle, text: String) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_tooltip(Some(text)).map_err(|e| e.to_string())?;
    }
    Ok(())
}
