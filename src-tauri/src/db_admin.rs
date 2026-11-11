// SQLite admin / backup / recovery commands. The "data ops" plumbing
// (CRUD, queries) lives on the frontend via tauri-plugin-sql — this
// module owns lifecycle: rolling auto-backups, pre-boot integrity
// checks + quarantine, user-driven backup/restore, and the recovery
// marker handshake with the JS layer.
//
// All of these run with rusqlite (bundled) so we have direct file-level
// access BEFORE tauri-plugin-sql opens its handle.

use tauri::Manager as _;

use crate::db::{epoch_secs_to_ymd, ymd_to_epoch_secs};

/// sqlx (inside tauri-plugin-sql) refuses to open a DB whose recorded
/// migration checksum differs from the embedded SQL: "migration N was
/// previously applied but has been modified". Builds made from a CRLF
/// checkout embedded CRLF SQL and later ones LF, so the same migration can be
/// recorded with either checksum (SHA-384 of the SQL text). When the recorded
/// checksum is exactly the line-ending twin of the embedded SQL, rewrite it to
/// the embedded one. Any real content change is left alone for sqlx to report.
pub fn repair_migration_line_endings<'a>(
    conn: &rusqlite::Connection,
    migrations: impl IntoIterator<Item = (i64, &'a str)>,
) -> rusqlite::Result<usize> {
    use sha2::{Digest, Sha384};
    let has_table: i64 = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'",
        [],
        |row| row.get(0),
    )?;
    if has_table == 0 {
        return Ok(0);
    }
    let mut fixed = 0;
    for (version, sql) in migrations {
        let lf = sql.replace("\r\n", "\n");
        let twin = if sql.contains("\r\n") {
            lf
        } else {
            lf.replace('\n', "\r\n")
        };
        if twin == sql {
            continue; // no line breaks: nothing a line-ending change could explain
        }
        let embedded = Sha384::digest(sql.as_bytes()).to_vec();
        let twin = Sha384::digest(twin.as_bytes()).to_vec();
        fixed += conn.execute(
            "UPDATE _sqlx_migrations SET checksum = ?1 WHERE version = ?2 AND checksum = ?3",
            rusqlite::params![embedded, version, twin],
        )?;
    }
    Ok(fixed)
}

/// True for a rolling auto-backup filename (`auto-YYYY-MM-DD.db`).
fn is_auto_backup_name(name: &str) -> bool {
    name.starts_with("auto-") && name.ends_with(".db")
}

/// True when an `auto-YYYY-MM-DD.db` snapshot's encoded date is strictly older
/// than `cutoff_secs` (epoch) — i.e. it should be pruned. Extracted pure so the
/// "which backups get deleted" decision (the data-loss-adjacent path) is
/// unit-testable without a filesystem or clock. Unparseable names return false
/// (keep — never delete a snapshot we can't confidently date).
fn backup_expired_by_name(name: &str, cutoff_secs: u64) -> bool {
    name.strip_prefix("auto-")
        .and_then(|s| s.strip_suffix(".db"))
        .and_then(ymd_to_epoch_secs)
        .map(|secs| secs < cutoff_secs)
        .unwrap_or(false)
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
pub fn rolling_db_backup(app: &tauri::AppHandle) -> Result<(), String> {
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
            let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if !is_auto_backup_name(name) {
                continue;
            }
            if let Ok(meta) = e.metadata() {
                if let Ok(modified) = meta.modified() {
                    if let Ok(age_secs) = std::time::SystemTime::now().duration_since(modified) {
                        if age_secs.as_secs() > KEEP_DAYS * 86_400 {
                            let _ = fs::remove_file(&p);
                            continue;
                        }
                    }
                }
            }
            // Belt-and-suspenders: also check name-encoded date.
            if backup_expired_by_name(name, cutoff) {
                let _ = fs::remove_file(&p);
            }
        }
    }
    Ok(())
}

/// List the auto-rolling DB backups currently on disk. Surfaced in
/// Settings → Mis datos so the user can restore a specific snapshot
/// without using a file picker. Returns newest first.
#[tauri::command]
pub async fn db_list_auto_backups(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
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
        let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
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
    entries.sort_by_key(|e| std::cmp::Reverse(e.3));
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
pub fn preboot_db_integrity_check_and_quarantine(
    app: &tauri::AppHandle,
    migrations: &[(i64, &str)],
) -> Result<(), String> {
    use std::fs;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app data dir: {e}"))?;
    let db_path = app_data.join("lol-draft-advisor.db");
    // A restore requested in the previous session is swapped in here, while
    // no connection is open. The integrity check below then covers it too.
    match apply_pending_restore(&app_data) {
        Ok(true) => eprintln!("[db-restore] pending restore applied"),
        Ok(false) => {}
        Err(e) => eprintln!("[db-restore] pending restore failed: {e}"),
    }
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
        let conn = rusqlite::Connection::open(&db_path).map_err(|e| format!("open: {e}"))?;
        let s: String = conn
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .map_err(|e| format!("query: {e}"))?;
        if s != "ok" {
            return Err(format!("integrity_check returned: {s}"));
        }
        // Force WAL mode + NORMAL sync. Idempotent — no-op if already set.
        // We swallow inner errors because they're non-fatal: the DB still
        // works in rollback journal mode, just slower.
        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        let _ = conn.pragma_update(None, "synchronous", "NORMAL");
        // Non-fatal: if this fails, sqlx reports the mismatch as before.
        match repair_migration_line_endings(&conn, migrations.iter().copied()) {
            Ok(0) => {}
            Ok(n) => {
                eprintln!("[db-integrity] repaired {n} line-ending-only migration checksum(s)")
            }
            Err(e) => eprintln!("[db-integrity] migration checksum repair failed: {e}"),
        }
        Ok(())
    })();

    let reason = match check_result {
        Ok(()) => return Ok(()),
        Err(e) => e,
    };
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
pub async fn consume_db_recovery_marker(app: tauri::AppHandle) -> Result<Option<String>, String> {
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

/// Quarantine a corrupt DB file by renaming it to `corrupt-{epoch}.db`
/// in the app data dir. Called from the frontend when `Database.load`
/// fails — moving the file aside lets the SQL plugin recreate a fresh
/// DB on the next `load()` attempt instead of throwing forever. The
/// corrupt file is kept (not deleted) so the user can recover data
/// later if needed.
///
/// Returns the path to the quarantined file (for logging / user toast)
/// or an error if the file doesn't exist / can't be renamed.
#[tauri::command]
pub async fn db_quarantine_corrupt(app: tauri::AppHandle) -> Result<String, String> {
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

/// Copy the SQLite DB file from the app's data dir to a user-chosen
/// target path. Used by Settings → "Exportar DB" so users can save a
/// backup before risky operations (upgrades, factory reset, machine
/// migration).
///
/// We don't expose the source path or let the frontend pick the source —
/// it's always the app's own DB. The target comes from a native file
/// picker so we never write to arbitrary locations.
/// Guard a frontend-supplied backup/restore path. These commands are meant to
/// act only on a native-file-dialog result, but the Rust layer can't see where
/// the string came from — so reject the shapes a compromised/XSS frontend would
/// use: parent-dir traversal, UNC/network locations (an exfil-write channel),
/// and non-absolute paths. A normal local dialog result (absolute, e.g.
/// `C:\Users\me\Downloads\x.db`) passes — the user can still save anywhere
/// local, we just block traversal + network targets.
fn validate_db_path(path: &str) -> Result<(), String> {
    if path.contains("..") {
        return Err("path contains traversal".to_string());
    }
    // UNC / network path (\\server\share or //host/share) — exfil-write vector.
    if path.starts_with("\\\\") || path.starts_with("//") {
        return Err("network paths are not allowed".to_string());
    }
    if !std::path::Path::new(path).is_absolute() {
        return Err("path must be absolute".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn db_backup_to(app: tauri::AppHandle, target_path: String) -> Result<u64, String> {
    validate_db_path(&target_path)?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("can't resolve app data dir: {e}"))?;
    let source = app_data.join("lol-draft-advisor.db");
    if !source.exists() {
        return Err(format!("DB file not found at {}", source.display()));
    }
    snapshot_db(&source, std::path::Path::new(&target_path))
}

const DB_FILE: &str = "lol-draft-advisor.db";
const PENDING_RESTORE_FILE: &str = "lol-draft-advisor.db.pending-restore";
const PRE_RESTORE_FILE: &str = "lol-draft-advisor.db.pre-restore";

/// Consistent snapshot of a live (WAL-mode) DB. A plain file copy misses every
/// row still sitting in the `-wal` file; `VACUUM INTO` reads through the WAL.
/// Returns the size of the written file.
fn snapshot_db(source: &std::path::Path, target: &std::path::Path) -> Result<u64, String> {
    use std::fs;
    let target_str = target
        .to_str()
        .ok_or_else(|| "target path is not valid UTF-8".to_string())?;
    // VACUUM INTO refuses an existing file, so write next to the target and
    // rename over it: a failed snapshot must not destroy the backup the user
    // already had there (the save dialog asked about overwriting).
    let tmp_str = format!("{target_str}.tmp");
    let tmp = std::path::Path::new(&tmp_str);
    if tmp.exists() {
        fs::remove_file(tmp).map_err(|e| format!("can't replace target: {e}"))?;
    }
    let conn = rusqlite::Connection::open(source).map_err(|e| format!("open: {e}"))?;
    if let Err(e) = conn.execute("VACUUM INTO ?1", [tmp_str.as_str()]) {
        let _ = fs::remove_file(tmp);
        return Err(format!("backup failed: {e}"));
    }
    drop(conn);
    if let Err(e) = fs::rename(tmp, target) {
        let _ = fs::remove_file(tmp);
        return Err(format!("can't replace target: {e}"));
    }
    fs::metadata(target)
        .map(|m| m.len())
        .map_err(|e| format!("can't stat backup: {e}"))
}

/// Stage a restore: copy `source` next to the live DB as the pending file.
/// The live DB is NOT touched — the SQL plugin keeps it open for the whole
/// session, and overwriting it under those connections (with their `-wal`
/// still around) mixes old and restored pages.
fn stage_restore(app_data: &std::path::Path, source: &std::path::Path) -> Result<u64, String> {
    use std::fs;
    // Copy under a temp name first: a copy cut short (crash, disk full) must
    // never be picked up as a pending restore on the next boot.
    let tmp = app_data.join(format!("{PENDING_RESTORE_FILE}.tmp"));
    let bytes = match fs::copy(source, &tmp) {
        Ok(b) => b,
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            return Err(format!("copy failed: {e}"));
        }
    };
    if !db_file_is_sound(&tmp) {
        let _ = fs::remove_file(&tmp);
        return Err("the selected file is not a healthy SQLite database".to_string());
    }
    fs::rename(&tmp, app_data.join(PENDING_RESTORE_FILE))
        .map_err(|e| format!("copy failed: {e}"))?;
    Ok(bytes)
}

/// True when the file opens as SQLite and passes `PRAGMA quick_check`.
fn db_file_is_sound(path: &std::path::Path) -> bool {
    let ok = rusqlite::Connection::open(path)
        .and_then(|conn| conn.query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0)))
        .map(|s| s == "ok")
        .unwrap_or(false);
    // Opening a WAL-mode file can leave sidecars behind under its name.
    for ext in &["-shm", "-wal"] {
        let mut name = path.as_os_str().to_owned();
        name.push(ext);
        let _ = std::fs::remove_file(std::path::Path::new(&name));
    }
    ok
}

/// Swap a staged restore into place. Must run before anything opens the DB.
/// The current DB is kept as `.pre-restore` (one undo hop) and its `-wal` /
/// `-shm` files are removed so they can't be replayed into the restored file.
/// Returns true when a restore was applied.
fn apply_pending_restore(app_data: &std::path::Path) -> Result<bool, String> {
    use std::fs;
    let pending = app_data.join(PENDING_RESTORE_FILE);
    if !pending.exists() {
        return Ok(false);
    }
    // Never trade the working DB for a broken file: the integrity check
    // that follows would quarantine it and the user would boot empty.
    if !db_file_is_sound(&pending) {
        let _ = fs::remove_file(&pending);
        return Err("staged file is not a healthy SQLite database; restore dropped".to_string());
    }
    let live = app_data.join(DB_FILE);
    let pre_restore = app_data.join(PRE_RESTORE_FILE);
    let had_live = live.exists();
    if had_live {
        // Fold any leftover WAL into the main file so the safety copy is
        // complete. Best-effort: a DB too broken to open is moved as-is.
        if let Ok(conn) = rusqlite::Connection::open(&live) {
            let _ = conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()));
        }
        fs::rename(&live, &pre_restore).map_err(|e| format!("can't move current DB aside: {e}"))?;
    }
    for ext in &["-shm", "-wal"] {
        let sidecar = app_data.join(format!("{DB_FILE}{ext}"));
        if sidecar.exists() {
            let _ = fs::remove_file(&sidecar);
        }
    }
    if let Err(e) = fs::rename(&pending, &live) {
        // Put the previous DB back so the app doesn't boot on an empty one.
        if had_live {
            let _ = fs::rename(&pre_restore, &live);
        }
        return Err(format!("can't move restored DB into place: {e}"));
    }
    Ok(true)
}

/// Replace the app's SQLite DB with a user-chosen file. The new file is
/// validated as a SQLite database (first 16 bytes match the magic header)
/// and staged; the swap happens on the next launch (see
/// `apply_pending_restore`), so the user MUST restart the app — we surface
/// that in the UI.
#[tauri::command]
pub async fn db_restore_from(app: tauri::AppHandle, source_path: String) -> Result<u64, String> {
    use std::fs;
    use std::io::Read;

    validate_db_path(&source_path)?;

    // Validate magic header. SQLite 3 files start with "SQLite format 3\0".
    let mut f = fs::File::open(&source_path).map_err(|e| format!("can't open source: {e}"))?;
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
    fs::create_dir_all(&app_data).map_err(|e| format!("can't create app data dir: {e}"))?;
    stage_restore(&app_data, std::path::Path::new(&source_path))
}

#[cfg(test)]
#[allow(clippy::expect_used)] // tests may panic on failure — that IS the assertion
mod tests {
    use super::*;

    fn migrations_table(rows: &[(i64, &str)]) -> rusqlite::Connection {
        use sha2::{Digest, Sha384};
        let conn = rusqlite::Connection::open_in_memory().expect("open");
        conn.execute_batch(
            "CREATE TABLE _sqlx_migrations (version BIGINT PRIMARY KEY, description TEXT, \
             installed_on TIMESTAMP, success BOOLEAN, checksum BLOB, execution_time BIGINT);",
        )
        .expect("create");
        for (v, recorded_sql) in rows {
            conn.execute(
                "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) \
                 VALUES (?1, 'm', 1, ?2, 0)",
                rusqlite::params![v, Sha384::digest(recorded_sql.as_bytes()).to_vec()],
            )
            .expect("insert");
        }
        conn
    }

    fn checksum_of(conn: &rusqlite::Connection, v: i64) -> Vec<u8> {
        conn.query_row(
            "SELECT checksum FROM _sqlx_migrations WHERE version = ?1",
            [v],
            |r| r.get(0),
        )
        .expect("checksum")
    }

    #[test]
    fn migration_repair_rewrites_only_line_ending_twins() {
        use sha2::{Digest, Sha384};
        // Live DB 2026-11-01: migrations 1-6 recorded from a CRLF checkout,
        // 7+ from LF; an LF build refused to open it.
        let crlf = "CREATE TABLE a (x INT);\r\nCREATE INDEX i ON a(x);\r\n";
        let lf = "CREATE TABLE a (x INT);\nCREATE INDEX i ON a(x);\n";
        let edited = "CREATE TABLE a (x INT, y INT);\n";
        let conn = migrations_table(&[(1, crlf), (2, lf), (3, edited)]);
        let fixed =
            repair_migration_line_endings(&conn, [(1, lf), (2, lf), (3, lf)]).expect("repair");
        assert_eq!(fixed, 1);
        assert_eq!(
            checksum_of(&conn, 1),
            Sha384::digest(lf.as_bytes()).to_vec()
        );
        // Already matching: untouched. Real content change: left for sqlx.
        assert_eq!(
            checksum_of(&conn, 2),
            Sha384::digest(lf.as_bytes()).to_vec()
        );
        assert_eq!(
            checksum_of(&conn, 3),
            Sha384::digest(edited.as_bytes()).to_vec()
        );
    }

    #[test]
    fn migration_repair_works_towards_crlf_builds_too() {
        use sha2::{Digest, Sha384};
        let crlf = "SELECT 1;\r\nSELECT 2;\r\n";
        let lf = "SELECT 1;\nSELECT 2;\n";
        let conn = migrations_table(&[(1, lf)]);
        assert_eq!(
            repair_migration_line_endings(&conn, [(1, crlf)]).expect("repair"),
            1
        );
        assert_eq!(
            checksum_of(&conn, 1),
            Sha384::digest(crlf.as_bytes()).to_vec()
        );
    }

    #[test]
    fn migration_repair_is_a_no_op_on_a_fresh_db() {
        let conn = rusqlite::Connection::open_in_memory().expect("open");
        assert_eq!(
            repair_migration_line_endings(&conn, [(1, "SELECT 1;\n")]).expect("repair"),
            0
        );
    }

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("draftboard-{tag}-{nanos}"));
        std::fs::create_dir_all(&dir).expect("mkdir");
        dir
    }

    fn db_with_row(path: &std::path::Path, value: &str) {
        let conn = rusqlite::Connection::open(path).expect("open");
        conn.execute_batch("CREATE TABLE t (v TEXT);")
            .expect("create");
        conn.execute("INSERT INTO t (v) VALUES (?1)", [value])
            .expect("insert");
    }

    fn rows_of(path: &std::path::Path) -> Vec<String> {
        let conn = rusqlite::Connection::open(path).expect("open");
        let mut stmt = conn
            .prepare("SELECT v FROM t ORDER BY rowid")
            .expect("prepare");
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .expect("query")
            .collect::<Result<Vec<_>, _>>()
            .expect("rows");
        rows
    }

    #[test]
    fn snapshot_includes_rows_still_in_the_wal() {
        let dir = temp_dir("snapshot");
        let live = dir.join(DB_FILE);
        // Same state as the running app: WAL mode, connection still open,
        // the newest row not checkpointed into the main file yet.
        let conn = rusqlite::Connection::open(&live).expect("open");
        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        let _ = conn.pragma_update(None, "wal_autocheckpoint", 0);
        conn.execute_batch("CREATE TABLE t (v TEXT);")
            .expect("create");
        conn.execute("INSERT INTO t (v) VALUES ('only-in-wal')", [])
            .expect("insert");

        // A plain copy of the main file (the old backup) misses the row.
        let plain = dir.join("plain-copy.db");
        std::fs::copy(&live, &plain).expect("copy");
        assert!(rusqlite::Connection::open(&plain)
            .and_then(|c| c.query_row("SELECT count(*) FROM t", [], |r| r.get::<_, i64>(0)))
            .map(|n| n == 0)
            .unwrap_or(true));

        let target = dir.join("backup.db");
        std::fs::write(&target, b"old backup").expect("seed target");
        let bytes = snapshot_db(&live, &target).expect("snapshot");
        assert!(bytes > 0);
        assert_eq!(rows_of(&target), vec!["only-in-wal".to_string()]);
        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn restore_is_staged_then_swapped_in_without_the_old_wal() {
        let dir = temp_dir("restore");
        let live = dir.join(DB_FILE);
        db_with_row(&live, "old");
        let wal = dir.join(format!("{DB_FILE}-wal"));
        let shm = dir.join(format!("{DB_FILE}-shm"));
        let backup = dir.join("picked-backup.db");
        db_with_row(&backup, "restored");

        // Staging must leave the live DB alone (connections are still open).
        stage_restore(&dir, &backup).expect("stage");
        assert_eq!(rows_of(&live), vec!["old".to_string()]);
        assert!(dir.join(PENDING_RESTORE_FILE).exists());

        // Leftover sidecars of the old DB at the next boot.
        std::fs::write(&wal, b"stale").expect("wal");
        std::fs::write(&shm, b"stale").expect("shm");
        assert!(apply_pending_restore(&dir).expect("apply"));
        assert!(!wal.exists());
        assert!(!shm.exists());
        assert!(!dir.join(PENDING_RESTORE_FILE).exists());
        assert_eq!(rows_of(&live), vec!["restored".to_string()]);
        assert_eq!(
            rows_of(&dir.join(PRE_RESTORE_FILE)),
            vec!["old".to_string()]
        );
        // Nothing staged: no-op.
        assert!(!apply_pending_restore(&dir).expect("apply again"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn broken_restore_file_never_replaces_the_live_db() {
        let dir = temp_dir("restore-bad");
        let live = dir.join(DB_FILE);
        db_with_row(&live, "old");
        // Valid magic header, garbage after it (e.g. a truncated copy).
        let mut bad = b"SQLite format 3 ".to_vec();
        bad.extend_from_slice(&[0xAB; 4096]);
        let picked = dir.join("picked-bad.db");
        std::fs::write(&picked, &bad).expect("write bad");

        // Rejected at staging time: nothing is left pending.
        assert!(stage_restore(&dir, &picked).is_err());
        assert!(!dir.join(PENDING_RESTORE_FILE).exists());

        // Even if a broken file ends up staged, boot keeps the live DB.
        std::fs::write(dir.join(PENDING_RESTORE_FILE), &bad).expect("write pending");
        assert!(apply_pending_restore(&dir).is_err());
        assert!(!dir.join(PENDING_RESTORE_FILE).exists());
        assert_eq!(rows_of(&live), vec!["old".to_string()]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn failed_snapshot_keeps_the_previous_backup_file() {
        let dir = temp_dir("snapshot-fail");
        let source = dir.join("not-a-db.db");
        std::fs::write(&source, vec![0xABu8; 4096]).expect("write source");
        let target = dir.join("backup.db");
        std::fs::write(&target, b"old backup").expect("seed target");
        assert!(snapshot_db(&source, &target).is_err());
        assert_eq!(std::fs::read(&target).expect("read"), b"old backup");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn validate_db_path_accepts_absolute_local_paths() {
        // `is_absolute()` is platform-dependent (a C:\ path is absolute on
        // Windows but relative on Linux, and vice-versa), so assert each
        // platform's own native-dialog shape — the prod target is Windows.
        #[cfg(windows)]
        {
            assert!(validate_db_path(r"C:\Users\me\Downloads\draftboard.db").is_ok());
            assert!(validate_db_path(r"C:\Users\me\backup.sqlite").is_ok());
        }
        #[cfg(unix)]
        {
            assert!(validate_db_path("/home/me/Downloads/draftboard.db").is_ok());
        }
    }

    #[test]
    fn validate_db_path_rejects_traversal_unc_and_relative() {
        // Parent-dir traversal.
        assert!(validate_db_path(r"C:\Users\me\..\..\Windows\System32\x.db").is_err());
        assert!(validate_db_path("/home/me/../../etc/passwd").is_err());
        // UNC / network exfil-write targets.
        assert!(validate_db_path(r"\\attacker\share\steal.db").is_err());
        assert!(validate_db_path("//attacker/share/steal.db").is_err());
        // Non-absolute (relative) paths.
        assert!(validate_db_path("backup.db").is_err());
        assert!(validate_db_path("./backup.db").is_err());
    }

    #[test]
    fn is_auto_backup_name_matches_only_rolling_snapshots() {
        assert!(is_auto_backup_name("auto-2026-06-14.db"));
        assert!(!is_auto_backup_name("manual-backup.db"));
        assert!(!is_auto_backup_name("auto-2026-06-14.sqlite"));
        assert!(!is_auto_backup_name("lol-draft-advisor.db"));
    }

    #[test]
    fn backup_expired_by_name_prunes_only_dates_before_cutoff() {
        // Anchor the cutoff at a known date, then probe the day on either side.
        let cutoff = ymd_to_epoch_secs("2026-06-10").expect("valid ymd");
        assert!(backup_expired_by_name("auto-2026-06-09.db", cutoff)); // older → prune
        assert!(!backup_expired_by_name("auto-2026-06-10.db", cutoff)); // == cutoff → keep (strict <)
        assert!(!backup_expired_by_name("auto-2026-06-11.db", cutoff)); // newer → keep
                                                                        // Unparseable / non-snapshot names are never pruned by this path.
        assert!(!backup_expired_by_name("auto-not-a-date.db", cutoff));
        assert!(!backup_expired_by_name("manual.db", cutoff));
    }
}
