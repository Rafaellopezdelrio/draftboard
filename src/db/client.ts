// SQLite client wrapper. Single-connection cache so all callers share
// the same Database handle. Two-tier corruption recovery:
//
//   1. PRIMARY: Rust pre-boot integrity check (lib.rs::preboot_db_*).
//      Runs BEFORE tauri-plugin-sql attaches its handle. If
//      `PRAGMA integrity_check` fails, Rust renames the file to
//      `corrupt-{epoch}.db` and writes a recovery-marker.json. The TS
//      side calls `probeRustRecoveryMarker()` at boot to surface the
//      "data was reset" toast.
//
//   2. FALLBACK: TS retry-after-rename (in `getDb()` below). Only
//      fires when the Rust check missed something (older builds, race
//      with a separate writer, etc). Usually fails under file-lock
//      contention since the plugin already holds the handle by the
//      time we get the throw — that's WHY tier #1 exists. Kept as
//      defence-in-depth.
//
// Either path flips `_recoveredFromCorruption` so the UI toast fires
// exactly once per session. The corrupt file is preserved on disk so
// the user can attempt manual SQLite recovery if their data mattered.

import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

let _db: Database | null = null;
/** Set to true after a successful quarantine + reopen, so the UI can
 * surface a toast warning the user that their data was reset. Read by
 * App.tsx once at boot and cleared after the toast fires. Two sources:
 *   1. TS recovery flow (Database.load throws -> we rename + retry)
 *   2. Rust pre-boot integrity check (preferred — runs before plugin
 *      attaches its handle, so rename can't fail under file-lock)
 * Either path flips this flag. */
let _recoveredFromCorruption = false;
/** Set to true at boot when Rust pre-boot quarantine consumed a marker
 * file. Stored separately so the toast can mention it was pre-boot. */
let _recoveredPreBoot = false;

const DB_URI = "sqlite:lol-draft-advisor.db";

export async function getDb(): Promise<Database> {
  if (_db) return _db;
  try {
    _db = await Database.load(DB_URI);
    return _db;
  } catch (e) {
    // First open failed. The most likely cause is on-disk corruption
    // (truncated file, mangled header, dirty WAL). Try to quarantine
    // the corrupt file and reopen — if that works, the app boots with
    // an empty DB and the user keeps using it.
    //
    // Defence in depth: if quarantine fails (file locked by another
    // process, permission denied) we re-throw the original error so
    // the global ErrorScreen renders rather than swallowing the bug.
    // eslint-disable-next-line no-console
    console.error("[db] initial open failed, attempting corruption recovery:", e);
    try {
      const quarantinedPath = await invoke<string>("db_quarantine_corrupt");
      // eslint-disable-next-line no-console
      console.warn(`[db] quarantined corrupt DB to: ${quarantinedPath}`);
      _db = await Database.load(DB_URI);
      _recoveredFromCorruption = true;
      return _db;
    } catch (recoverErr) {
      // eslint-disable-next-line no-console
      console.error("[db] recovery failed:", recoverErr);
      throw e; // surface ORIGINAL error — recoverErr is downstream noise
    }
  }
}

/** True if the last `getDb()` recovered from corruption — used by the
 * UI to show a one-time toast warning. Caller should `consume` after
 * reading so the toast only fires once per session. */
export function didRecoverFromCorruption(): boolean {
  return _recoveredFromCorruption;
}

/** Reset the recovery flag after the UI has surfaced the warning. */
export function consumeCorruptionRecovery(): void {
  _recoveredFromCorruption = false;
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Probe Rust-side recovery marker at boot. Sets the recovery flags
 * if Rust quarantined the DB before this session started. Call once
 * early in App.tsx mount — idempotent (Rust removes the marker after
 * the first successful read). */
export async function probeRustRecoveryMarker(): Promise<void> {
  if (!isTauri()) return;
  try {
    const payload = await invoke<string | null>("consume_db_recovery_marker");
    if (payload) {
      _recoveredFromCorruption = true;
      _recoveredPreBoot = true;
      // eslint-disable-next-line no-console
      console.warn("[db] Rust pre-boot quarantine fired:", payload);
    }
  } catch {
    // Command may not exist in older builds — non-fatal.
  }
}

/** Whether the recovery happened via Rust's pre-boot path (vs the TS
 * post-load retry). The toast wording differs slightly: pre-boot
 * means "we caught it before the app even tried to use the DB". */
export function didRecoverPreBoot(): boolean {
  return _recoveredPreBoot;
}
