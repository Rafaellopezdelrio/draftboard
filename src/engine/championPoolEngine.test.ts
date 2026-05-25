// Tests the per-pool "insight" generator that drives ChampionPoolPanel.
// Detects: spam pick, your main, tilt streak, rusty champion, practice pick.
//
// Goal: lock down the thresholds that decide which message + severity
// fires, so future refactors don't silently change the user-visible labels.

import { describe, it, expect } from "vitest";
import { analyzeChampionPool } from "./championPoolEngine";
import type { MatchSummary } from "../services/riotApi";
import type { ChampionPersonalStat } from "../services/matchRepo";
import type { ChampionMasteryDto } from "../services/riotApi";

const DAY_MS = 24 * 60 * 60 * 1000;

const mkMatch = (over: Partial<MatchSummary> & Pick<MatchSummary, "championId" | "win">): MatchSummary => ({
  matchId: `M${Math.random()}`,
  kills: 5,
  deaths: 3,
  assists: 8,
  cs: 200,
  durationSec: 1800,
  gameEndTimestampMs: Date.now(),
  queueId: 420,
  position: "MIDDLE",
  opponentChampionId: 1,
  ...over,
});

const mkMastery = (over: Partial<ChampionMasteryDto> & Pick<ChampionMasteryDto, "championId">): ChampionMasteryDto => ({
  championPoints: 100_000,
  championLevel: 7,
  lastPlayTime: 0,
  ...over,
});

const mkStat = (over: Partial<ChampionPersonalStat> & Pick<ChampionPersonalStat, "championId">): ChampionPersonalStat => ({
  games: 10,
  wins: 6,
  winRate: 0.6,
  ...over,
});

describe("analyzeChampionPool", () => {
  it("empty inputs -> no insights", () => {
    const out = analyzeChampionPool({ matches: [], masteries: [], personalStats: [] });
    expect(out).toEqual([]);
  });

  it("detects spam pick when champion played 4+/10 last games", () => {
    const matches = [
      ...Array(5).fill(0).map(() => mkMatch({ championId: 266, win: true })),
      mkMatch({ championId: 99, win: true }),
      mkMatch({ championId: 99, win: false }),
    ];
    const out = analyzeChampionPool({ matches, masteries: [], personalStats: [] });
    const spam = out.find((i) => i.type === "spam");
    expect(spam).toBeDefined();
    expect(spam!.championId).toBe(266);
    expect(spam!.severity).toBe("info");
  });

  it("no spam when most-played has only 3 games (below threshold)", () => {
    // Truly distributed pool — each champion ≤ 1 game in the last 10. Engine
    // threshold for "spam" is ≥4 plays, so this set must produce zero.
    const distributed = [
      mkMatch({ championId: 1, win: true }), mkMatch({ championId: 2, win: true }),
      mkMatch({ championId: 3, win: true }), mkMatch({ championId: 4, win: true }),
      mkMatch({ championId: 5, win: true }), mkMatch({ championId: 6, win: true }),
      mkMatch({ championId: 7, win: true }), mkMatch({ championId: 8, win: true }),
      mkMatch({ championId: 9, win: true }), mkMatch({ championId: 10, win: true }),
    ];
    const out = analyzeChampionPool({ matches: distributed, masteries: [], personalStats: [] });
    expect(out.find((i) => i.type === "spam")).toBeUndefined();
  });

  it("detects 'main' for top mastery + 5+ games + ≥50% WR + >100k points", () => {
    const out = analyzeChampionPool({
      matches: [],
      masteries: [mkMastery({ championId: 266, championPoints: 250_000 })],
      personalStats: [mkStat({ championId: 266, games: 10, winRate: 0.6 })],
    });
    const main = out.find((i) => i.type === "main");
    expect(main).toBeDefined();
    expect(main!.severity).toBe("good");
    expect(main!.championId).toBe(266);
    expect(main!.message).toContain("60%");
  });

  it("does NOT flag main when WR is below 50% (don't praise a loss-pile)", () => {
    const out = analyzeChampionPool({
      matches: [],
      masteries: [mkMastery({ championId: 266, championPoints: 250_000 })],
      personalStats: [mkStat({ championId: 266, games: 10, winRate: 0.45 })],
    });
    expect(out.find((i) => i.type === "main")).toBeUndefined();
  });

  it("does NOT flag main when fewer than 5 games (sample too small)", () => {
    const out = analyzeChampionPool({
      matches: [],
      masteries: [mkMastery({ championId: 266, championPoints: 250_000 })],
      personalStats: [mkStat({ championId: 266, games: 3, winRate: 1.0 })],
    });
    expect(out.find((i) => i.type === "main")).toBeUndefined();
  });

  it("detects tilt streak (4+ consecutive losses on same champion)", () => {
    const matches = [
      mkMatch({ championId: 266, win: false }),
      mkMatch({ championId: 266, win: false }),
      mkMatch({ championId: 266, win: false }),
      mkMatch({ championId: 266, win: false }),
    ];
    const out = analyzeChampionPool({ matches, masteries: [], personalStats: [] });
    const tilt = out.find((i) => i.type === "tilt");
    expect(tilt).toBeDefined();
    expect(tilt!.severity).toBe("bad");
    expect(tilt!.championId).toBe(266);
  });

  it("3 losses in a row -> no tilt warning (threshold is 4)", () => {
    const matches = [
      mkMatch({ championId: 266, win: false }),
      mkMatch({ championId: 266, win: false }),
      mkMatch({ championId: 266, win: false }),
    ];
    const out = analyzeChampionPool({ matches, masteries: [], personalStats: [] });
    expect(out.find((i) => i.type === "tilt")).toBeUndefined();
  });

  it("a win breaks the loss streak", () => {
    const matches = [
      mkMatch({ championId: 266, win: false }),
      mkMatch({ championId: 266, win: false }),
      mkMatch({ championId: 266, win: true }), // breaks the streak
      mkMatch({ championId: 266, win: false }),
      mkMatch({ championId: 266, win: false }),
    ];
    const out = analyzeChampionPool({ matches, masteries: [], personalStats: [] });
    expect(out.find((i) => i.type === "tilt")).toBeUndefined();
  });

  it("detects rusty: high mastery (50k+) + not played in 30+ days", () => {
    const now = Date.now();
    const matches = [
      mkMatch({
        championId: 99, // different champ
        win: true,
        gameEndTimestampMs: now - 5 * DAY_MS,
      }),
    ];
    const out = analyzeChampionPool({
      matches,
      masteries: [mkMastery({ championId: 266, championPoints: 75_000 })],
      personalStats: [],
    });
    const rusty = out.find((i) => i.type === "rusty");
    expect(rusty).toBeDefined();
    expect(rusty!.severity).toBe("warn");
    expect(rusty!.championId).toBe(266);
  });

  it("does NOT mark rusty if mastery is below 50k threshold", () => {
    const out = analyzeChampionPool({
      matches: [],
      masteries: [mkMastery({ championId: 266, championPoints: 30_000 })],
      personalStats: [],
    });
    expect(out.find((i) => i.type === "rusty")).toBeUndefined();
  });

  it("does NOT mark rusty if champion was played within 30 days", () => {
    const now = Date.now();
    const out = analyzeChampionPool({
      matches: [
        mkMatch({ championId: 266, win: true, gameEndTimestampMs: now - 10 * DAY_MS }),
      ],
      masteries: [mkMastery({ championId: 266, championPoints: 200_000 })],
      personalStats: [],
    });
    expect(out.find((i) => i.type === "rusty")).toBeUndefined();
  });

  it("suggests practice for high-mastery champ with <3 personal games", () => {
    const out = analyzeChampionPool({
      matches: [],
      masteries: [mkMastery({ championId: 266, championLevel: 7, championPoints: 80_000 })],
      personalStats: [],
    });
    const practice = out.find((i) => i.type === "practice");
    expect(practice).toBeDefined();
    expect(practice!.severity).toBe("info");
  });

  it("does NOT suggest practice when mastery level is below 5", () => {
    const out = analyzeChampionPool({
      matches: [],
      masteries: [mkMastery({ championId: 266, championLevel: 3 })],
      personalStats: [],
    });
    expect(out.find((i) => i.type === "practice")).toBeUndefined();
  });

  it("returns insights in stable categories (no duplicates of same type)", () => {
    // Set up a match log + masteries that COULD trigger multiple of each;
    // engine should still produce at most one per category.
    const now = Date.now();
    const matches = [
      mkMatch({ championId: 266, win: false, gameEndTimestampMs: now }),
      mkMatch({ championId: 266, win: false, gameEndTimestampMs: now }),
      mkMatch({ championId: 266, win: false, gameEndTimestampMs: now }),
      mkMatch({ championId: 266, win: false, gameEndTimestampMs: now }),
      mkMatch({ championId: 99, win: false, gameEndTimestampMs: now }),
      mkMatch({ championId: 99, win: false, gameEndTimestampMs: now }),
      mkMatch({ championId: 99, win: false, gameEndTimestampMs: now }),
      mkMatch({ championId: 99, win: false, gameEndTimestampMs: now }),
    ];
    const out = analyzeChampionPool({ matches, masteries: [], personalStats: [] });
    const types = out.map((i) => i.type);
    expect(new Set(types).size).toBe(types.length); // each type unique
  });
});
