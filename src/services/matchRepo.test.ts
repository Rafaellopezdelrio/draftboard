import { describe, it, expect, vi, beforeEach } from "vitest";

// Control the DB layer: isTauri() toggles the no-op branch, getDb hands back
// select/execute spies so we can assert the SQL params and feed raw rows.
const selectMock = vi.fn();
const executeMock = vi.fn();
const getDbMock = vi.fn();
let tauri = true;
vi.mock("../db/client", () => ({
  isTauri: () => tauri,
  getDb: () => getDbMock(),
}));

import {
  clearAllMatches,
  existingMatchIds,
  saveMatch,
  recentMatches,
  personalStatsByChampion,
  personalMatchupsByRole,
  personalStatsByChampionAndRole,
} from "./matchRepo";
import type { MatchSummary } from "./riotApi";

function dbRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    match_id: "EUW1_1",
    champion_id: 103,
    win: 1,
    kills: 7,
    deaths: 2,
    assists: 9,
    cs: 210,
    duration_sec: 1800,
    end_ts_ms: 1_700_000_000_000,
    queue_id: 420,
    position: "MIDDLE",
    opponent_champion_id: 157,
    vision_score: 24,
    gold_earned: 12000,
    ...over,
  };
}

beforeEach(() => {
  tauri = true;
  selectMock.mockReset().mockResolvedValue([]);
  executeMock.mockReset().mockResolvedValue({ rowsAffected: 1 });
  getDbMock.mockReset().mockResolvedValue({ select: selectMock, execute: executeMock });
});

describe("matchRepo outside Tauri", () => {
  it("returns empty defaults and never opens the DB", async () => {
    tauri = false;
    await clearAllMatches();
    await saveMatch({} as MatchSummary);
    expect(await existingMatchIds()).toEqual(new Set());
    expect(await recentMatches()).toEqual([]);
    expect(await personalStatsByChampion()).toEqual([]);
    expect(await personalMatchupsByRole("TOP")).toEqual([]);
    expect(await personalStatsByChampionAndRole()).toEqual([]);
    expect(getDbMock).not.toHaveBeenCalled();
  });
});

describe("clearAllMatches / existingMatchIds", () => {
  it("clearAllMatches deletes every match row", async () => {
    await clearAllMatches();
    expect(executeMock).toHaveBeenCalledWith("DELETE FROM matches");
  });

  it("existingMatchIds collapses rows into a Set (dedupe-ready for sync)", async () => {
    selectMock.mockResolvedValue([{ match_id: "A" }, { match_id: "B" }, { match_id: "A" }]);
    const ids = await existingMatchIds();
    expect(ids).toEqual(new Set(["A", "B"]));
    expect(selectMock.mock.calls[0][0]).toContain("SELECT match_id FROM matches");
  });
});

describe("saveMatch", () => {
  const base: MatchSummary = {
    matchId: "EUW1_42",
    championId: 103,
    win: true,
    kills: 10,
    deaths: 3,
    assists: 5,
    cs: 250,
    durationSec: 1900,
    gameEndTimestampMs: 1_700_000_123_000,
    queueId: 420,
    position: "MIDDLE",
    opponentChampionId: 157,
    visionScore: 30,
    goldEarned: 14500,
  };

  it("upserts with the 14 columns in placeholder order and win as 1", async () => {
    await saveMatch(base);
    const [sql, params] = executeMock.mock.calls[0];
    expect(sql).toContain("INSERT OR REPLACE INTO matches");
    expect(params).toEqual([
      "EUW1_42", 103, 1, 10, 3, 5, 250, 1900, 1_700_000_123_000, 420, "MIDDLE", 157, 30, 14500,
    ]);
  });

  it("stores a loss as 0 and missing vision/gold (pre-010 sync) as NULL", async () => {
    await saveMatch({ ...base, win: false, visionScore: undefined, goldEarned: undefined });
    const params = executeMock.mock.calls[0][1] as unknown[];
    expect(params[2]).toBe(0);
    expect(params[12]).toBeNull();
    expect(params[13]).toBeNull();
  });

  it("keeps a genuine 0 vision/gold instead of storing NULL", async () => {
    await saveMatch({ ...base, visionScore: 0, goldEarned: 0 });
    expect((executeMock.mock.calls[0][1] as unknown[]).slice(12)).toEqual([0, 0]);
  });
});

describe("recentMatches", () => {
  it("defaults to LIMIT 50 with no filters, newest first", async () => {
    await recentMatches();
    const [sql, params] = selectMock.mock.calls[0];
    expect(sql).toBe("SELECT * FROM matches WHERE 1=1 ORDER BY end_ts_ms DESC LIMIT $1");
    expect(params).toEqual([50]);
  });

  it("numbers placeholders to match the pushed params when both filters are set", async () => {
    await recentMatches(10, { position: "JUNGLE", queueId: 440 });
    const [sql, params] = selectMock.mock.calls[0];
    expect(sql).toContain("AND position = $1");
    expect(sql).toContain("AND queue_id = $2");
    expect(sql).toContain("LIMIT $3");
    expect(params).toEqual(["JUNGLE", 440, 10]);
  });

  it("treats queueId 0 as a real filter but skips an empty position", async () => {
    await recentMatches(5, { position: "", queueId: 0 });
    const [sql, params] = selectMock.mock.calls[0];
    expect(sql).not.toContain("position =");
    expect(sql).toContain("AND queue_id = $1");
    expect(params).toEqual([0, 5]);
  });

  it("maps snake_case rows to MatchSummary (win bool, null opponent → 0)", async () => {
    selectMock.mockResolvedValue([
      dbRow(),
      dbRow({
        match_id: "EUW1_2",
        win: 0,
        opponent_champion_id: null,
        vision_score: null,
        gold_earned: undefined,
      }),
      dbRow({ match_id: "EUW1_3", vision_score: 0, gold_earned: 0 }),
    ]);
    const out = await recentMatches();
    expect(out[0]).toEqual({
      matchId: "EUW1_1",
      championId: 103,
      win: true,
      kills: 7,
      deaths: 2,
      assists: 9,
      cs: 210,
      durationSec: 1800,
      gameEndTimestampMs: 1_700_000_000_000,
      queueId: 420,
      position: "MIDDLE",
      opponentChampionId: 157,
      visionScore: 24,
      goldEarned: 12000,
    });
    expect(out[1]).toMatchObject({
      matchId: "EUW1_2",
      win: false,
      opponentChampionId: 0,
      visionScore: null,
      goldEarned: null,
    });
    // 0 is a real score, not "missing"
    expect(out[2]).toMatchObject({ matchId: "EUW1_3", visionScore: 0, goldEarned: 0 });
  });
});

describe("personalStatsByChampion", () => {
  it("aggregates over all roles without a position filter", async () => {
    selectMock.mockResolvedValue([
      { champion_id: 103, games: 4, wins: 3 },
      { champion_id: 99, games: 0, wins: 0 },
    ]);
    const out = await personalStatsByChampion();
    const [sql, params] = selectMock.mock.calls[0];
    expect(sql).not.toContain("position =");
    expect(sql).toContain("GROUP BY champion_id ORDER BY games DESC");
    expect(params).toEqual([]);
    expect(out).toEqual([
      { championId: 103, position: undefined, games: 4, wins: 3, winRate: 0.75 },
      // games 0 must not divide by zero
      { championId: 99, position: undefined, games: 0, wins: 0, winRate: 0 },
    ]);
  });

  it("filters by position and tags each stat with it", async () => {
    selectMock.mockResolvedValue([{ champion_id: 64, games: 5, wins: 2 }]);
    const out = await personalStatsByChampion({ position: "JUNGLE" });
    const [sql, params] = selectMock.mock.calls[0];
    expect(sql).toContain("AND position = $1");
    expect(params).toEqual(["JUNGLE"]);
    expect(out).toEqual([
      { championId: 64, position: "JUNGLE", games: 5, wins: 2, winRate: 0.4 },
    ]);
  });
});

describe("personalMatchupsByRole", () => {
  it("queries by role with a default min-games of 2 and maps winRate", async () => {
    selectMock.mockResolvedValue([
      { opponent_champion_id: 157, games: 4, wins: 1 },
      { opponent_champion_id: 238, games: 2, wins: 2 },
    ]);
    const out = await personalMatchupsByRole("MIDDLE");
    const [sql, params] = selectMock.mock.calls[0];
    expect(sql).toContain("WHERE position = $1 AND opponent_champion_id > 0");
    expect(sql).toContain("HAVING games >= $2");
    expect(params).toEqual(["MIDDLE", 2]);
    expect(out).toEqual([
      { position: "MIDDLE", opponentChampionId: 157, games: 4, wins: 1, winRate: 0.25 },
      { position: "MIDDLE", opponentChampionId: 238, games: 2, wins: 2, winRate: 1 },
    ]);
  });

  it("passes a custom min-games threshold", async () => {
    await personalMatchupsByRole("TOP", 5);
    expect(selectMock.mock.calls[0][1]).toEqual(["TOP", 5]);
  });

  it("returns [] when the query fails (old DB without opponent column)", async () => {
    selectMock.mockRejectedValue(new Error("no such column: opponent_champion_id"));
    await expect(personalMatchupsByRole("TOP")).resolves.toEqual([]);
  });
});

describe("personalStatsByChampionAndRole", () => {
  it("groups by champion+role, excluding blank positions, and maps rows", async () => {
    selectMock.mockResolvedValue([
      { champion_id: 103, position: "MIDDLE", games: 10, wins: 6 },
      { champion_id: 103, position: "BOTTOM", games: 0, wins: 0 },
    ]);
    const out = await personalStatsByChampionAndRole();
    expect(selectMock.mock.calls[0][0]).toContain("WHERE position != ''");
    expect(out).toEqual([
      { championId: 103, position: "MIDDLE", games: 10, wins: 6, winRate: 0.6 },
      { championId: 103, position: "BOTTOM", games: 0, wins: 0, winRate: 0 },
    ]);
  });
});
