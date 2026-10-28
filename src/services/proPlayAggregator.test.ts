import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ChampionDb } from "../types/champion";

// isTauri() is true under the test setup, so httpFetch routes through
// @tauri-apps/plugin-http — mock it to feed Leaguepedia Cargo responses.
const httpFetchMock = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => httpFetchMock(...args),
}));

const executeMock = vi.fn();
const selectMock = vi.fn();
let tauri = true;
vi.mock("../db/client", () => ({
  isTauri: () => tauri,
  getDb: async () => ({ execute: executeMock, select: selectMock }),
}));

import {
  aggregateFromProPlay,
  getProPlayLastRun,
  type ProAggregateProgress,
} from "./proPlayAggregator";

const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);
const PATCH = "16.1";

const DB = {
  champions: {
    Ahri: { id: "Ahri", key: "103", name: "Ahri" },
    MonkeyKing: { id: "MonkeyKing", key: "62", name: "Wukong" },
    LeeSin: { id: "LeeSin", key: "64", name: "Lee Sin" },
  },
} as unknown as ChampionDb;

interface Row {
  GameId?: string;
  Champion?: string;
  Role?: string;
  PlayerWin?: string;
}

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}
function page(rows: Row[]) {
  return okJson({ cargoquery: rows.map((title) => ({ title })) });
}
function status(code: number) {
  return { ok: false, status: code, json: async () => ({}) };
}
function ahriRows(n: number, from = 0): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    GameId: `G${from + i}`,
    Champion: "Ahri",
    Role: "Mid",
    PlayerWin: "Yes",
  }));
}

function fetchedOffsets(): string[] {
  return httpFetchMock.mock.calls.map(
    ([url]) => new URL(String(url)).searchParams.get("offset") ?? ""
  );
}
function insertedRows(): unknown[][] {
  const params = executeMock.mock.calls
    .filter(([sql]) => String(sql).startsWith("INSERT INTO meta_aggregate ("))
    .flatMap(([, p]) => p as unknown[]);
  const rows: unknown[][] = [];
  for (let i = 0; i < params.length; i += 9) rows.push(params.slice(i, i + 9));
  return rows;
}
function metaWrite(key: string): unknown[] | undefined {
  return executeMock.mock.calls.find(([sql]) => String(sql).includes(`'${key}'`))?.[1];
}

/** Run with fake timers flushed so the throttling/backoff sleeps resolve instantly. */
async function run(daysBack = 14, onProgress: (p: ProAggregateProgress) => void = () => {}) {
  const p = aggregateFromProPlay(DB, PATCH, daysBack, onProgress);
  // Attach a no-op handler so a rejection isn't reported as unhandled while timers flush.
  p.catch(() => {});
  await vi.runAllTimersAsync();
  return p;
}

beforeEach(() => {
  tauri = true;
  httpFetchMock.mockReset();
  executeMock.mockReset().mockResolvedValue({ rowsAffected: 0 });
  selectMock.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("aggregateFromProPlay", () => {
  it("returns zeros without fetching outside Tauri", async () => {
    tauri = false;
    expect(await run()).toEqual({ rows: 0, games: 0 });
    expect(httpFetchMock).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("queries Leaguepedia Cargo for major tournaments since `daysBack` days ago", async () => {
    httpFetchMock.mockResolvedValue(page([]));
    await run(14);

    expect(httpFetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = httpFetchMock.mock.calls[0];
    const u = new URL(String(url));
    expect(u.origin + u.pathname).toBe("https://lol.fandom.com/api.php");
    expect(u.searchParams.get("action")).toBe("cargoquery");
    expect(u.searchParams.get("limit")).toBe("500");
    expect(u.searchParams.get("offset")).toBe("0");
    const where = u.searchParams.get("where") ?? "";
    expect(where).toContain('Tournament LIKE "LCK%"');
    expect(where).toContain('Tournament LIKE "Worlds%"');
    expect(where).toContain('SG.DateTime_UTC >= "2026-10-13 12:00:00"');
    expect((init as RequestInit).headers).toMatchObject({
      "User-Agent": expect.stringContaining("Draftboard"),
    });
  });

  it("aggregates picks per champion+role, matching names and ids case-insensitively", async () => {
    httpFetchMock.mockResolvedValueOnce(
      page([
        { GameId: "G1", Champion: "Ahri", Role: "Mid", PlayerWin: "Yes" },
        { GameId: "G1", Champion: "wukong", Role: "Top", PlayerWin: "No" },
        { GameId: "G1", Champion: "Lee Sin", Role: "Jungle", PlayerWin: "Yes" },
        { GameId: "G2", Champion: "MonkeyKing", Role: "Top", PlayerWin: "Yes" },
        { GameId: "G2", Champion: "AHRI", Role: "Mid", PlayerWin: "No" },
        // Unknown champion / role: skipped from counts but the game still counts
        // (G4 has no other row, so it is only counted via this path).
        { GameId: "G4", Champion: "Mel 2.0", Role: "Bot", PlayerWin: "Yes" },
        { GameId: "G2", Champion: "Ahri", Role: "Coach", PlayerWin: "Yes" },
        // Incomplete row: ignored entirely (G3 never counted as a game).
        { GameId: "G3", Role: "Mid", PlayerWin: "Yes" },
      ])
    );
    const progress: ProAggregateProgress[] = [];

    const result = await run(14, (p) => progress.push(p));

    expect(result).toEqual({ rows: 3, games: 3 });
    const proPatch = `proplay-${PATCH}`;
    expect(executeMock.mock.calls[0]).toEqual(["DELETE FROM meta_aggregate WHERE patch = $1", [proPatch]]);
    // 5 counted picks in total → pick rate = games / 5.
    expect(insertedRows()).toEqual([
      [103, "MIDDLE", 2, 1, 0.5, 2 / 5, 0, proPatch, NOW],
      [62, "TOP", 2, 1, 0.5, 2 / 5, 0, proPatch, NOW],
      [64, "JUNGLE", 1, 1, 1, 1 / 5, 0, proPatch, NOW],
    ]);
    expect(metaWrite("proplay_last_run")).toEqual([String(NOW)]);
    expect(metaWrite("proplay_games")).toEqual(["3"]);
    expect(progress[0]).toEqual({ phase: "Buscando partidas pro recientes", done: 0, total: 1 });
    expect(progress).toContainEqual({ phase: "Guardando", done: 3, total: 3 });
    expect(progress[progress.length - 1]).toEqual({ phase: "Listo", done: 3, total: 3 });
  });

  it("pages through results 500 at a time, waiting 1.5s between pages", async () => {
    httpFetchMock
      .mockResolvedValueOnce(page(ahriRows(500)))
      .mockResolvedValueOnce(page(ahriRows(1, 500)));

    const p = aggregateFromProPlay(DB, PATCH, 14, () => {});
    await vi.advanceTimersByTimeAsync(1499);
    expect(httpFetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(httpFetchMock).toHaveBeenCalledTimes(2);
    const result = await p;

    expect(fetchedOffsets()).toEqual(["0", "500"]);
    expect(result).toEqual({ rows: 1, games: 501 });
    expect(insertedRows()[0].slice(0, 4)).toEqual([103, "MIDDLE", 501, 501]);
  });

  it("stops after 6 pages even if every page is full", async () => {
    let from = 0;
    httpFetchMock.mockImplementation(async () => {
      const rows = ahriRows(500, from);
      from += 500;
      return page(rows);
    });

    const result = await run();

    expect(fetchedOffsets()).toEqual(["0", "500", "1000", "1500", "2000", "2500"]);
    expect(result.games).toBe(3000);
  });

  it("backs off 3s on a 429 and retries the same page", async () => {
    httpFetchMock
      .mockResolvedValueOnce(status(429))
      .mockResolvedValueOnce(page(ahriRows(1)));
    const progress: ProAggregateProgress[] = [];

    const p = aggregateFromProPlay(DB, PATCH, 14, (x) => progress.push(x));
    await vi.advanceTimersByTimeAsync(2999);
    expect(httpFetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(httpFetchMock).toHaveBeenCalledTimes(2);
    const result = await p;

    expect(fetchedOffsets()).toEqual(["0", "0"]);
    expect(progress).toContainEqual({
      phase: "Rate-limited por Leaguepedia, esperando 3s...",
      done: 0,
      total: 6,
    });
    expect(result).toEqual({ rows: 1, games: 1 });
  });

  it("gives up after 4 consecutive 429s with exponential waits", async () => {
    httpFetchMock.mockResolvedValue(status(429));
    const progress: ProAggregateProgress[] = [];

    const p = aggregateFromProPlay(DB, PATCH, 14, (x) => progress.push(x));
    const callsAfter = async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
      return httpFetchMock.mock.calls.length;
    };
    // Retries land at t=3s, t=9s (3+6) and t=21s (3+6+12).
    expect(await callsAfter(2999)).toBe(1);
    expect(await callsAfter(1)).toBe(2);
    expect(await callsAfter(5999)).toBe(2);
    expect(await callsAfter(1)).toBe(3);
    expect(await callsAfter(11_999)).toBe(3);
    expect(await callsAfter(1)).toBe(4);
    await vi.runAllTimersAsync();
    const result = await p;

    expect(httpFetchMock).toHaveBeenCalledTimes(4);
    const waits = progress.map((p) => p.phase).filter((ph) => ph.startsWith("Rate-limited"));
    expect(waits).toEqual([
      "Rate-limited por Leaguepedia, esperando 3s...",
      "Rate-limited por Leaguepedia, esperando 6s...",
      "Rate-limited por Leaguepedia, esperando 12s...",
      "Rate-limited por Leaguepedia, esperando 24s...",
    ]);
    expect(result).toEqual({ rows: 0, games: 0 });
  });

  it("does not retry non-429 failures (HTTP 500 or network error)", async () => {
    httpFetchMock.mockResolvedValueOnce(status(500));
    expect(await run()).toEqual({ rows: 0, games: 0 });
    expect(httpFetchMock).toHaveBeenCalledTimes(1);

    httpFetchMock.mockReset().mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await run()).toEqual({ rows: 0, games: 0 });
    expect(httpFetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on a non-transient Cargo error without touching the DB", async () => {
    httpFetchMock.mockResolvedValueOnce(okJson({ error: { info: "Invalid field name SP.Foo" } }));
    await expect(run()).rejects.toThrow("Leaguepedia: Invalid field name SP.Foo");
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("uses a generic message when the Cargo error has no info", async () => {
    httpFetchMock.mockResolvedValueOnce(okJson({ error: {} }));
    await expect(run()).rejects.toThrow("Leaguepedia: error");
  });

  it.each([
    "You've exceeded your rate limit",
    "[abc123] MWException from line 42",
    "Internal error in Cargo",
    "HTTP 503 Service Unavailable",
  ])("soft-fails on transient error %j instead of throwing", async (info) => {
    httpFetchMock.mockResolvedValueOnce(okJson({ error: { info } }));
    const progress: ProAggregateProgress[] = [];

    await expect(run(14, (p) => progress.push(p))).resolves.toEqual({ rows: 0, games: 0 });
    expect(progress).toContainEqual({
      phase: `Leaguepedia error transitorio (${info.slice(0, 60)}). Reintenta en 1-2 min.`,
      done: 0,
      total: 6,
    });
  });

  it("keeps the pages already downloaded when a later page hits a transient error", async () => {
    httpFetchMock
      .mockResolvedValueOnce(page(ahriRows(500)))
      .mockResolvedValueOnce(okJson({ error: { info: "MWException" } }));
    const progress: ProAggregateProgress[] = [];

    const result = await run(14, (p) => progress.push(p));

    expect(progress).toContainEqual({
      phase: "Leaguepedia error transitorio — usando 500 partidas descargadas",
      done: 1,
      total: 6,
    });
    expect(result).toEqual({ rows: 1, games: 500 });
  });

  // BUG: when no page could be downloaded (network down, 5xx, 4×429, or a
  // transient Cargo error on page 0), the function still DELETEs the existing
  // proplay-<patch> rows and stamps proplay_last_run/proplay_games=0. A manual
  // re-sync during a Leaguepedia outage wipes previously synced pro meta, and
  // autoProSync then marks the patch as synced so it is never retried.
  it.skip("BUG: leaves existing proplay rows untouched when nothing was downloaded", async () => {
    httpFetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await run();
    expect(executeMock.mock.calls.map(([sql]) => String(sql))).not.toContain(
      "DELETE FROM meta_aggregate WHERE patch = $1"
    );
    expect(metaWrite("proplay_last_run")).toBeUndefined();
  });
});

describe("getProPlayLastRun", () => {
  it("returns empty defaults outside Tauri", async () => {
    tauri = false;
    expect(await getProPlayLastRun()).toEqual({ ts: null, games: 0 });
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("parses the stored timestamp and game count", async () => {
    selectMock.mockResolvedValue([
      { key: "proplay_last_run", value: "1760000000000" },
      { key: "proplay_games", value: "412" },
    ]);
    expect(await getProPlayLastRun()).toEqual({ ts: 1_760_000_000_000, games: 412 });
  });

  it("returns ts=null and games=0 when the keys were never written", async () => {
    selectMock.mockResolvedValue([]);
    expect(await getProPlayLastRun()).toEqual({ ts: null, games: 0 });
  });
});
