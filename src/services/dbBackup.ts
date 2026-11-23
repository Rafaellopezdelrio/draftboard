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
import { save } from "@tauri-apps/plugin-dialog";
import { i18n } from "../i18n";

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
 * Same Rust validation as the manual file picker (magic header check). The
 * file is only staged: Rust swaps it in on the next launch, keeping the
 * current DB as .pre-restore, so nothing changes until the app restarts. */
export async function restoreFromPath(sourcePath: string): Promise<number> {
  if (!isTauri()) throw new Error(i18n.t("about.desktopOnly"));
  return await invoke<number>("db_restore_from", { sourcePath });
}

/**
 * Open a native "Save As..." picker, then write a consistent snapshot of
 * the running SQLite DB (WAL included) to the chosen location. Returns the chosen path + byte count on success,
 * or `{path: "", bytes: 0}` if the user cancelled.
 */
export async function backupDatabase(): Promise<BackupResult> {
  if (!isTauri()) {
    throw new Error(i18n.t("about.desktopOnly"));
  }
  const filename = `draftboard-backup-${new Date().toISOString().slice(0, 10)}.db`;
  const target = await save({
    title: i18n.t("dataPrivacy.backupDbTitle"),
    defaultPath: filename,
    filters: [{ name: "SQLite DB", extensions: ["db", "sqlite", "sqlite3"] }],
  });
  if (!target) return { path: "", bytes: 0 };
  const bytes = await invoke<number>("db_backup_to", { targetPath: target });
  return { path: target, bytes };
}
