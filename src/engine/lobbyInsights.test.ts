import { describe, it, expect } from "vitest";
import { readLobby } from "./lobbyInsights";
import type { ScoutedPlayer } from "../services/lobbyScout";

let nextId = 1;
function sp(over: Partial<ScoutedPlayer>): ScoutedPlayer {
  return {
    cellId: 0,
    championId: 1,
    summonerId: nextId++,
    summonerName: "P",
    level: 100,
    soloRank: "GOLD II",
    soloLp: 50,
    soloWinRate: 0.5,
    soloGames: 50,
    loaded: true,
    ...over,
  };
}

describe("readLobby", () => {
  it("names a standout ally as the carry / win condition", () => {
    const my = [
      sp({ summonerName: "Carry", soloRank: "DIAMOND I", soloWinRate: 0.62, soloGames: 60 }),
      sp({ summonerName: "Mid", soloRank: "GOLD II", soloGames: 30 }),
      sp({ summonerName: "Sup", soloRank: "GOLD IV", soloGames: 30 }),
    ];
    const r = readLobby(my, []);
    expect(r.carry?.name).toBe("Carry");
    expect(r.carry?.reason).toMatch(/win condition/);
  });

  it("flags a tiny-sample / autofill ally as a liability", () => {
    const my = [
      sp({ summonerName: "Good", soloRank: "PLATINUM I", soloWinRate: 0.58, soloGames: 40 }),
      sp({ summonerName: "New", soloRank: null, soloGames: 3 }),
    ];
    const r = readLobby(my, []);
    expect(r.liability?.name).toBe("New");
    expect(r.liability?.reason).toMatch(/autofill/);
  });

  it("surfaces the strongest enemy as the top threat", () => {
    const their = [
      sp({ summonerName: "Smurf", soloRank: "DIAMOND II", soloWinRate: 0.7, soloGames: 30 }),
      sp({ summonerName: "Filler", soloRank: "SILVER III", soloGames: 30 }),
    ];
    const r = readLobby([], their);
    expect(r.topThreat?.name).toBe("Smurf");
  });

  it("reads rank balance between the teams", () => {
    const my = [sp({ soloRank: "DIAMOND II", soloLp: 0 }), sp({ soloRank: "DIAMOND IV", soloLp: 0 })];
    const their = [sp({ soloRank: "SILVER II" }), sp({ soloRank: "SILVER IV" })];
    const r = readLobby(my, their);
    expect(r.balance!.delta).toBeGreaterThan(0);
    expect(r.balance!.text).toMatch(/Outrankeas/);
  });

  it("returns no carry when nobody stands out", () => {
    const my = [
      sp({ summonerName: "A", soloRank: "GOLD II", soloWinRate: 0.5, soloGames: 50 }),
      sp({ summonerName: "B", soloRank: "GOLD III", soloWinRate: 0.5, soloGames: 50 }),
    ];
    expect(readLobby(my, []).carry).toBeNull();
  });
});
