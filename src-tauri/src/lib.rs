// Tauri entry point. Owns the application bootstrap: panic hook,
// migration list, plugin wiring, system tray, and the master list of
// `#[tauri::command]`s exposed to the frontend.
//
// All command implementations live in topic-specific modules:
//   - lcu.rs          : LCU + Live Client API bridge
//   - overlay.rs      : transparent-overlay window + LoL window inspection
//   - app_control.rs  : restart / reset / window centering / tray tooltip
//   - db.rs           : date helpers (epoch ↔ YYYY-MM-DD) used by db_admin
//   - db_admin.rs     : SQLite backup / restore / integrity / quarantine
//   - panic_logger.rs : Rust panic → log::error bridge
//
// Adding a new command:
//   1. Add `pub async fn …` with `#[tauri::command]` in the right module.
//   2. Add it to the `use` block below.
//   3. Add its name to the `tauri::generate_handler!` list inside `run()`.

mod app_control;
mod db;
mod db_admin;
mod lcu;
mod overlay;
mod panic_logger;

use app_control::{
    center_main_window, consume_reset_marker, emergency_reset, restart_app, set_tray_tooltip,
};
use db_admin::{
    consume_db_recovery_marker, db_backup_to, db_list_auto_backups, db_quarantine_corrupt,
    db_restore_from, preboot_db_integrity_check_and_quarantine, rolling_db_backup,
};
use lcu::{
    lcu_apply_runes, lcu_apply_summoner_spells, lcu_current_summoner, lcu_get_json,
    lcu_push_item_set, lcu_status, lcu_summoner_by_id, live_client_all_game_data, LcuState,
};
use overlay::{
    detect_lol_window_mode, get_lol_window_rect, overlay_assert_topmost, overlay_set_clickthrough,
    overlay_set_position, overlay_set_size, overlay_set_visible,
};
use panic_logger::install_panic_logger;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager as _;

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
        Migration {
            version: 7,
            description: "aggregate patch indexes (meta + counter)",
            sql: include_str!("../../src/db/migrations/007_aggregate_patch_indexes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "ai chat history (conversations + messages)",
            sql: include_str!("../../src/db/migrations/008_chat_history.sql"),
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

            let default_icon = app
                .default_window_icon()
                .ok_or("no default window icon configured")?
                .clone();
            let _tray = TrayIconBuilder::with_id("main")
                .icon(default_icon)
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
        .unwrap_or_else(|e| {
            log::error!("fatal: tauri runtime exited: {e}");
            std::process::exit(1);
        });
}
