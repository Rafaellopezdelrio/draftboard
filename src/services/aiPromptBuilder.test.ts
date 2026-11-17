import { describe, it, expect } from "vitest";
import {
  professionalCoachSystemPrompt,
  professionalMatchPrompt,
  pickMainFocus,
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
    longestDeathStreak: 2, longestKillStreak: 3,
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

  it("gives a jungler jungle notes first and forbids wave advice; laners keep the general notes only", () => {
    const jng = professionalCoachSystemPrompt({ language: "es", rank: null, position: "JUNGLE" });
    expect(jng).toContain("The user's role this game: JUNGLE");
    expect(jng.indexOf("JUNGLE (the player is the JUNGLER")).toBeLessThan(jng.indexOf("DOMAIN EXPERTISE"));
    expect(jng).toMatch(/Never advise the jungler to freeze/);
    const mid = professionalCoachSystemPrompt({ language: "es", rank: null, position: "MIDDLE" });
    expect(mid).not.toContain("JUNGLE (the player is the JUNGLER");
    expect(professionalCoachSystemPrompt({ language: "es", rank: null, position: "UTILITY" })).toContain("SUPPORT:");
  });

  it("forbids invented facts", () => {
    expect(professionalCoachSystemPrompt({ language: "es", rank: null })).toMatch(/FACTS ONLY/);
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

describe("pickMainFocus", () => {
  const base = { drakesByEnemy: 1, drakesByMyTeam: 2, baronsByEnemy: 0, soloDeaths: 0, deathsBy10: 0, killParticipation: 0.6, controlWardsBought: 3, durationMin: 30, cs10: 80 };
  it("picks the biggest problem in the numbers", () => {
    expect(pickMainFocus(mkAnalytics({ ...base, drakesByEnemy: 4, drakesByMyTeam: 0 }), 72).key).toBe("objetivos");
    expect(pickMainFocus(mkAnalytics({ ...base, soloDeaths: 4, deathsBy10: 3 }), 72).key).toBe("muertes");
    expect(pickMainFocus(mkAnalytics({ ...base, killParticipation: 0.2 }), 72).key).toBe("participacion");
    expect(pickMainFocus(mkAnalytics({ ...base, cs10: 40 }), 72).key).toBe("farmeo");
    expect(pickMainFocus(mkAnalytics({ ...base, position: "JUNGLE", campsPerMinute: 2.5 }), 44).key).toBe("farmeo");
  });
  it("is the same every time for the same game", () => {
    const a = mkAnalytics({ ...base, soloDeaths: 2, drakesByEnemy: 3, drakesByMyTeam: 1 });
    expect(pickMainFocus(a, 72)).toEqual(pickMainFocus(a, 72));
  });
  it("vision only leads when nothing else is wrong (the rule coach flags it almost always)", () => {
    expect(pickMainFocus(mkAnalytics({ ...base, controlWardsBought: 0 }), 72).key).toBe("vision");
    expect(pickMainFocus(mkAnalytics({ ...base, controlWardsBought: 0, drakesByEnemy: 3, drakesByMyTeam: 1 }), 72).key).toBe("objetivos");
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

  it("opens with plain facts the answer must not contradict: result, role, who took each objective", () => {
    const a = mkAnalytics({
      position: "JUNGLE",
      win: true,
      laneOpponentChampionName: "Vi",
      firstTowerByMyTeam: false,
      objectiveTrades: [
        { timestamp: 354_000, objective: "DRAGON", takenByMyTeam: true, myCsDeltaAtTime: -5, myGoldDeltaAtTime: -728 },
        { timestamp: 984_000, objective: "RIFTHERALD", takenByMyTeam: false, myCsDeltaAtTime: -30, myGoldDeltaAtTime: -1535 },
      ],
    });
    const p = professionalMatchPrompt(a, [], "es");
    expect(p).toContain("HECHOS CLAVE");
    expect(p).toContain("Resultado: GANASTE");
    expect(p).toContain("Eres el JUNGLA: no tienes calle ni oleada propia. Tu rival directo es el jungla enemigo (Vi).");
    expect(p).toContain("Primer dragón (5.9 min): lo cogió TU EQUIPO.");
    expect(p).toContain("Primer heraldo (16.4 min): lo cogió EL ENEMIGO.");
    expect(p).toContain("Barón: nadie lo cogió.");
    expect(p).toContain("Primera torre: la tiró EL ENEMIGO.");
    // The deltas read as the state at that moment, not the objective's cost.
    expect(p).toContain("5.9min DRAGON lo cogió TU EQUIPO (en ese momento ibas -5 súbditos y -728 de oro frente a Vi)");
    // Miscounted fields are not sent (a jungle pet read as a finished item at 0.1 min).
    expect(p).not.toMatch(/Items completados|Primer ítem completado/);
  });

  it("on a win, says nothing cost the game; gives the role's targets so none are invented", () => {
    const win = professionalMatchPrompt(mkAnalytics({ position: "JUNGLE", win: true }), [], "es", { tier: "GOLD", division: "IV", lp: 0 });
    expect(win).toContain("Ganaste: nada te costó la partida.");
    expect(win).toContain("Objetivos de tu posición en tu rango (usa estos, no inventes otros): 44 súbditos al minuto 10, ≈ 4.0 campamentos por minuto.");
    const loss = professionalMatchPrompt(mkAnalytics({ position: "MIDDLE", win: false }), [], "es", { tier: "GOLD", division: "IV", lp: 0 });
    expect(loss).not.toContain("nada te costó");
    expect(loss).toContain("72 súbditos al minuto 10.");
  });

  it("names one main topic picked from the numbers", () => {
    const p = professionalMatchPrompt(
      mkAnalytics({ drakesByEnemy: 4, drakesByMyTeam: 0, baronsByEnemy: 0, soloDeaths: 0, deathsBy10: 0, killParticipation: 0.6, controlWardsBought: 3, cs10: 80 }),
      [],
      "es"
    );
    expect(p).toContain("TEMA PRINCIPAL");
    expect(p).toContain("Objetivos: el enemigo cogió 4 dragones y tu equipo 0.");
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
