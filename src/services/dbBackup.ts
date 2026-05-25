// Wrappers around the Tauri `db_backup_to` / `db_restore_from` commands.
// Exposes a friendly Promise<...> contract to the React layer and
// composes the native dialogs with the underlying file ops.
//
// Why this exists at all:
//   1. SQLite migrations can corrupt data on edge versions. Users should
//      be able to roll back to a backup if v0.4 breaks them.
//   2. Migration across machines (gaming PC → laptop) needs explicit
//      export/import — Tauri's per-app-data dir doesn't sync.
//   3. Privacy / GDPR: "right to portability" requires user-readable
//      export. SQLite file IS the portability format.

import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface BackupResult {
  /** Where the backup landed. Empty string when the user cancelled. */
  path: string;
  /** Bytes written. 0 when cancelled. */
  bytes: number;
}

export interface AutoBackupEntry {
  /** Absolute path to the snapshot file. Pass to `restoreFromPath` to roll back. */
  path: string;
  /** YYYY-MM-DD encoded in the filename. UI label. */
  dateLabel: string;
  /** File size on disk. */
  sizeBytes: number;
  /** UNIX epoch seconds. Used for "X days ago" relative labels. */
  modifiedSecs: number;
}

/** Snapshot of all auto-rolling backups currently on disk (newest first).
 * The Rust side scans `appData/backups/` and returns the metadata; we just
 * forward it to the UI. Returns empty when there are no snapshots yet
 * (first launch on a fresh install). */
export async function listAutoBackups(): Promise<AutoBackupEntry[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<AutoBackupEntry[]>("db_list_auto_backups");
  } catch {
    return [];
  }
}

/** Restore from a specific filesystem path (used by the auto-backup list).
 * Same Rust validation as the manual file picker — magic header check +
 * safety copy to .pre-restore. */
export async function restoreFromPath(sourcePath: string): Promise<number> {
  if (!isTauri()) throw new Error("Solo disponible en la app de escritorio");
  return await invoke<number>("db_restore_from", { sourcePath });
}

export interface RestoreResult {
  /** Where the restored DB came from. Empty when cancelled. */
  path: string;
  /** Bytes copied. 0 when cancelled. */
  bytes: number;
}

/**
 * Open a native "Save As..." picker, then copy the running SQLite DB to
 * the chosen location. Returns the chosen path + byte count on success,
 * or `{path: "", bytes: 0}` if the user cancelled.
 */
export async function backupDatabase(): Promise<BackupResult> {
  if (!isTauri()) {
    throw new Error("Solo disponible en la app de escritorio");
  }
  const filename = `draftboard-backup-${new Date().toISOString().slice(0, 10)}.db`;
  const target = await save({
    title: "Guardar copia de seguridad de la base de datos",
    defaultPath: filename,
    filters: [{ name: "SQLite DB", extensions: ["db", "sqlite", "sqlite3"] }],
  });
  if (!target) return { path: "", bytes: 0 };
  const bytes = await invoke<number>("db_backup_to", { targetPath: target });
  return { path: target, bytes };
}

/**
 * Open a native "Open file" picker, validate the chosen file is a SQLite
 * 3 database, then copy it over the current app DB. A safety copy of the
 * existing DB is kept at `<dir>/lol-draft-advisor.db.pre-restore` so the
 * user has one undo if the imported file is wrong.
 *
 * The caller is responsible for prompting the user to restart the app —
 * SQLite connections cache file handles; the new DB won't be visible
 * until the next launch.
 */
export async function restoreDatabase(): Promise<RestoreResult> {
  if (!isTauri()) {
    throw new Error("Solo disponible en la app de escritorio");
  }
  const source = await open({
    title: "Selecciona una copia de seguridad de Draftboard",
    multiple: false,
    directory: false,
    filters: [{ name: "SQLite DB", extensions: ["db", "sqlite", "sqlite3"] }],
  });
  if (!source || Array.isArray(source)) return { path: "", bytes: 0 };
  const bytes = await invoke<number>("db_restore_from", { sourcePath: source });
  return { path: source, bytes };
}
