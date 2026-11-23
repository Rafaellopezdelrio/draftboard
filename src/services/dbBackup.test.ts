import { describe, it, expect, vi, beforeEach } from "vitest";

// Control the IPC + native-dialog layers. setup.ts marks __TAURI_INTERNALS__
// present, so isTauri() is true here — the Tauri branches run.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

let saveResult: string | null = null;
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: () => Promise.resolve(saveResult),
}));

import {
  backupDatabase,
  listAutoBackups,
  restoreFromPath,
} from "./dbBackup";

describe("dbBackup — dialog + IPC wrappers", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    saveResult = null;
  });

  it("backupDatabase returns an empty result and skips IPC when the user cancels", async () => {
    saveResult = null; // user dismissed the Save dialog
    const r = await backupDatabase();
    expect(r).toEqual({ path: "", bytes: 0 });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("backupDatabase copies to the chosen path and reports the byte count", async () => {
    saveResult = "C:\\Users\\me\\backup.db";
    invokeMock.mockResolvedValue(2048);
    const r = await backupDatabase();
    expect(r).toEqual({ path: "C:\\Users\\me\\backup.db", bytes: 2048 });
    expect(invokeMock).toHaveBeenCalledWith("db_backup_to", {
      targetPath: "C:\\Users\\me\\backup.db",
    });
  });

  it("restoreFromPath forwards the path straight to the restore command", async () => {
    invokeMock.mockResolvedValue(512);
    const bytes = await restoreFromPath("C:\\backups\\auto-2026-06-14.db");
    expect(bytes).toBe(512);
    expect(invokeMock).toHaveBeenCalledWith("db_restore_from", {
      sourcePath: "C:\\backups\\auto-2026-06-14.db",
    });
  });

  it("listAutoBackups forwards the Rust metadata", async () => {
    const entries = [
      { path: "C:\\b\\auto-2026-06-14.db", dateLabel: "2026-06-14", sizeBytes: 10, modifiedSecs: 100 },
    ];
    invokeMock.mockResolvedValue(entries);
    expect(await listAutoBackups()).toEqual(entries);
  });

  it("listAutoBackups degrades to [] when the command throws", async () => {
    invokeMock.mockRejectedValue(new Error("no backups dir"));
    expect(await listAutoBackups()).toEqual([]);
  });
});
