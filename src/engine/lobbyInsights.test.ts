import { describe, it, expect } from "vitest";
import { readLobby, dodgeHint, isSmurf, type LobbyRead } from "./lobbyInsights";
import type { ScoutedPlayer } from "../services/lobbyScout";
import { rankValue } from "./scoutInsights";

function rankAvg(ps: ScoutedPlayer[]): number | null {
  const v = ps.map((p) => rankValue(p.soloRank, p.soloLp)).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function read(over: Partial<LobbyRead>): LobbyRead {
  return {
    carry: null,
    liability: null,
    topThreat: null,
    balance: { delta: 0, textKey: "" },
    ...over,
  };
}

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
    expect(r.carry?.reasonKey).toBe("lobby.carryReason");
  });

  it("flags a ranked ally with very few games as a liability", () => {
    const my = [
      sp({ summonerName: "Good", soloRank: "PLATINUM I", soloWinRate: 0.58, soloGames: 40 }),
      sp({ summonerName: "New", soloRank: "SILVER II", soloGames: 3 }),
    ];
    const r = readLobby(my, []);
    expect(r.liability?.name).toBe("New");
    expect(r.liability?.reasonKey).toBe("lobby.liabilityFewGames");
    expect(r.liability?.reasonParams).toEqual({ stat: "SILVER II, 50% · 3g" });
  });

  // An unranked ally (season start / normals player) has 0 solo games: that
  // is no evidence of autofill, and must not hide a real low-WR ally.
  it("never names an unranked ally as the liability", () => {
    const my = [
      sp({ summonerName: "Good", soloRank: "GOLD I", soloGames: 40 }),
      sp({ summonerName: "Vet", soloRank: null, soloGames: 0, soloWinRate: 0, level: 400 }),
    ];
    expect(readLobby(my, []).liability).toBeNull();

    const withTilted = [
      ...my,
      sp({ summonerName: "Tilted", soloRank: "GOLD II", soloGames: 60, soloWinRate: 0.4 }),
    ];
    const r = readLobby(withTilted, []);
    expect(r.liability?.name).toBe("Tilted");
    expect(r.liability?.reasonKey).toBe("lobby.liabilityForm");
  });

  // Ranked solo/duo anonymizes allies: the only scouted ally is often me.
  it("never names the local player as carry or liability, but keeps them in the balance", () => {
    const me = sp({ cellId: 2, summonerName: "Me", soloRank: "PLATINUM II", soloGames: 80, soloWinRate: 0.54 });
    const duo = sp({ cellId: 3, summonerName: "Duo", soloRank: "SILVER II", soloGames: 5 });
    const their = [sp({ soloRank: "GOLD II" }), sp({ soloRank: "GOLD II" })];
    const r = readLobby([me, duo], their, 2);
    expect(r.carry).toBeNull();
    // Only one other ally: no one-player comparison for a liability.
    expect(r.liability).toBeNull();
    // Me (PLAT II) still counts: avg with duo vs GOLD II avg.
    expect(r.balance).not.toBeNull();
    expect(r.balance!.delta).toBeCloseTo(
      (rankAvg([me, duo]) ?? 0) - (rankAvg(their) ?? 0)
    );

    const weakMe = sp({ cellId: 2, summonerName: "Me", soloRank: "SILVER IV", soloGames: 4 });
    const r2 = readLobby(
      [weakMe, sp({ cellId: 3, soloRank: "GOLD II" }), sp({ cellId: 4, soloRank: "GOLD III" })],
      [],
      2
    );
    expect(r2.liability).toBeNull();
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
    expect(r.balance!.textKey).toBe("lobby.balanceAhead");
  });

  it("returns no carry when nobody stands out", () => {
    const my = [
      sp({ summonerName: "A", soloRank: "GOLD II", soloWinRate: 0.5, soloGames: 50 }),
      sp({ summonerName: "B", soloRank: "GOLD III", soloWinRate: 0.5, soloGames: 50 }),
    ];
    expect(readLobby(my, []).carry).toBeNull();
  });
});

describe("dodgeHint", () => {
  it("fires when heavily outranked (~3 tiers)", () => {
    const d = dodgeHint(read({ balance: { delta: -12, textKey: "" } }));
    expect(d?.severity).toBe("warn");
    expect(d?.tiers).toBe(3);
  });

  it("fires when outranked plus a liability ally", () => {
    const d = dodgeHint(
      read({
        balance: { delta: -8, textKey: "" },
        liability: { name: "X", reasonKey: "" },
      })
    );
    expect(d).not.toBeNull();
    expect(d?.hasLiability).toBe(true);
  });

  it("stays quiet when only mildly outranked with no extra signal", () => {
    expect(dodgeHint(read({ balance: { delta: -8, textKey: "" } }))).toBeNull();
  });

  it("stays quiet on an even lobby", () => {
    expect(dodgeHint(read({ balance: { delta: 0, textKey: "" } }))).toBeNull();
  });

  it("stays quiet without balance data", () => {
    expect(dodgeHint(read({ balance: null }))).toBeNull();
  });
});

describe("isSmurf", () => {
  it("flags a low-level ranked account with a small sample", () => {
    expect(isSmurf(sp({ level: 45, soloGames: 20 }))).toBe(true);
  });

  it("flags a low-level ranked account with a strong win rate (even at volume)", () => {
    expect(isSmurf(sp({ level: 45, soloGames: 200, soloWinRate: 0.62 }))).toBe(true);
  });

  it("does NOT flag a low-level account grinding at an average win rate", () => {
    expect(isSmurf(sp({ level: 45, soloGames: 200, soloWinRate: 0.5 }))).toBe(false);
  });

  it("does NOT flag a high-level account", () => {
    expect(isSmurf(sp({ level: 120, soloGames: 20 }))).toBe(false);
  });

  it("does NOT flag an unranked low-level account", () => {
    expect(isSmurf(sp({ level: 45, soloRank: null, soloGames: 20 }))).toBe(false);
  });

  it("does NOT flag a fresh IRON IV placement account", () => {
    expect(isSmurf(sp({ level: 45, soloRank: "IRON IV", soloGames: 20 }))).toBe(false);
  });

  it("does NOT flag a real new player with a losing record", () => {
    expect(
      isSmurf(sp({ level: 45, soloRank: "BRONZE III", soloGames: 25, soloWinRate: 0.36 }))
    ).toBe(false);
  });

  it("does NOT flag a player we failed to load", () => {
    expect(isSmurf(sp({ level: 45, soloGames: 20, loaded: false }))).toBe(false);
  });
});
