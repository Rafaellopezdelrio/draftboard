import { describe, it, expect, vi, beforeEach } from "vitest";

const getSummonerById = vi.fn();
const getTopMasteries = vi.fn();
const loadSettings = vi.fn();

vi.mock("../services/lcuService", () => ({
  getSummonerById: (...a: unknown[]) => getSummonerById(...a),
}));
vi.mock("../services/riotApi", () => ({
  getTopMasteries: (...a: unknown[]) => getTopMasteries(...a),
}));
vi.mock("../services/settingsRepo", () => ({
  loadSettings: (...a: unknown[]) => loadSettings(...a),
}));

import { getEnemyMains, __resetEnemyMainsCache } from "./useEnemyMains";

beforeEach(() => {
  __resetEnemyMainsCache();
  getSummonerById.mockReset();
  getTopMasteries.mockReset();
  loadSettings.mockReset();
  loadSettings.mockResolvedValue({ apiKey: "k", puuid: "me" });
  getSummonerById.mockResolvedValue({ puuid: "p1", gameName: "Foe" });
  getTopMasteries.mockResolvedValue([
    { championId: 1, championPoints: 200_000, championLevel: 7 },
  ]);
});

describe("getEnemyMains — caching + in-flight dedup", () => {
  it("collapses two concurrent callers onto a single fetch", async () => {
    const [a, b] = await Promise.all([
      getEnemyMains("10,20", [10, 20]),
      getEnemyMains("10,20", [10, 20]),
    ]);
    expect(a).toEqual(b);
    // 2 enemies, fetched once (deduped across both callers) = 2 lookups, not 4.
    expect(getSummonerById).toHaveBeenCalledTimes(2);
  });

  it("serves a cached result without re-fetching", async () => {
    await getEnemyMains("10", [10]);
    getSummonerById.mockClear();
    await getEnemyMains("10", [10]);
    expect(getSummonerById).not.toHaveBeenCalled();
  });

  it("returns [] when there is no Riot API key", async () => {
    loadSettings.mockResolvedValue({ apiKey: "", puuid: "me" });
    expect(await getEnemyMains("99", [99])).toEqual([]);
  });
});
