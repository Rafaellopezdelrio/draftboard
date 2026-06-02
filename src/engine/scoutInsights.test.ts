import { describe, it, expect } from "vitest";
import { rankValue, assessThreat, summarizeEnemies } from "./scoutInsights";
import type { ScoutResult } from "../services/enemyScout";

function sr(over: Partial<ScoutResult>): ScoutResult {
  return {
    puuid: "p",
    summonerLevel: 150,
    rank: "GOLD II",
    lp: 50,
    recentWins: 5,
    recentLosses: 5,
    hotStreak: false,
    coldStreak: false,
    topChampionIds: [],
    topMasteries: [],
    mainChampionId: null,
    mostPlayedRecent: null,
    pickedChampionMastery: null,
    ...over,
  };
}

describe("rankValue", () => {
  it("maps tier+division+lp to a comparable ladder number", () => {
    expect(rankValue("GOLD II", 50)).toBeCloseTo(14.5);
    expect(rankValue("IRON IV", 0)).toBe(0);
    expect(rankValue("DIAMOND II", 0)).toBe(26);
    expect(rankValue("CHALLENGER", 500)).toBeCloseTo(41);
  });
  it("returns null for unranked/unparseable", () => {
    expect(rankValue(null)).toBeNull();
    expect(rankValue("UNRANKED")).toBeNull();
  });
});

describe("assessThreat", () => {
  it("flags a high-mastery one-trick on their pick as danger", () => {
    const t = assessThreat({
      scout: sr({
        recentWins: 7,
        recentLosses: 3,
        mainChampionId: 1,
        pickedChampionMastery: { championId: 1, level: 7, points: 350_000 },
      }),
      pickedChampionId: 1,
      championName: "Yasuo",
    });
    expect(t.level).toBe("danger");
    expect(t.tags).toEqual(expect.arrayContaining(["main", "one-trick"]));
    expect(t.note).toMatch(/OTP de Yasuo/);
  });

  it("detects a likely smurf from low level + strong rank/WR", () => {
    const t = assessThreat({
      scout: sr({ summonerLevel: 25, rank: "DIAMOND II", recentWins: 8, recentLosses: 1 }),
    });
    expect(t.tags).toContain("smurf?");
    expect(t.note).toMatch(/smurf/i);
  });

  it("marks an off-pool pick (locked outside their mastery)", () => {
    const t = assessThreat({
      scout: sr({ topMasteries: [{ championId: 1, level: 7, points: 100_000 }] }),
      pickedChampionId: 99,
    });
    expect(t.tags).toContain("fuera de pool");
    expect(t.note).toMatch(/pool/);
  });

  it("reads a cold streak / poor form as low threat", () => {
    const t = assessThreat({
      scout: sr({ coldStreak: true, recentWins: 2, recentLosses: 8 }),
    });
    expect(t.level).toBe("weak");
    expect(t.note).toMatch(/forma/);
  });

  it("returns a neutral verdict for an average opponent", () => {
    const t = assessThreat({ scout: sr({}) });
    expect(t.level).toBe("neutral");
    expect(t.note).toMatch(/estándar/);
  });
});

describe("summarizeEnemies", () => {
  it("counts danger + elevated as threats", () => {
    const s = summarizeEnemies([
      { level: "danger", score: 0.8, tags: [], note: "" },
      { level: "elevated", score: 0.6, tags: [], note: "" },
      { level: "neutral", score: 0.5, tags: [], note: "" },
    ]);
    expect(s.dangerCount).toBe(2);
    expect(s.text).toMatch(/2 amenazas/);
  });
  it("says no threats when none qualify", () => {
    expect(summarizeEnemies([{ level: "neutral", score: 0.5, tags: [], note: "" }]).text).toMatch(
      /Sin amenazas/
    );
  });
});
