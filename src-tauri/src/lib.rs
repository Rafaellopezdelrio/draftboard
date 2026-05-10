mod lcu;

use lcu::{
    lcu_apply_runes, lcu_current_summoner, lcu_get_json, lcu_status, lcu_summoner_by_id,
    LcuState,
};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use tauri::Manager as _;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    use tauri_plugin_sql::{Migration, MigrationKind};
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial schema",
            sql: include_str!("../../src/db/schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "aggregation tables",
            sql: include_str!("../../src/db/schema_v2.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "preferences",
            sql: include_str!("../../src/db/schema_v3.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "matchup tracking",
            sql: include_str!("../../src/db/schema_v4.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:lol-draft-advisor.db", migrations)
                .build(),
        )
        .manage(LcuState::default())
        .setup(|app| {
            lcu::spawn_watcher(app.handle().clone());

            // System tray with show/hide/quit
            let show = MenuItem::with_id(app, "show", "Mostrar", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Ocultar", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

            let _tray = TrayIconBuilder::new()
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

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            lcu_status,
            lcu_current_summoner,
            lcu_summoner_by_id,
            lcu_apply_runes,
            lcu_get_json
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
