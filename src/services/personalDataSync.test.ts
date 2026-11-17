import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MatchSummary } from "./riotApi";
import type { LcuRankInfo } from "./lcuPersonalData";

const loadSettingsMock = vi.fn();
// Account auto-detection (clean install) has its own tests.
// Following the client account has its own tests: here it keeps the saved one.
vi.mock("./accountResolve", () => ({
  followClientAccount: vi.fn(async () => null),
  regionFromClient: (r?: string) => (r ? r.toLowerCase() + "1" : null),
}));
const getCurrentSummonerMock = vi.fn(async () => null as unknown);
vi.mock("./lcuService", () => ({ getCurrentSummoner: () => getCurrentSummonerMock() }));
vi.mock("./settingsRepo", () => ({
  loadSettings: () => loadSettingsMock(),
}));

const getRiotProxyUrlMock = vi.fn();
const getRecentMatchIdsMock = vi.fn();
// Season backfill lists by queue (4th arg); kept apart so the recent-games
// tests see only their own call.
const seasonIdsMock = vi.fn(async (..._a: unknown[]) => [] as string[]);
const getMatchMock = vi.fn();
const getTopMasteriesMock = vi.fn();
vi.mock("./riotApi", () => ({
  getRiotProxyUrl: () => getRiotProxyUrlMock(),
  getRecentMatchIds: (...a: unknown[]) =>
    a[3] === undefined ? getRecentMatchIdsMock(...a) : seasonIdsMock(...a),
  getMatch: (...a: unknown[]) => getMatchMock(...a),
  getTopMasteries: (...a: unknown[]) => getTopMasteriesMock(...a),
}));

const existingMatchIdsMock = vi.fn();
const saveMatchMock = vi.fn();
const dropLcuTwinsMock = vi.fn();
const storedMatchEndsMock = vi.fn(async () => new Map<string, number>());
const claimUnownedMatchesMock = vi.fn(async (..._a: unknown[]) => {});
vi.mock("./matchRepo", () => ({
  existingMatchIds: () => existingMatchIdsMock(),
  saveMatch: (...a: unknown[]) => saveMatchMock(...a),
  dropLcuTwins: () => dropLcuTwinsMock(),
  storedMatchEnds: () => storedMatchEndsMock(),
  claimUnownedMatches: (...a: unknown[]) => claimUnownedMatchesMock(...a),
  gameIdOf: (id: string) => id.slice(id.lastIndexOf("_") + 1),
}));

const linkDraftToMatchMock = vi.fn();
vi.mock("./draftsRepo", () => ({
  linkDraftToMatch: (...a: unknown[]) => linkDraftToMatchMock(...a),
}));

const lcuRecentMatchesMock = vi.fn();
const lcuMasteriesMock = vi.fn();
const lcuRankMock = vi.fn();
vi.mock("./lcuPersonalData", () => ({
  lcuRecentMatches: (...a: unknown[]) => lcuRecentMatchesMock(...a),
  lcuMasteries: () => lcuMasteriesMock(),
  lcuRank: () => lcuRankMock(),
}));

import { syncPersonalData, backfillSeason, seasonStartMs, type SyncProgress } from "./personalDataSync";

const SETTINGS = {
  apiKey: "RGAPI-test",
  region: "euw1",
  riotIdName: "Tester",
  riotIdTag: "EUW",
  puuid: "me",
};

const RANK: LcuRankInfo = {
  tier: "GOLD",
  division: "II",
  leaguePoints: 57,
  wins: 40,
  losses: 35,
  hotStreak: false,
};

function summary(matchId: string, championId = 103): MatchSummary {
  return {
    matchId,
    championId,
    win: true,
    kills: 5,
    deaths: 3,
    assists: 8,
    cs: 200,
    durationSec: 1800,
    gameEndTimestampMs: 1_700_000_000_000,
    queueId: 420,
    position: "MIDDLE",
    opponentChampionId: 238,
  };
}

function mastery(championId: number) {
  return { championId, championLevel: 7, championPoints: 100_000, lastPlayTime: 0 };
}

beforeEach(() => {
  for (const m of [
    loadSettingsMock,
    getRiotProxyUrlMock,
    getRecentMatchIdsMock,
    getMatchMock,
    getTopMasteriesMock,
    existingMatchIdsMock,
    saveMatchMock,
    dropLcuTwinsMock,
    linkDraftToMatchMock,
    lcuRecentMatchesMock,
    lcuMasteriesMock,
    lcuRankMock,
  ]) {
    m.mockReset();
  }
  getRiotProxyUrlMock.mockReturnValue(null);
  getCurrentSummonerMock.mockReset().mockResolvedValue(null);
  existingMatchIdsMock.mockResolvedValue(new Set<string>());
  saveMatchMock.mockResolvedValue(undefined);
  dropLcuTwinsMock.mockResolvedValue(undefined);
  linkDraftToMatchMock.mockResolvedValue(undefined);
  getTopMasteriesMock.mockResolvedValue([]);
  lcuRecentMatchesMock.mockResolvedValue([]);
  lcuMasteriesMock.mockResolvedValue([]);
  lcuRankMock.mockResolvedValue(null);
});

describe("syncPersonalData — Riot API path", () => {
  it("downloads only unknown matches, skips failures and links drafts", async () => {
    loadSettingsMock.mockResolvedValue(SETTINGS);
    getRecentMatchIdsMock.mockResolvedValue(["EUW1_1", "EUW1_2", "EUW1_3"]);
    existingMatchIdsMock.mockResolvedValue(new Set(["EUW1_1"]));
    getMatchMock.mockImplementation(async (_cfg: unknown, _puuid: string, id: string) => {
      if (id === "EUW1_3") throw new Error("404");
      return summary(id, 157);
    });
    // A draft-link failure must not abort or un-count the save.
    linkDraftToMatchMock.mockRejectedValue(new Error("no draft"));
    getTopMasteriesMock.mockResolvedValue([mastery(103), mastery(157)]);
    const progress: SyncProgress[] = [];

    const result = await syncPersonalData((p) => progress.push(p));

    expect(result).toEqual({ matches: 1, masteries: 2, rank: null, source: "Riot API" });
    expect(getRecentMatchIdsMock).toHaveBeenCalledWith(SETTINGS, "me", 50);
    expect(getMatchMock.mock.calls.map((c) => c[2])).toEqual(["EUW1_2", "EUW1_3"]);
    expect(saveMatchMock).toHaveBeenCalledTimes(1);
    expect(linkDraftToMatchMock).toHaveBeenCalledWith("EUW1_2", 157, 1_700_000_000_000);
    expect(getTopMasteriesMock).toHaveBeenCalledWith(SETTINGS, "me", 20);
    expect(progress.map((p) => p.message)).toEqual([
      "Listando partidas...",
      "Descargando 1/2",
      "Descargando 2/2",
    ]);
    expect(lcuRecentMatchesMock).not.toHaveBeenCalled();
  });

  it("drops the LCU twins after a Riot sync, and a failure there does not fail the sync", async () => {
    loadSettingsMock.mockResolvedValue(SETTINGS);
    getRecentMatchIdsMock.mockResolvedValue(["EUW1_7"]);
    // The same game is already stored from an earlier LCU fallback.
    existingMatchIdsMock.mockResolvedValue(new Set(["LCU_7"]));
    getMatchMock.mockResolvedValue(summary("EUW1_7"));
    dropLcuTwinsMock.mockRejectedValue(new Error("db locked"));

    const result = await syncPersonalData();

    expect(result.source).toBe("Riot API");
    expect(saveMatchMock).toHaveBeenCalledTimes(1);
    expect(dropLcuTwinsMock).toHaveBeenCalledTimes(1);
  });

  it("uses the Riot proxy when no personal key is set and tolerates mastery failures", async () => {
    loadSettingsMock.mockResolvedValue({ ...SETTINGS, apiKey: "" });
    getRiotProxyUrlMock.mockReturnValue("https://proxy.example.workers.dev");
    getRecentMatchIdsMock.mockResolvedValue([]);
    getTopMasteriesMock.mockRejectedValue(new Error("503"));

    const result = await syncPersonalData();

    expect(result).toEqual({ matches: 0, masteries: 0, rank: null, source: "Riot API" });
    expect(getRecentMatchIdsMock).toHaveBeenCalledTimes(1);
    expect(lcuRecentMatchesMock).not.toHaveBeenCalled();
  });

  it("falls back to LCU when the Riot API listing fails", async () => {
    loadSettingsMock.mockResolvedValue(SETTINGS);
    getRecentMatchIdsMock.mockRejectedValue(new Error("403 Forbidden"));
    lcuRankMock.mockResolvedValue(RANK);
    const progress: SyncProgress[] = [];

    const result = await syncPersonalData((p) => progress.push(p));

    expect(progress).toContainEqual({
      source: "Riot API",
      done: 0,
      total: 0,
      message: "Riot API falló (403 Forbidden), probando LCU...",
      messageKey: "sync.riotFailed",
      messageParams: { error: "403 Forbidden" },
    });
    expect(result).toEqual({ matches: 0, masteries: 0, rank: RANK, source: "LCU" });
  });

  it("skips the Riot API when the puuid is unknown even with a key", async () => {
    loadSettingsMock.mockResolvedValue({ ...SETTINGS, puuid: undefined });
    lcuMasteriesMock.mockResolvedValue([mastery(1)]);

    const result = await syncPersonalData();

    expect(getRecentMatchIdsMock).not.toHaveBeenCalled();
    expect(result.source).toBe("LCU");
    expect(result.masteries).toBe(1);
  });

  it("goes straight to LCU when there is neither a key nor a proxy, even with a puuid", async () => {
    loadSettingsMock.mockResolvedValue({ ...SETTINGS, apiKey: "" });
    lcuRankMock.mockResolvedValue(RANK);

    const result = await syncPersonalData();

    expect(getRecentMatchIdsMock).not.toHaveBeenCalled();
    expect(result).toEqual({ matches: 0, masteries: 0, rank: RANK, source: "LCU" });
  });
});

describe("syncPersonalData — LCU path", () => {
  it("client games go to the saved account when the client is on it, and are not stored when it is on another", async () => {
    // Saved account, but no Riot access: the client path runs.
    loadSettingsMock.mockResolvedValue({ ...SETTINGS, apiKey: "" });
    getRiotProxyUrlMock.mockReturnValue(null);
    lcuRecentMatchesMock.mockResolvedValue([summary("LCU_5")]);
    lcuMasteriesMock.mockResolvedValue([]);
    lcuRankMock.mockResolvedValue(RANK);
    existingMatchIdsMock.mockResolvedValue(new Set());

    getCurrentSummonerMock.mockResolvedValue({ gameName: "tester", tagLine: "euw", region: "EUW" });
    await syncPersonalData();
    expect(saveMatchMock).toHaveBeenCalledWith(expect.objectContaining({ matchId: "LCU_5" }), "me");

    saveMatchMock.mockClear();
    getCurrentSummonerMock.mockResolvedValue({ gameName: "Smurfy", tagLine: "123", region: "EUW" });
    await syncPersonalData();
    expect(saveMatchMock).not.toHaveBeenCalled(); // a smurf's games never land in the main's
  });

  it("saves new LCU matches, returns masteries and rank", async () => {
    loadSettingsMock.mockResolvedValue(null);
    lcuRecentMatchesMock.mockResolvedValue([summary("LCU_1"), summary("LCU_2", 64), summary("LCU_3")]);
    lcuMasteriesMock.mockResolvedValue([mastery(103), mastery(64), mastery(1)]);
    lcuRankMock.mockResolvedValue(RANK);
    existingMatchIdsMock.mockResolvedValue(new Set(["LCU_1"]));
    linkDraftToMatchMock.mockRejectedValue(new Error("no draft"));
    const progress: SyncProgress[] = [];

    const result = await syncPersonalData((p) => progress.push(p));

    expect(result).toEqual({ matches: 2, masteries: 3, rank: RANK, source: "LCU" });
    expect(lcuRecentMatchesMock).toHaveBeenCalledWith(20);
    expect(saveMatchMock.mock.calls.map((c) => (c[0] as MatchSummary).matchId)).toEqual([
      "LCU_2",
      "LCU_3",
    ]);
    expect(linkDraftToMatchMock).toHaveBeenCalledWith("LCU_2", 64, 1_700_000_000_000);
    expect(progress).toEqual([
      { source: "LCU", done: 0, total: 1, message: "Conectando al cliente...", messageKey: "sync.connecting" },
      { source: "LCU", done: 2, total: 3, message: "Guardando 2/3", messageKey: "sync.saving", messageParams: { done: 2, total: 3 } },
      { source: "LCU", done: 3, total: 3, message: "Guardando 3/3", messageKey: "sync.saving", messageParams: { done: 3, total: 3 } },
    ]);
  });

  it("skips LCU games already stored under their Riot API id", async () => {
    loadSettingsMock.mockResolvedValue(null);
    lcuRecentMatchesMock.mockResolvedValue([summary("LCU_7412345678"), summary("LCU_9")]);
    existingMatchIdsMock.mockResolvedValue(new Set(["EUW1_7412345678"]));

    const result = await syncPersonalData();

    expect(result.matches).toBe(1);
    expect(saveMatchMock.mock.calls.map((c) => (c[0] as MatchSummary).matchId)).toEqual(["LCU_9"]);
    expect(linkDraftToMatchMock).toHaveBeenCalledTimes(1);
  });

  it("treats individual LCU endpoint failures as empty data", async () => {
    loadSettingsMock.mockResolvedValue(null);
    lcuRecentMatchesMock.mockRejectedValue(new Error("lockfile"));
    lcuMasteriesMock.mockRejectedValue(new Error("lockfile"));
    lcuRankMock.mockResolvedValue(RANK);

    const result = await syncPersonalData();

    expect(result).toEqual({ matches: 0, masteries: 0, rank: RANK, source: "LCU" });
    expect(saveMatchMock).not.toHaveBeenCalled();
  });

  it("reports source 'none' when neither Riot API nor LCU has data", async () => {
    loadSettingsMock.mockResolvedValue(null);
    lcuRankMock.mockRejectedValue(new Error("client closed"));
    const progress: SyncProgress[] = [];

    const result = await syncPersonalData((p) => progress.push(p));

    expect(result).toEqual({ matches: 0, masteries: 0, rank: null, source: "none" });
    expect(existingMatchIdsMock).not.toHaveBeenCalled();
    expect(progress[progress.length - 1]).toEqual({
      source: "none",
      done: 0,
      total: 0,
      message: "No data source available",
      messageKey: "sync.noSource",
    });
  });
});

describe("syncPersonalData — concurrency", () => {
  it("shares one in-flight run between concurrent callers, then allows a new run", async () => {
    let release!: (v: null) => void;
    loadSettingsMock.mockReturnValueOnce(new Promise((r) => (release = r)));
    const second = vi.fn();

    const p1 = syncPersonalData();
    const p2 = syncPersonalData(second);
    expect(p2).toBe(p1);

    release(null);
    await p1;
    expect(loadSettingsMock).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    loadSettingsMock.mockResolvedValue(null);
    const p3 = syncPersonalData();
    expect(p3).not.toBe(p1);
    await p3;
    expect(loadSettingsMock).toHaveBeenCalledTimes(2);
  });

  it("clears the in-flight guard after a failed run", async () => {
    loadSettingsMock.mockRejectedValueOnce(new Error("db locked"));
    await expect(syncPersonalData()).rejects.toThrow("db locked");

    loadSettingsMock.mockResolvedValue(null);
    await expect(syncPersonalData()).resolves.toMatchObject({ source: "none" });
  });
});

describe("backfillSeason", () => {
  const CFG = SETTINGS as Parameters<typeof backfillSeason>[0];
  const NOW = new Date(2026, 10, 18, 12, 0).getTime();
  const inSeason = (day: number) => new Date(2026, 0, day, 20, 0).getTime();
  const lastYear = new Date(2025, 11, 20, 20, 0).getTime();
  const game = (id: string, end: number, queueId = 420): MatchSummary => ({ ...summary(id), gameEndTimestampMs: end, queueId });
  const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => `EUW1_${from + i}`);

  beforeEach(() => {
    seasonIdsMock.mockReset();
    storedMatchEndsMock.mockReset().mockResolvedValue(new Map());
    getMatchMock.mockReset();
    saveMatchMock.mockReset().mockResolvedValue(undefined);
    linkDraftToMatchMock.mockReset().mockResolvedValue(undefined);
  });

  it("season starts on 1 January of the current year", () => {
    expect(seasonStartMs(NOW)).toBe(new Date(2026, 0, 1).getTime());
  });

  it("pages back through every queue until a game from before the season, saving only new ones", async () => {
    // Solo/Duo: 150 games this season, then last year's. Flex: 1. Clash: none.
    seasonIdsMock.mockImplementation(async (...a: unknown[]) => {
      const [, , , queue, start] = a as [unknown, unknown, number, number, number];
      if (queue === 420) return start === 0 ? page(0, 100) : start === 100 ? page(100, 100) : [];
      if (queue === 440) return ["EUW1_900"];
      return [];
    });
    getMatchMock.mockImplementation(async (...a: unknown[]) => {
      const id = a[2] as string;
      const n = Number(id.slice(5));
      if (id === "EUW1_900") return game(id, inSeason(3), 440);
      return game(id, n < 150 ? inSeason(10) : lastYear);
    });
    // Ten of them are already stored: no download for those.
    storedMatchEndsMock.mockResolvedValue(new Map(page(0, 10).map((id) => [id, inSeason(10)])));

    const saved = await backfillSeason(CFG, () => {}, NOW);

    expect(saved).toBe(141); // 140 new Solo/Duo + 1 Flex
    expect(getMatchMock).toHaveBeenCalledTimes(141 + 1); // + the first last-year game that stops the queue
    expect(seasonIdsMock).toHaveBeenCalledWith(CFG, "me", 100, 420, 100);
    expect(seasonIdsMock).toHaveBeenCalledWith(CFG, "me", 100, 700, 0);
    expect(saveMatchMock).not.toHaveBeenCalledWith(expect.objectContaining({ gameEndTimestampMs: lastYear }));
  });

  it("a stored game from before the season also stops the queue (no extra listing)", async () => {
    seasonIdsMock.mockImplementation(async (...a: unknown[]) => ((a[3] as number) === 420 ? page(0, 100) : []));
    storedMatchEndsMock.mockResolvedValue(new Map([["EUW1_0", lastYear]]));
    expect(await backfillSeason(CFG, () => {}, NOW)).toBe(0);
    expect(getMatchMock).not.toHaveBeenCalled();
    expect(seasonIdsMock).toHaveBeenCalledTimes(3); // one page per queue
  });

  it("a game that fails to download is skipped, the rest still saved", async () => {
    seasonIdsMock.mockImplementation(async (...a: unknown[]) => ((a[3] as number) === 420 ? ["EUW1_1", "EUW1_2"] : []));
    getMatchMock.mockRejectedValueOnce(new Error("500")).mockResolvedValueOnce(game("EUW1_2", inSeason(5)));
    const progress: SyncProgress[] = [];
    expect(await backfillSeason(CFG, (p) => progress.push(p), NOW)).toBe(1);
    expect(progress[progress.length - 1]).toMatchObject({ messageKey: "sync.season", messageParams: { done: 1 } });
  });
});
