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
pub fn preboot_db_integrity_check_and_quarantine(app: &tauri::AppHandle) -> Result<(), String> {
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
    use std::fs;
    validate_db_path(&target_path)?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("can't resolve app data dir: {e}"))?;
    let source = app_data.join("lol-draft-advisor.db");
    if !source.exists() {
        return Err(format!("DB file not found at {}", source.display()));
    }
    let bytes = fs::copy(&source, &target_path).map_err(|e| format!("copy failed: {e}"))?;
    Ok(bytes)
}

/// Replace the app's SQLite DB with a user-chosen file. The new file is
/// validated as a SQLite database (first 16 bytes match the magic header)
/// before we overwrite. After restore the user MUST restart the app to
/// reopen the DB connection — we surface that in the UI.
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
    let target = app_data.join("lol-draft-advisor.db");

    // Keep a safety copy of the CURRENT DB before overwriting — gives
    // the user one undo hop if the imported file turns out to be wrong.
    if target.exists() {
        let safety = app_data.join("lol-draft-advisor.db.pre-restore");
        let _ = fs::copy(&target, &safety);
    }

    let bytes = fs::copy(&source_path, &target).map_err(|e| format!("copy failed: {e}"))?;
    Ok(bytes)
}

#[cfg(test)]
#[allow(clippy::expect_used)] // tests may panic on failure — that IS the assertion
mod tests {
    use super::*;

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
