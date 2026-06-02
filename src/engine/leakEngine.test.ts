import { describe, it, expect } from "vitest";
import { analyzeLeaks, summarizeLeakForAi } from "./leakEngine";
import type { MatchRow } from "../services/matchRepo";

function m(over: Partial<MatchRow>): MatchRow {
  return {
    matchId: Math.random().toString(36).slice(2),
    championId: 1,
    win: false,
    kills: 5,
    deaths: 5,
    assists: 5,
    cs: 120,
    durationSec: 1800,
    gameEndTimestampMs: Date.now(),
    queueId: 420,
    position: "MIDDLE",
    opponentChampionId: 0,
    ...over,
  };
}

const winsLowDeaths = [1, 2, 3, 2, 2].map((d) => m({ deaths: d, win: true }));
const lossesHighDeaths = [7, 8, 9, 8, 8].map((d) => m({ deaths: d, win: false }));

describe("analyzeLeaks", () => {
  it("returns null below the minimum sample size", () => {
    expect(analyzeLeaks(Array(7).fill(0).map(() => m({})))).toBeNull();
  });

  it("returns null when one side has too few games", () => {
    const arr = [
      ...Array(6).fill(0).map(() => m({ win: true })),
      ...Array(2).fill(0).map(() => m({ win: false })),
    ];
    expect(analyzeLeaks(arr)).toBeNull();
  });

  it("ranks the death gap as the #1 leak when losses die far more", () => {
    const r = analyzeLeaks([...winsLowDeaths, ...lossesHighDeaths]);
    expect(r).not.toBeNull();
    expect(r!.topLeak.key).toBe("deaths");
    expect(r!.topLeak.severity).toBe("bad");
    expect(r!.topLeak.lossAvg).toBeGreaterThan(r!.topLeak.winAvg);
    expect(r!.macro).toBe(false);
    expect(r!.wins).toBe(5);
    expect(r!.losses).toBe(5);
  });

  it("flags a macro problem when no metric separates wins from losses", () => {
    const wins = [3, 7, 3, 7, 5].map((d) => m({ deaths: d, win: true }));
    const losses = [3, 7, 4, 7, 5].map((d) => m({ deaths: d, win: false }));
    const r = analyzeLeaks([...wins, ...losses]);
    expect(r).not.toBeNull();
    expect(r!.macro).toBe(true);
    expect(r!.topLeak.effect).toBeLessThan(0.3);
    expect(r!.headline).toContain("macro");
  });

  it("excludes a metric where losses are not actually worse", () => {
    // identical CS + kp across both sides -> those never rank as leaks
    const r = analyzeLeaks([...winsLowDeaths, ...lossesHighDeaths]);
    const keys = r!.leaks.map((l) => l.key);
    expect(keys).not.toContain("cspm");
    expect(keys).not.toContain("kp");
  });

  it("skips vision/gold when the rows carry no such data (pre-010 matches)", () => {
    const r = analyzeLeaks([...winsLowDeaths, ...lossesHighDeaths]);
    const keys = r!.leaks.map((l) => l.key);
    expect(keys).not.toContain("vision");
    expect(keys).not.toContain("gold");
  });

  it("ranks a vision deficit as the #1 leak once vision data exists", () => {
    const wins = [35, 40, 45, 40, 40].map((v) => m({ visionScore: v, win: true }));
    const losses = [12, 15, 18, 15, 15].map((v) => m({ visionScore: v, win: false }));
    const r = analyzeLeaks([...wins, ...losses]);
    expect(r!.topLeak.key).toBe("vision");
    expect(r!.topLeak.lossAvg).toBeLessThan(r!.topLeak.winAvg);
  });
});

describe("summarizeLeakForAi", () => {
  it("produces a prompt-ready block with sample size and a verdict", () => {
    const r = analyzeLeaks([...winsLowDeaths, ...lossesHighDeaths])!;
    const s = summarizeLeakForAi(r);
    expect(s).toContain("Muertes");
    expect(s).toContain("Leak principal");
    expect(s).toMatch(/5W/);
    expect(s).toMatch(/5/);
  });
});
