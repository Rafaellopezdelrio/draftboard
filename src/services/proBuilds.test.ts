import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();

// Reload the module each test so the in-memory dedupe Map (defined at
// module scope inside proBuilds.ts) is fresh. Otherwise a champion
// fetched by an earlier test short-circuits a later test's fetch and
// the call-count assertion fails.
async function loadFetcher() {
  vi.resetModules();
  vi.doMock("@tauri-apps/plugin-http", () => ({
    fetch: (...args: unknown[]) => mockFetch(...args),
  }));
  vi.doMock("./riotApi", () => ({
    getRiotProxyUrl: () => "https://proxy.test",
  }));
  const mod = await import("./proBuilds");
  return mod.fetchProBuilds;
}

function ok(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

describe("fetchProBuilds", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      value: {},
      writable: true,
      configurable: true,
    });
  });

  it("hits worker with championId + mapped role", async () => {
    mockFetch.mockResolvedValue(
      ok({
        championId: 266,
        role: "top",
        totalMatches: 20,
        variants: [],
        recent: [],
      })
    );
    const fetchProBuilds = await loadFetcher();
    await fetchProBuilds(266, "TOP");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("championId=266");
    expect(url).toContain("role=top");
  });

  it("maps Role enum to op.gg lane tokens", async () => {
    mockFetch.mockResolvedValue(
      ok({ championId: 1, role: "x", totalMatches: 0, variants: [], recent: [] })
    );
    const fetchProBuilds = await loadFetcher();
    await fetchProBuilds(1, "MIDDLE");
    await fetchProBuilds(2, "BOTTOM");
    await fetchProBuilds(3, "UTILITY");
    const urls = mockFetch.mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toContain("role=mid");
    expect(urls[1]).toContain("role=adc");
    expect(urls[2]).toContain("role=support");
  });

  it("returns null on HTTP error (never throws)", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502 } as Response);
    const fetchProBuilds = await loadFetcher();
    const out = await fetchProBuilds(266, "TOP");
    expect(out).toBeNull();
  });

  it("returns null when fetch throws (network down)", async () => {
    mockFetch.mockRejectedValue(new Error("network"));
    const fetchProBuilds = await loadFetcher();
    const out = await fetchProBuilds(266, "TOP");
    expect(out).toBeNull();
  });

  it("caches subsequent calls for the same (championId, role)", async () => {
    mockFetch.mockResolvedValue(
      ok({ championId: 266, role: "top", totalMatches: 20, variants: [], recent: [] })
    );
    const fetchProBuilds = await loadFetcher();
    await fetchProBuilds(266, "TOP");
    await fetchProBuilds(266, "TOP");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT cache across different (championId, role) pairs", async () => {
    mockFetch.mockResolvedValue(
      ok({ championId: 0, role: "x", totalMatches: 0, variants: [], recent: [] })
    );
    const fetchProBuilds = await loadFetcher();
    await fetchProBuilds(266, "TOP");
    await fetchProBuilds(266, "JUNGLE");
    await fetchProBuilds(64, "JUNGLE");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
