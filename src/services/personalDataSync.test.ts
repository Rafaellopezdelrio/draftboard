import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MatchSummary } from "./riotApi";
import type { LcuRankInfo } from "./lcuPersonalData";

const loadSettingsMock = vi.fn();
vi.mock("./settingsRepo", () => ({
  loadSettings: () => loadSettingsMock(),
}));

const getRiotProxyUrlMock = vi.fn();
const getRecentMatchIdsMock = vi.fn();
const getMatchMock = vi.fn();
const getTopMasteriesMock = vi.fn();
vi.mock("./riotApi", () => ({
  getRiotProxyUrl: () => getRiotProxyUrlMock(),
  getRecentMatchIds: (...a: unknown[]) => getRecentMatchIdsMock(...a),
  getMatch: (...a: unknown[]) => getMatchMock(...a),
  getTopMasteries: (...a: unknown[]) => getTopMasteriesMock(...a),
}));

const existingMatchIdsMock = vi.fn();
const saveMatchMock = vi.fn();
vi.mock("./matchRepo", () => ({
  existingMatchIds: () => existingMatchIdsMock(),
  saveMatch: (...a: unknown[]) => saveMatchMock(...a),
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

import { syncPersonalData, type SyncProgress } from "./personalDataSync";

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
    linkDraftToMatchMock,
    lcuRecentMatchesMock,
    lcuMasteriesMock,
    lcuRankMock,
  ]) {
    m.mockReset();
  }
  getRiotProxyUrlMock.mockReturnValue(null);
  existingMatchIdsMock.mockResolvedValue(new Set<string>());
  saveMatchMock.mockResolvedValue(undefined);
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
      message: "Riot API falló (Error: 403 Forbidden), probando LCU...",
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
      { source: "LCU", done: 0, total: 1, message: "Conectando al cliente..." },
      { source: "LCU", done: 2, total: 3, message: "Guardando 2/3" },
      { source: "LCU", done: 3, total: 3, message: "Guardando 3/3" },
    ]);
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
