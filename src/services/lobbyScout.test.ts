import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { scoutPlayer, scoutTeam } from "./lobbyScout";

describe("scoutPlayer", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      value: {},
      writable: true,
      configurable: true,
    });
  });

  it("returns null when LCU lookup throws (client closed)", async () => {
    mockInvoke.mockRejectedValue(new Error("LCU down"));
    expect(await scoutPlayer(0, 266, 12345)).toBeNull();
  });

  it("returns a populated player with rank when LCU answers", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "lcu_summoner_by_id") {
        return {
          summonerId: 12345,
          gameName: "Faker",
          summonerLevel: 800,
          puuid: "abc",
        };
      }
      if (cmd === "lcu_get_json") {
        return {
          queueMap: {
            RANKED_SOLO_5x5: {
              tier: "CHALLENGER",
              division: "I",
              leaguePoints: 1234,
              wins: 80,
              losses: 60,
            },
          },
        };
      }
      return null;
    });
    const p = await scoutPlayer(0, 64, 12345);
    expect(p).not.toBeNull();
    expect(p?.summonerName).toBe("Faker");
    expect(p?.level).toBe(800);
    expect(p?.soloRank).toBe("CHALLENGER I");
    expect(p?.soloLp).toBe(1234);
    expect(p?.soloGames).toBe(140);
    expect(p?.soloWinRate).toBeCloseTo(80 / 140, 3);
  });

  it("leaves soloRank null for UNRANKED entries (start-of-season state)", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "lcu_summoner_by_id") {
        return { summonerId: 1, gameName: "New", summonerLevel: 30, puuid: "x" };
      }
      if (cmd === "lcu_get_json") {
        return {
          queueMap: {
            RANKED_SOLO_5x5: { tier: "UNRANKED", division: "", leaguePoints: 0, wins: 0, losses: 0 },
          },
        };
      }
      return null;
    });
    const p = await scoutPlayer(0, 1, 1);
    expect(p?.soloRank).toBeNull();
  });

  it("survives ranked endpoint failure (404) and still returns profile", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "lcu_summoner_by_id") {
        return { summonerId: 9, gameName: "Foo", summonerLevel: 50, puuid: "p" };
      }
      throw new Error("ranked 404");
    });
    const p = await scoutPlayer(0, 1, 9);
    expect(p?.summonerName).toBe("Foo");
    expect(p?.soloRank).toBeNull();
  });
});

describe("scoutTeam", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      value: {},
      writable: true,
      configurable: true,
    });
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "lcu_summoner_by_id") {
        return { summonerId: 1, gameName: "X", summonerLevel: 30, puuid: "p" };
      }
      return null;
    });
  });

  it("skips entries without a real summonerId (bots / hidden enemies)", async () => {
    const out = await scoutTeam([
      { cellId: 0, championId: 1, summonerId: 0 },
      { cellId: 1, championId: 2, summonerId: undefined },
      { cellId: 2, championId: 3, summonerId: 99 },
    ]);
    expect(out).toHaveLength(1);
  });

  it("runs lookups in parallel (single batch via Promise.all)", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    mockInvoke.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return { summonerId: 1, gameName: "X", summonerLevel: 30, puuid: "p" };
    });
    await scoutTeam([
      { cellId: 0, championId: 1, summonerId: 1 },
      { cellId: 1, championId: 2, summonerId: 2 },
      { cellId: 2, championId: 3, summonerId: 3 },
    ]);
    // At least 2 lookups inflight at the same time -> parallel.
    expect(maxInFlight).toBeGreaterThan(1);
  });
});
