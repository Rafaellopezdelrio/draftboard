mod lcu;

use lcu::{lcu_status, LcuState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    use tauri_plugin_sql::{Migration, MigrationKind};
    let migrations = vec![Migration {
        version: 1,
        description: "initial schema",
        sql: include_str!("../../src/db/schema.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![lcu_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
