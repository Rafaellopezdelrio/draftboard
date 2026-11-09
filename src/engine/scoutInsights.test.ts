import { describe, it, expect } from "vitest";
import { rankValue, assessThreat, scoutViewpoint, summarizeEnemies } from "./scoutInsights";
import type { ScoutResult } from "../services/enemyScout";
import es from "../i18n/locales/es.json";
import en from "../i18n/locales/en.json";

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
    expect(t.noteKey).toBe("scout.note.oneTrick");
    expect(t.noteParams).toMatchObject({ champ: "Yasuo" });
  });

  it("detects a likely smurf from low level + strong rank/WR", () => {
    const t = assessThreat({
      scout: sr({ summonerLevel: 25, rank: "DIAMOND II", recentWins: 8, recentLosses: 1 }),
    });
    expect(t.tags).toContain("smurf?");
    expect(t.noteKey).toMatch(/^scout\.note\.smurf/);
  });

  it("marks an off-pool pick (locked outside their mastery)", () => {
    const t = assessThreat({
      scout: sr({ topMasteries: [{ championId: 1, level: 7, points: 100_000 }] }),
      pickedChampionId: 99,
    });
    expect(t.tags).toContain("fuera de pool");
    expect(t.noteKey).toBe("scout.note.offPool");
  });

  // Only the top 7 masteries are fetched: a champion just outside a deep pool
  // is not "uncomfortable".
  it("does not call off-pool when the 7 fetched masteries are all high", () => {
    const top = Array.from({ length: 7 }, (_, i) => ({
      championId: i + 1,
      level: 7,
      points: 150_000,
    }));
    const t = assessThreat({ scout: sr({ topMasteries: top }), pickedChampionId: 99 });
    expect(t.tags).not.toContain("fuera de pool");
    expect(t.noteKey).toBe("scout.note.standard");
  });

  it("still calls off-pool when the fetched list's tail is low-mastery", () => {
    const top = Array.from({ length: 7 }, (_, i) => ({
      championId: i + 1,
      level: 5,
      points: i === 6 ? 20_000 : 150_000,
    }));
    const t = assessThreat({ scout: sr({ topMasteries: top }), pickedChampionId: 99 });
    expect(t.tags).toContain("fuera de pool");
  });

  it("does not call off-pool when they played the pick in recent games", () => {
    const t = assessThreat({
      scout: sr({
        topMasteries: [{ championId: 1, level: 7, points: 100_000 }],
        pickedChampionRecentGames: 2,
      }),
      pickedChampionId: 99,
    });
    expect(t.tags).not.toContain("fuera de pool");
  });

  it("never calls off-pool on random-pick modes (ARAM)", () => {
    const t = assessThreat({
      scout: sr({ topMasteries: [{ championId: 1, level: 7, points: 100_000 }] }),
      pickedChampionId: 99,
      randomPick: true,
    });
    expect(t.tags).not.toContain("fuera de pool");
    expect(t.noteKey).not.toMatch(/offPool$/);
  });

  it("phrases notes about the enemy jungler for a laner (laneJunglerNote)", () => {
    const scout = sr({ coldStreak: true, recentWins: 2, recentLosses: 8 });
    const t = assessThreat({ scout, viewpoint: "laner-vs-jungler" });
    expect(t.noteKey).toBe("scout.laneJunglerNote.coldStreakWr");
    expect(t.noteParams).toEqual(assessThreat({ scout }).noteParams);
  });

  it("reads a cold streak / poor form as low threat", () => {
    const t = assessThreat({
      scout: sr({ coldStreak: true, recentWins: 2, recentLosses: 8 }),
    });
    expect(t.level).toBe("weak");
    expect(t.noteKey).toMatch(/^scout\.note\.coldStreak/);
  });

  it("returns a neutral verdict for an average opponent", () => {
    const t = assessThreat({ scout: sr({}) });
    expect(t.level).toBe("neutral");
    expect(t.noteKey).toBe("scout.note.standard");
  });

  it("every emitted noteKey resolves to a real translation", () => {
    const notes = (es as { scout: { note: Record<string, string> } }).scout.note;
    const scenarios: ScoutResult[] = [
      sr({ summonerLevel: 25, rank: "DIAMOND II", recentWins: 8, recentLosses: 1 }),
      sr({ recentWins: 7, recentLosses: 1, hotStreak: true }),
      sr({ topMasteries: [{ championId: 1, level: 7, points: 100_000 }] }),
      sr({ coldStreak: true, recentWins: 2, recentLosses: 8 }),
      sr({ mainChampionId: 1, pickedChampionMastery: { championId: 1, level: 7, points: 50_000 } }),
      sr({}),
    ];
    for (const scout of scenarios) {
      const tr = assessThreat({ scout, pickedChampionId: 99, championName: "X" });
      const leaf = tr.noteKey.replace("scout.note.", "");
      expect(leaf in notes).toBe(true);
    }
  });

  // User report (01/11): as a jungler the notes said "snowball your lane" /
  // "ask for jungle" for every enemy. Jungle viewpoints phrase the same
  // signal as gank advice (laners) or invade advice (enemy jungler).
  it.each([
    ["JUNGLE", false, "jungler-vs-laner"],
    ["JUNGLE", true, "jungler-vs-jungler"],
    ["MIDDLE", true, "laner-vs-jungler"],
    ["MIDDLE", false, "laner"],
    [null, true, "laner-vs-jungler"],
    [null, false, "laner"],
  ] as const)("scoutViewpoint(%s, smite=%s) → %s", (role, smite, expected) => {
    expect(scoutViewpoint(role, smite)).toBe(expected);
  });

  it("phrases the same signal for the jungler's viewpoint", () => {
    const scout = sr({ coldStreak: true, recentWins: 2, recentLosses: 8 });
    expect(assessThreat({ scout }).noteKey).toBe("scout.note.coldStreakWr");
    expect(assessThreat({ scout, viewpoint: "jungler-vs-laner" }).noteKey).toBe(
      "scout.jungleNote.coldStreakWr"
    );
    const vsJg = assessThreat({ scout, viewpoint: "jungler-vs-jungler" });
    expect(vsJg.noteKey).toBe("scout.junglerNote.coldStreakWr");
    // Viewpoint only changes the wording, never the threat read.
    expect(vsJg.level).toBe(assessThreat({ scout }).level);
    expect(vsJg.noteParams).toEqual(assessThreat({ scout }).noteParams);
  });

  it("every jungle-viewpoint note exists in es and en, with the laner's params", () => {
    type Notes = Record<string, string>;
    const scoutEs = (es as unknown as { scout: Record<string, Notes> }).scout;
    const scoutEn = (en as unknown as { scout: Record<string, Notes> }).scout;
    const params = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();
    for (const group of ["jungleNote", "junglerNote"]) {
      for (const lang of [scoutEs, scoutEn]) {
        expect(Object.keys(lang[group]).sort()).toEqual(Object.keys(lang.note).sort());
        for (const k of Object.keys(lang.note)) {
          expect(params(lang[group][k])).toEqual(params(lang.note[k]));
          // The whole point: no "your lane" advice in jungle notes.
          expect(lang[group][k]).not.toMatch(/tu carril|pide jungla|your lane\b|ask for jungle/i);
        }
      }
    }
  });
});

describe("summarizeEnemies", () => {
  it("counts danger + elevated as threats", () => {
    const s = summarizeEnemies([
      { level: "danger", score: 0.8, tags: [], noteKey: "" },
      { level: "elevated", score: 0.6, tags: [], noteKey: "" },
      { level: "neutral", score: 0.5, tags: [], noteKey: "" },
    ]);
    expect(s.dangerCount).toBe(2);
    expect(s.textKey).toBe("scout.summary.threats");
    expect(s.textParams).toEqual({ count: 2 });
  });
  it("says no threats when none qualify", () => {
    expect(
      summarizeEnemies([{ level: "neutral", score: 0.5, tags: [], noteKey: "" }]).textKey
    ).toBe("scout.summary.safe");
  });
});
