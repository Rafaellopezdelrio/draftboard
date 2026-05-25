// @vitest-environment jsdom
//
// Verify db/client auto-recovery on DB corruption.
//
// What we're locking down:
//   - First Database.load throw -> invoke('db_quarantine_corrupt')
//     -> Database.load retry -> success -> recovery flag set
//   - Quarantine failure (file locked, perms) -> rethrow ORIGINAL load
//     error so the global ErrorScreen shows the real cause
//   - Cached _db short-circuits re-entry (existing behaviour)
//
// Tauri APIs are mocked: @tauri-apps/plugin-sql at the harness level
// (src/test/setup.ts) returns a happy stub. For these tests we override
// Database.load with vi.mocked() to simulate failures.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

// Mock invoke so db_quarantine_corrupt doesn't hit native code.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const happyDb = { __isHappy: true } as unknown as Database;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("db/client corruption recovery", () => {
  it("returns the DB directly when first load succeeds (happy path)", async () => {
    vi.spyOn(Database, "load").mockResolvedValueOnce(happyDb);
    const { getDb, didRecoverFromCorruption } = await import("./client");
    const db = await getDb();
    expect(db).toBe(happyDb);
    expect(invoke).not.toHaveBeenCalled();
    expect(didRecoverFromCorruption()).toBe(false);
  });

  it("quarantines + retries when initial load throws, sets recovery flag", async () => {
    const loadSpy = vi
      .spyOn(Database, "load")
      .mockRejectedValueOnce(new Error("file is encrypted or is not a database"))
      .mockResolvedValueOnce(happyDb);
    vi.mocked(invoke).mockResolvedValueOnce("/path/to/corrupt-12345.db");

    const { getDb, didRecoverFromCorruption, consumeCorruptionRecovery } =
      await import("./client");
    const db = await getDb();
    expect(db).toBe(happyDb);
    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledWith("db_quarantine_corrupt");
    expect(didRecoverFromCorruption()).toBe(true);
    consumeCorruptionRecovery();
    expect(didRecoverFromCorruption()).toBe(false);
  });

  it("rethrows ORIGINAL load error when quarantine fails", async () => {
    const original = new Error("file is encrypted or is not a database");
    vi.spyOn(Database, "load").mockRejectedValueOnce(original);
    vi.mocked(invoke).mockRejectedValueOnce(new Error("permission denied"));

    const { getDb, didRecoverFromCorruption } = await import("./client");
    await expect(getDb()).rejects.toBe(original);
    expect(didRecoverFromCorruption()).toBe(false);
  });

  it("rethrows ORIGINAL when quarantine succeeds but retry load also fails", async () => {
    const original = new Error("malformed DB");
    vi.spyOn(Database, "load")
      .mockRejectedValueOnce(original)
      .mockRejectedValueOnce(new Error("still cant open"));
    vi.mocked(invoke).mockResolvedValueOnce("/quarantine/path.db");

    const { getDb } = await import("./client");
    await expect(getDb()).rejects.toBe(original);
  });

  it("caches the DB connection across calls", async () => {
    const loadSpy = vi.spyOn(Database, "load").mockResolvedValueOnce(happyDb);
    const { getDb } = await import("./client");
    const a = await getDb();
    const b = await getDb();
    expect(a).toBe(b);
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });
});
