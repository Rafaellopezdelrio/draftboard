import { describe, it, expect } from "vitest";
import {
  professionalCoachSystemPrompt,
  professionalMatchPrompt,
} from "./aiPromptBuilder";
import type { ProMatchAnalytics } from "../engine/matchAnalytics";

function mkAnalytics(overrides: Partial<ProMatchAnalytics> = {}): ProMatchAnalytics {
  const teamMate = (id: number, name: string, pos: string) => ({
    championId: id, championName: name, position: pos,
  });
  return {
    cs5: 30, cs10: 70, cs14: 100, cs20: 150,
    goldAt5: 1200, goldAt10: 3500, goldAt15: 6000, goldAt20: 8500,
    xpAt10: 4000,
    level5: 4, level10: 7, level14: 10, level20: 13,
    csDiffAt10: -10, csDiffAt14: -15, csDiffAt20: -20,
    goldDiffAt10: -500, goldDiffAt15: -800, goldDiffAt20: -1200,
    xpDiffAt10: -300,
    deathsBy10: 2, deathsAt5: 1, soloDeaths: 2,
    deathsInLane: 3, deathLocations: ["mid lane", "river"],
    goldLeadAt15: -800, csLeadAt14: -15, killsBy10: 1,
    drakesByMyTeam: 2, drakesByEnemy: 2, baronsByMyTeam: 0, baronsByEnemy: 1,
    firstDragonTime: 360000, firstHeraldTime: 480000, firstBaronTime: 1200000,
    firstTowerByMyTeam: false,
    visionScorePerMin: 1.0, controlWardsBought: 3, wardsKilled: 4, pinksByMin10: 1,
    damagePerGold: 1.5, damagePerDeath: 3000, killParticipation: 0.5,
    damageShare: 0.27, damageTakenShare: 0.2,
    firstItemTime: 600000, itemsPurchasedCount: 15, hadStopwatch: true, hadQss: false,
    longestDeathStreak: 2, longestKillStreak: 3, recallsBeforeDeath: 1,
    myChampionId: 238, myChampionName: "Zed",
    laneOpponentChampionId: 90, laneOpponentChampionName: "Malzahar",
    position: "MIDDLE",
    win: false,
    durationMin: 30,
    queueId: 420,
    myTeamId: 100,
    myTeamComposition: [
      teamMate(86, "Garen", "TOP"),
      teamMate(64, "LeeSin", "JUNGLE"),
      teamMate(238, "Zed", "MIDDLE"),
      teamMate(222, "Jinx", "BOTTOM"),
      teamMate(412, "Thresh", "UTILITY"),
    ],
    enemyTeamComposition: [
      teamMate(122, "Darius", "TOP"),
      teamMate(254, "Vi", "JUNGLE"),
      teamMate(90, "Malzahar", "MIDDLE"),
      teamMate(51, "Caitlyn", "BOTTOM"),
      teamMate(117, "Lulu", "UTILITY"),
    ],
    objectiveTrades: [],
    jungleCs10: 0, jungleCs15: 0, campsPerMinute: 0,
    ...overrides,
  };
}

describe("professionalCoachSystemPrompt", () => {
  it("calibrates persona to Iron-Bronze bucket (beginner-friendly)", () => {
    const p = professionalCoachSystemPrompt({
      language: "es",
      rank: { tier: "IRON", division: "II", lp: 50 },
    });
    expect(p.toLowerCase()).toContain("beginner");
  });

  it("calibrates persona to Challenger (elite, no fundamentals)", () => {
    const p = professionalCoachSystemPrompt({
      language: "en",
      rank: { tier: "CHALLENGER", division: "I", lp: 800 },
    });
    expect(p.toLowerCase()).toContain("challenger");
  });

  it("defaults to Diamond persona when rank is null", () => {
    const p = professionalCoachSystemPrompt({ language: "es", rank: null });
    expect(p.toLowerCase()).toContain("decision-making");
  });

  it("respects language choice (ends with 'Respond in <lang>')", () => {
    const es = professionalCoachSystemPrompt({ language: "es", rank: null });
    expect(es).toMatch(/Respond in Spanish/);
    const en = professionalCoachSystemPrompt({ language: "en", rank: null });
    expect(en).toMatch(/Respond in English/);
  });

  it("ALWAYS FIND IMPROVEMENT clause prevents 'perfect game, nothing to improve'", () => {
    // This is the surgical constraint we added — make sure it survives refactors.
    const p = professionalCoachSystemPrompt({ language: "es", rank: null });
    expect(p).toMatch(/ALWAYS FIND IMPROVEMENT|never end with "perfect game"/i);
  });

  it("includes coaching framework structure (T1/G2 review)", () => {
    const p = professionalCoachSystemPrompt({ language: "es", rank: null });
    expect(p).toMatch(/GAME-DEFINING MOMENT/);
    expect(p).toMatch(/CAUSAL CHAIN/);
    expect(p).toMatch(/THE FIX/);
  });

  it("includes macrogame + microgame pro expertise sections", () => {
    const p = professionalCoachSystemPrompt({ language: "es", rank: null });
    expect(p).toMatch(/MACROGAME/);
    expect(p).toMatch(/MICROGAME/);
    expect(p).toMatch(/ECONOMY/);
    expect(p).toMatch(/VISION/);
  });

  it("includes specific timing/terminology that pro coaches use", () => {
    const p = professionalCoachSystemPrompt({ language: "es", rank: null });
    // Wave concepts
    expect(p.toLowerCase()).toMatch(/slow push|freeze|reset/);
    // Macro
    expect(p.toLowerCase()).toMatch(/tempo|prio/);
    // Sums tracking
    expect(p.toLowerCase()).toMatch(/flash.*5:?00|cosmic/);
  });
});

describe("professionalMatchPrompt", () => {
  it("includes champion, role, team comps, and CS benchmarks", () => {
    const a = mkAnalytics();
    const p = professionalMatchPrompt(a, [], "es");
    expect(p).toContain("Zed");
    expect(p).toContain("Malzahar");
    expect(p).toContain("MIDDLE");
    expect(p).toContain("CS@10");
    expect(p).toContain("CS diff @10");
  });

  it("includes jungle-specific section only when role is JUNGLE", () => {
    const jng = mkAnalytics({
      position: "JUNGLE",
      jungleCs10: 35,
      jungleCs15: 60,
      campsPerMinute: 3.8,
    });
    const pJng = professionalMatchPrompt(jng, [], "es");
    expect(pJng).toContain("JUNGLA");
    expect(pJng).toContain("3.8");

    const mid = mkAnalytics({ position: "MIDDLE" });
    const pMid = professionalMatchPrompt(mid, [], "es");
    expect(pMid).not.toContain("JUNGLA");
  });

  it("filters out 'good' and 'info' insights, keeps only bad/warn", () => {
    const a = mkAnalytics();
    const p = professionalMatchPrompt(
      a,
      [
        { category: "farming", severity: "bad", title: "CS bajo", detail: "Detail bad" },
        { category: "vision", severity: "good", title: "Visión OK", detail: "Detail good" },
        { category: "deaths", severity: "warn", title: "Muertes early", detail: "Detail warn" },
        { category: "build", severity: "info", title: "Build OK", detail: "Detail info" },
      ],
      "es"
    );
    expect(p).toContain("[bad] CS bajo");
    expect(p).toContain("[warn] Muertes early");
    expect(p).not.toContain("Detail good");
    expect(p).not.toContain("Detail info");
  });

  it("scales CS benchmarks with elo (challenger > iron)", () => {
    const a = mkAnalytics();
    const iron = professionalMatchPrompt(a, [], "es", {
      tier: "IRON", division: "I", lp: 0,
    });
    const chal = professionalMatchPrompt(a, [], "es", {
      tier: "CHALLENGER", division: "I", lp: 800,
    });
    // The benchmark numbers should be different — challenger has higher targets
    expect(iron).toContain("target 55"); // MIDDLE iron-bronze cs10
    expect(chal).toContain("target 88"); // MIDDLE challenger cs10
  });
});
