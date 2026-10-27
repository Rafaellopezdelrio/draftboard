import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn();
const mockFailure = vi.fn();

// Fresh module per test so the in-memory dedupe Map doesn't leak.
async function loadFetcher() {
  vi.resetModules();
  vi.doMock("@tauri-apps/plugin-http", () => ({
    fetch: (...args: unknown[]) => mockFetch(...args),
  }));
  vi.doMock("./riotApi", () => ({
    getRiotProxyUrl: () => "https://proxy.test",
  }));
  vi.doMock("./fetchNotify", () => ({
    emitFetchFailure: (...args: unknown[]) => mockFailure(...args),
  }));
  const mod = await import("./lolvvvBuilds");
  return mod.fetchLolvvvBuild;
}

function ok(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

const BUILD = { championId: 62, role: "JUNGLE", games: 40 };

describe("fetchLolvvvBuild", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mockFetch.mockReset();
    mockFailure.mockReset();
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      value: {},
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hits the worker with the DDragon id", async () => {
    mockFetch.mockResolvedValue(ok(BUILD));
    const fetchLolvvvBuild = await loadFetcher();
    expect(await fetchLolvvvBuild("MonkeyKing")).toEqual(BUILD);
    expect(mockFetch.mock.calls[0][0]).toBe("https://proxy.test/lolvvv/build?champion=MonkeyKing");
  });

  it("caches per champion", async () => {
    mockFetch.mockResolvedValue(ok(BUILD));
    const fetchLolvvvBuild = await loadFetcher();
    await fetchLolvvvBuild("MonkeyKing");
    await fetchLolvvvBuild("MonkeyKing");
    await fetchLolvvvBuild("LeeSin");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("treats 404 (no pro games) as empty, without a failure toast", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 } as Response);
    const fetchLolvvvBuild = await loadFetcher();
    expect(await fetchLolvvvBuild("Yorick")).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFailure).not.toHaveBeenCalled();
  });

  it("returns null and notifies on upstream failure", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502 } as Response);
    const fetchLolvvvBuild = await loadFetcher();
    const p = fetchLolvvvBuild("Aatrox");
    await vi.runAllTimersAsync();
    expect(await p).toBeNull();
    expect(mockFailure).toHaveBeenCalledOnce();
  });
});
