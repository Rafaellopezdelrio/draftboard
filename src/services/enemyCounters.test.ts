import { describe, it, expect, vi, beforeEach } from "vitest";

// Keep ddIdToOpggKey real (buildSlugToKey needs it), mock only the network fn.
vi.mock("./opggMatchups", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, fetchOpggMatchups: vi.fn() };
});

import { fetchOpggMatchups, type OpggMatchup } from "./opggMatchups";
import { fetchEnemyCounters } from "./enemyCounters";
import type { Champion, ChampionDb, Role } from "../types/champion";

const mockFetch = vi.mocked(fetchOpggMatchups);

function champ(key: string, id: string): Champion {
  return {
    id,
    key,
    name: id,
    title: "",
    iconUrl: "",
    splashUrl: "",
    tags: [],
    roles: [] as Role[],
    archetypes: [],
  };
}

const db = {
  patch: "16.10",
  champions: {
    "238": champ("238", "Zed"),
    "61": champ("61", "Orianna"),
    "157": champ("157", "Yasuo"),
  },
  counters: [],
  meta: [],
  fetchedAt: Date.now(),
} as unknown as ChampionDb;

const mu = (championKey: string, winRate: number, play = 1000): OpggMatchup => ({
  play,
  win: Math.round((play * winRate) / 100),
  winRate,
  championKey,
  championName: championKey,
});

describe("fetchEnemyCounters — invert op.gg matchups into candidate-vs-enemy", () => {
  beforeEach(() => mockFetch.mockReset());

  it("inverts the enemy's win rate and maps slugs to db keys", async () => {
    // Enemy = Zed (238). op.gg gives ZED's WR vs each opponent.
    mockFetch.mockResolvedValue([
      mu("orianna", 45), // Zed wins 45% vs Orianna → Orianna vs Zed = 55%
      mu("yasuo", 55), // Zed wins 55% vs Yasuo → Yasuo vs Zed = 45%
      mu("zed", 50), // self — must be skipped
    ]);

    const out = await fetchEnemyCounters(db, ["238"], "MIDDLE");

    const ori = out.find((e) => e.championKey === "61");
    const yas = out.find((e) => e.championKey === "157");
    expect(ori).toMatchObject({ vsChampionKey: "238", role: "MIDDLE" });
    expect(ori?.winRate).toBeCloseTo(0.55, 5);
    expect(yas?.winRate).toBeCloseTo(0.45, 5);
    // self-matchup (candidate === enemy) excluded
    expect(out.some((e) => e.championKey === "238")).toBe(false);
  });

  it("returns [] for no enemies without fetching", async () => {
    const out = await fetchEnemyCounters(db, [], "MIDDLE");
    expect(out).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches one list per enemy (≤5 requests, not one per candidate)", async () => {
    mockFetch.mockResolvedValue([mu("orianna", 50)]);
    await fetchEnemyCounters(db, ["238", "157"], "MIDDLE");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
