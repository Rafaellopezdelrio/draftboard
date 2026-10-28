import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RiotConfig } from "./riotApi";

const getSummonerByPuuid = vi.fn();
const getTopMasteries = vi.fn();
const getRecentMatchIds = vi.fn();
const getLeagueEntriesByPuuid = vi.fn();
const getMatchFull = vi.fn();

vi.mock("./riotApi", () => ({
  getSummonerByPuuid: (...a: unknown[]) => getSummonerByPuuid(...a),
  getTopMasteries: (...a: unknown[]) => getTopMasteries(...a),
  getRecentMatchIds: (...a: unknown[]) => getRecentMatchIds(...a),
  getLeagueEntriesByPuuid: (...a: unknown[]) => getLeagueEntriesByPuuid(...a),
  getMatchFull: (...a: unknown[]) => getMatchFull(...a),
}));

import { scoutPlayer, clearScoutCache } from "./enemyScout";

const CFG: RiotConfig = { apiKey: "k", region: "euw1", riotIdName: "Me", riotIdTag: "EUW" } as RiotConfig;
const NOW = 1_700_000_000_000;

/** Minimal match whose only relevant participant is the scouted player. */
function match(id: string, championId: number, win: boolean, puuid = "p1") {
  return {
    matchId: id,
    participants: [
      { puuid: "someone-else", championId: 1, win: !win },
      { puuid, championId, win },
    ],
  };
}

function soloq(over: Record<string, unknown> = {}) {
  return {
    queueType: "RANKED_SOLO_5x5",
    tier: "GOLD",
    rank: "II",
    leaguePoints: 47,
    wins: 10,
    losses: 8,
    hotStreak: true,
    veteran: false,
    freshBlood: false,
    ...over,
  };
}

let now = NOW;

beforeEach(() => {
  clearScoutCache();
  now = NOW;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  for (const m of [getSummonerByPuuid, getTopMasteries, getRecentMatchIds, getLeagueEntriesByPuuid, getMatchFull]) {
    m.mockReset();
  }
  getSummonerByPuuid.mockResolvedValue({ puuid: "p1", summonerLevel: 312 });
  getTopMasteries.mockResolvedValue([
    { championId: 103, championLevel: 7, championPoints: 250_000, lastPlayTime: 0 },
    { championId: 157, championLevel: 5, championPoints: 40_000, lastPlayTime: 0 },
  ]);
  getRecentMatchIds.mockResolvedValue([]);
  getLeagueEntriesByPuuid.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("scoutPlayer", () => {
  it("aggregates summoner, solo-queue rank, masteries and recent form", async () => {
    getLeagueEntriesByPuuid.mockResolvedValue([
      soloq({ queueType: "RANKED_FLEX_SR", tier: "IRON", rank: "IV", leaguePoints: 1, hotStreak: false }),
      soloq(),
    ]);
    getRecentMatchIds.mockResolvedValue(["m1", "m2", "m3"]);
    const byId: Record<string, unknown> = {
      m1: match("m1", 103, true),
      m2: match("m2", 157, false),
      m3: match("m3", 103, true),
    };
    getMatchFull.mockImplementation(async (_cfg: unknown, id: string) => byId[id]);

    const r = await scoutPlayer(CFG, "p1", 157);

    expect(getTopMasteries).toHaveBeenCalledWith(CFG, "p1", 7);
    expect(getRecentMatchIds).toHaveBeenCalledWith(CFG, "p1", 10);
    expect(r).toEqual({
      puuid: "p1",
      summonerLevel: 312,
      // Flex entry ignored; solo queue wins.
      rank: "GOLD II",
      lp: 47,
      recentWins: 2,
      recentLosses: 1,
      hotStreak: true,
      coldStreak: false,
      topChampionIds: [103, 157],
      topMasteries: [
        { championId: 103, level: 7, points: 250_000 },
        { championId: 157, level: 5, points: 40_000 },
      ],
      mainChampionId: 103,
      mostPlayedRecent: { championId: 103, games: 2, wins: 2 },
      pickedChampionMastery: { championId: 157, level: 5, points: 40_000 },
    });
  });

  it("degrades to nulls/empties when every Riot call fails", async () => {
    getSummonerByPuuid.mockRejectedValue(new Error("403"));
    getTopMasteries.mockRejectedValue(new Error("403"));
    getRecentMatchIds.mockRejectedValue(new Error("403"));
    getLeagueEntriesByPuuid.mockRejectedValue(new Error("403"));

    const r = await scoutPlayer(CFG, "p1", 103);

    expect(r).toMatchObject({
      summonerLevel: null,
      rank: null,
      lp: null,
      hotStreak: false,
      recentWins: 0,
      recentLosses: 0,
      coldStreak: false,
      topChampionIds: [],
      topMasteries: [],
      mainChampionId: null,
      mostPlayedRecent: null,
      // Picked champion isn't in the (empty) mastery list.
      pickedChampionMastery: null,
    });
    expect(getMatchFull).not.toHaveBeenCalled();
  });

  it("leaves rank null when the player has no solo-queue entry", async () => {
    getLeagueEntriesByPuuid.mockResolvedValue([soloq({ queueType: "RANKED_FLEX_SR" })]);
    const r = await scoutPlayer(CFG, "p1");
    expect(r.rank).toBeNull();
    expect(r.lp).toBeNull();
    expect(r.hotStreak).toBe(false);
  });

  it("returns null picked mastery when no champion is given, even if masteries exist", async () => {
    const r = await scoutPlayer(CFG, "p1");
    expect(r.pickedChampionMastery).toBeNull();
    expect(r.mainChampionId).toBe(103);
  });

  it("flags a cold streak when the 4 most recent counted games are losses", async () => {
    const ids = ["m1", "m2", "m3", "m4", "m5"];
    getRecentMatchIds.mockResolvedValue(ids);
    getMatchFull.mockImplementation(async (_cfg: unknown, id: string) =>
      match(id, 22, id === "m5")
    );
    const r = await scoutPlayer(CFG, "p1");
    expect(r.coldStreak).toBe(true);
    expect(r.recentWins).toBe(1);
    expect(r.recentLosses).toBe(4);
  });

  it("flags a cold streak with exactly 4 counted games, all losses", async () => {
    getRecentMatchIds.mockResolvedValue(["m1", "m2", "m3", "m4"]);
    getMatchFull.mockImplementation(async (_cfg: unknown, id: string) => match(id, 22, false));
    const r = await scoutPlayer(CFG, "p1");
    expect(r.coldStreak).toBe(true);
  });

  it("does not flag a cold streak with fewer than 4 counted games", async () => {
    getRecentMatchIds.mockResolvedValue(["m1", "m2", "m3"]);
    getMatchFull.mockImplementation(async (_cfg: unknown, id: string) => match(id, 22, false));
    const r = await scoutPlayer(CFG, "p1");
    expect(r.recentLosses).toBe(3);
    expect(r.coldStreak).toBe(false);
  });

  it("does not flag a cold streak when a win is among the 4 most recent", async () => {
    getRecentMatchIds.mockResolvedValue(["m1", "m2", "m3", "m4", "m5"]);
    getMatchFull.mockImplementation(async (_cfg: unknown, id: string) =>
      match(id, 22, id === "m2")
    );
    const r = await scoutPlayer(CFG, "p1");
    expect(r.coldStreak).toBe(false);
  });

  it("skips failed match fetches and matches the player is not in", async () => {
    getRecentMatchIds.mockResolvedValue(["ok", "boom", "foreign"]);
    getMatchFull.mockImplementation(async (_cfg: unknown, id: string) => {
      if (id === "boom") throw new Error("429");
      if (id === "foreign") return match(id, 99, true, "not-p1");
      return match(id, 64, true);
    });
    const r = await scoutPlayer(CFG, "p1");
    expect(r.recentWins).toBe(1);
    expect(r.recentLosses).toBe(0);
    expect(r.mostPlayedRecent).toEqual({ championId: 64, games: 1, wins: 1 });
  });

  it("only fetches the 10 most recent matches", async () => {
    const ids = Array.from({ length: 15 }, (_, i) => `m${i}`);
    getRecentMatchIds.mockResolvedValue(ids);
    getMatchFull.mockImplementation(async (_cfg: unknown, id: string) => match(id, 1, true));
    const r = await scoutPlayer(CFG, "p1");
    expect(getMatchFull).toHaveBeenCalledTimes(10);
    expect(getMatchFull.mock.calls.map((c) => c[1])).toEqual(ids.slice(0, 10));
    expect(r.recentWins).toBe(10);
  });

  it("keeps the first champion on a games tie for mostPlayedRecent", async () => {
    getRecentMatchIds.mockResolvedValue(["a", "b"]);
    getMatchFull.mockImplementation(async (_cfg: unknown, id: string) =>
      id === "a" ? match(id, 11, false) : match(id, 22, true)
    );
    const r = await scoutPlayer(CFG, "p1");
    expect(r.mostPlayedRecent).toEqual({ championId: 11, games: 1, wins: 0 });
  });

  describe("cache", () => {
    it("serves a repeat call from cache within 5 minutes", async () => {
      const first = await scoutPlayer(CFG, "p1", 103);
      now = NOW + 5 * 60 * 1000 - 1;
      const second = await scoutPlayer(CFG, "p1", 103);
      expect(second).toBe(first);
      expect(getSummonerByPuuid).toHaveBeenCalledTimes(1);
    });

    it("refetches once the 5 minute TTL has elapsed", async () => {
      await scoutPlayer(CFG, "p1", 103);
      now = NOW + 5 * 60 * 1000;
      getSummonerByPuuid.mockResolvedValue({ puuid: "p1", summonerLevel: 313 });
      const r = await scoutPlayer(CFG, "p1", 103);
      expect(getSummonerByPuuid).toHaveBeenCalledTimes(2);
      expect(r.summonerLevel).toBe(313);
    });

    it("keys the cache by picked champion", async () => {
      const a = await scoutPlayer(CFG, "p1", 103);
      const b = await scoutPlayer(CFG, "p1", 157);
      const any = await scoutPlayer(CFG, "p1");
      expect(getSummonerByPuuid).toHaveBeenCalledTimes(3);
      expect(a.pickedChampionMastery?.championId).toBe(103);
      expect(b.pickedChampionMastery?.championId).toBe(157);
      expect(any.pickedChampionMastery).toBeNull();
    });

    it("clearScoutCache forces a refetch", async () => {
      await scoutPlayer(CFG, "p1");
      clearScoutCache();
      await scoutPlayer(CFG, "p1");
      expect(getSummonerByPuuid).toHaveBeenCalledTimes(2);
    });

    it("evicts the oldest entry once it holds more than 100 players", async () => {
      for (let i = 0; i <= 100; i++) await scoutPlayer(CFG, `p${i}`);
      expect(getSummonerByPuuid).toHaveBeenCalledTimes(101);

      // Newest entry is still cached...
      await scoutPlayer(CFG, "p100");
      expect(getSummonerByPuuid).toHaveBeenCalledTimes(101);
      // ...second-oldest too...
      await scoutPlayer(CFG, "p1");
      expect(getSummonerByPuuid).toHaveBeenCalledTimes(101);
      // ...but the oldest was dropped and must be fetched again.
      await scoutPlayer(CFG, "p0");
      expect(getSummonerByPuuid).toHaveBeenCalledTimes(102);
    });
  });
});
