import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ChampionDb } from "../types/champion";

const m = vi.hoisted(() => ({
  loadChampionDb: vi.fn(),
  readChampionDbCacheUnsafe: vi.fn(),
  trackEvent: vi.fn(),
  trackFetch: vi.fn(),
  mark: vi.fn(),
  measure: vi.fn(),
  warnIfSlow: vi.fn(),
  startAutoProSync: vi.fn(),
}));

vi.mock("../services/championDb", () => ({
  loadChampionDb: m.loadChampionDb,
  readChampionDbCacheUnsafe: m.readChampionDbCacheUnsafe,
}));
vi.mock("../services/breadcrumbs", () => ({ trackEvent: m.trackEvent, trackFetch: m.trackFetch }));
vi.mock("../services/perf", () => ({ mark: m.mark, measure: m.measure, warnIfSlow: m.warnIfSlow }));
vi.mock("../services/autoProSync", () => ({ startAutoProSync: m.startAutoProSync }));

import { useChampionDbBoot } from "./useChampionDbBoot";

const NOW = new Date("2026-11-01T12:00:00Z").getTime();

function makeDb(patch: string, fetchedAt = NOW): ChampionDb {
  return {
    patch,
    fetchedAt,
    champions: { Aatrox: {}, Ahri: {} },
  } as unknown as ChampionDb;
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

let pushToast: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  for (const fn of Object.values(m)) fn.mockReset();
  m.measure.mockReturnValue(123.4);
  m.readChampionDbCacheUnsafe.mockReturnValue(null);
  pushToast = vi.fn().mockReturnValue(1);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useChampionDbBoot", () => {
  it("waits for prefs before loading, then loads once they arrive", async () => {
    const db = makeDb("16.1.1");
    m.loadChampionDb.mockResolvedValue(db);
    const { result, rerender } = renderHook(
      ({ loaded }) => useChampionDbBoot(loaded, pushToast),
      { initialProps: { loaded: false } }
    );
    await flush();
    expect(m.loadChampionDb).not.toHaveBeenCalled();
    expect(result.current.db).toBeNull();

    rerender({ loaded: true });
    await flush();
    expect(m.loadChampionDb).toHaveBeenCalledTimes(1);
    expect(result.current.db).toBe(db);
  });

  it("loads the DB, records perf + breadcrumb and starts pro sync", async () => {
    const db = makeDb("16.1.1");
    m.loadChampionDb.mockResolvedValue(db);
    const { result } = renderHook(() => useChampionDbBoot(true, pushToast));
    await flush();

    expect(result.current.db).toBe(db);
    expect(result.current.error).toBeNull();
    expect(result.current.usingStaleCache).toBe(false);
    expect(m.mark).toHaveBeenCalledWith("dbLoad:start");
    expect(m.mark).toHaveBeenCalledWith("dbLoad:end");
    expect(m.warnIfSlow).toHaveBeenCalledWith(123.4, 2000, "Champion DB initial load", {
      patch: "16.1.1",
    });
    expect(m.trackEvent).toHaveBeenCalledWith("config", "Champion DB loaded", {
      patch: "16.1.1",
      champCount: 2,
      loadMs: 123,
    });
    expect(m.startAutoProSync).toHaveBeenCalledWith(db);
    expect(pushToast).not.toHaveBeenCalled();
  });

  it("surfaces a hard error when the load fails and there is no cache", async () => {
    m.loadChampionDb.mockRejectedValue(new Error("worker down"));
    const { result } = renderHook(() => useChampionDbBoot(true, pushToast));
    await flush();
    expect(result.current.error).toBe("Error: worker down");
    expect(result.current.db).toBeNull();
    expect(m.trackFetch).toHaveBeenCalledWith("championDb", "fail", "Error: worker down");
    // no background retry without a stale fallback
    await flush(5 * 60_000);
    expect(m.loadChampionDb).toHaveBeenCalledTimes(1);
  });

  it("falls back to the stale cache, warns with its age in minutes, then swaps in fresh data", async () => {
    const stale = makeDb("16.0.1", NOW - 30 * 60_000);
    const fresh = makeDb("16.1.1");
    m.readChampionDbCacheUnsafe.mockReturnValue(stale);
    m.loadChampionDb.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useChampionDbBoot(true, pushToast));
    await flush();

    expect(result.current.db).toBe(stale);
    expect(result.current.usingStaleCache).toBe(true);
    expect(result.current.error).toBeNull();
    expect(pushToast).toHaveBeenCalledWith({
      type: "warn",
      title: "Mostrando datos en caché",
      detail: "No pude refrescar (hace 30min). Reintento en background.",
      durationMs: 8000,
    });

    // first background retry still fails → keeps stale silently
    m.loadChampionDb.mockRejectedValueOnce(new Error("still offline"));
    await flush(60_000);
    expect(m.loadChampionDb).toHaveBeenLastCalledWith(true);
    expect(result.current.usingStaleCache).toBe(true);

    // second retry succeeds
    m.loadChampionDb.mockResolvedValueOnce(fresh);
    await flush(60_000);
    expect(result.current.db).toBe(fresh);
    expect(result.current.usingStaleCache).toBe(false);
    expect(pushToast).toHaveBeenLastCalledWith({
      type: "success",
      title: "Datos actualizados",
      detail: "Refresco completado.",
    });

    // interval cleared after recovery
    await flush(5 * 60_000);
    expect(m.loadChampionDb).toHaveBeenCalledTimes(3);
  });

  it("labels a cache older than an hour in hours", async () => {
    m.readChampionDbCacheUnsafe.mockReturnValue(makeDb("16.0.1", NOW - 3 * 60 * 60_000));
    m.loadChampionDb.mockRejectedValue(new Error("offline"));
    renderHook(() => useChampionDbBoot(true, pushToast));
    await flush();
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ detail: "No pude refrescar (hace 3h). Reintento en background." })
    );
  });

  it("clears the background retry on unmount", async () => {
    m.readChampionDbCacheUnsafe.mockReturnValue(makeDb("16.0.1", NOW - 60_000));
    m.loadChampionDb.mockRejectedValue(new Error("offline"));
    const { unmount } = renderHook(() => useChampionDbBoot(true, pushToast));
    await flush();
    unmount();
    await flush(5 * 60_000);
    expect(m.loadChampionDb).toHaveBeenCalledTimes(1);
  });

  it("ignores a load that resolves after unmount", async () => {
    let resolve!: (db: ChampionDb) => void;
    m.loadChampionDb.mockReturnValue(new Promise((r) => (resolve = r)));
    const { unmount } = renderHook(() => useChampionDbBoot(true, pushToast));
    unmount();
    resolve(makeDb("16.1.1"));
    await flush();
    expect(m.startAutoProSync).not.toHaveBeenCalled();
    expect(m.trackEvent).not.toHaveBeenCalled();
  });

  it("ignores a failure that arrives after unmount", async () => {
    let reject!: (e: Error) => void;
    m.loadChampionDb.mockReturnValue(new Promise((_r, j) => (reject = j)));
    const { unmount } = renderHook(() => useChampionDbBoot(true, pushToast));
    unmount();
    reject(new Error("late"));
    await flush();
    expect(m.trackFetch).not.toHaveBeenCalled();
  });

  it("retry() clears the error and loads again", async () => {
    m.loadChampionDb.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useChampionDbBoot(true, pushToast));
    await flush();
    expect(result.current.error).toBe("Error: boom");

    const db = makeDb("16.1.1");
    m.loadChampionDb.mockResolvedValueOnce(db);
    act(() => result.current.retry());
    await flush();
    expect(m.loadChampionDb).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.db).toBe(db);
  });

  it("setDb lets callers replace the DB externally", async () => {
    m.loadChampionDb.mockResolvedValue(makeDb("16.1.1"));
    const { result } = renderHook(() => useChampionDbBoot(true, pushToast));
    await flush();
    const forced = makeDb("16.2.1");
    act(() => result.current.setDb(forced));
    expect(result.current.db).toBe(forced);
  });
});
