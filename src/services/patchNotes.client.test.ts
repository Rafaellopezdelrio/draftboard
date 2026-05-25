import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => mockFetch(...args),
}));
vi.mock("./riotApi", () => ({
  getRiotProxyUrl: () => "https://proxy.test",
}));

// Provide a real-ish localStorage so the cache layer works inside the test.
class MemStorage {
  store = new Map<string, string>();
  getItem(k: string) { return this.store.get(k) ?? null; }
  setItem(k: string, v: string) { this.store.set(k, v); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

beforeEach(() => {
  mockFetch.mockReset();
  Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
    value: {},
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemStorage(),
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  // Reset the singleton cache between tests via the storage clear.
  (globalThis as unknown as { localStorage: MemStorage }).localStorage.clear();
});

import { getLatestPatchSummary } from "./patchNotes";

function ok(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}
function notOk() {
  return { ok: false, status: 500 } as unknown as Response;
}

describe("getLatestPatchSummary — proxy primary + Leaguepedia fallback", () => {
  it("returns the proxy data when worker has changes", async () => {
    mockFetch.mockResolvedValue(
      ok({
        patch: "16.10",
        url: "https://example.test/notes",
        changes: [
          { championName: "Aatrox", championId: "Aatrox", type: "buff", details: ["Q dmg up"] },
        ],
      })
    );
    const summary = await getLatestPatchSummary("16.10");
    expect(summary?.changes).toHaveLength(1);
    expect(summary?.changes[0].championId).toBe("Aatrox");
    expect(summary?.changes[0].type).toBe("buff");
  });

  it("falls back to Leaguepedia when proxy returns empty", async () => {
    // Proxy returns 0 changes → triggers fallback.
    mockFetch
      .mockResolvedValueOnce(ok({ patch: "16.10", changes: [] }))
      // Leaguepedia Cargo response shape.
      .mockResolvedValueOnce(
        ok({
          cargoquery: [
            { title: { Version: "16.10", Notes: "" } },
          ],
        })
      );
    const summary = await getLatestPatchSummary("16.10");
    expect(summary).not.toBeNull();
    expect(summary?.patch).toBe("16.10");
  });

  it("caches the result for 24h (no second fetch on second call)", async () => {
    mockFetch.mockResolvedValue(
      ok({
        patch: "16.10",
        changes: [
          { championName: "Aatrox", championId: "Aatrox", type: "buff", details: [] },
        ],
      })
    );
    await getLatestPatchSummary("16.10");
    const callsAfterFirst = mockFetch.mock.calls.length;
    await getLatestPatchSummary("16.10");
    // Cached → no extra fetches.
    expect(mockFetch.mock.calls.length).toBe(callsAfterFirst);
  });

  it("re-fetches when asking for a different patch", async () => {
    mockFetch.mockResolvedValue(ok({ patch: "x", changes: [] }));
    await getLatestPatchSummary("16.10");
    await getLatestPatchSummary("16.9");
    expect(mockFetch.mock.calls.length).toBeGreaterThan(1);
  });

  it("survives total proxy + Leaguepedia failure with an empty summary", async () => {
    mockFetch.mockResolvedValue(notOk());
    const summary = await getLatestPatchSummary("16.10");
    expect(summary).not.toBeNull();
    expect(summary?.changes).toEqual([]);
  });
});
