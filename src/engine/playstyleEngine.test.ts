import { describe, it, expect } from "vitest";
import { buildPlaystyleProfile, getArchetypeMeta } from "./playstyleEngine";
import type { MatchRow } from "../services/matchRepo";

function m(opts: Partial<MatchRow> = {}): MatchRow {
  return {
    matchId: "EUW1_" + Math.random(),
    championId: 238,
    win: false,
    kills: 5,
    deaths: 5,
    assists: 5,
    cs: 200,
    durationSec: 1800, // 30min
    gameEndTimestampMs: Date.now(),
    queueId: 420,
    position: "MIDDLE",
    opponentChampionId: 0,
    ...opts,
  };
}

describe("buildPlaystyleProfile", () => {
  it("returns null below 5 matches (insufficient data)", () => {
    expect(buildPlaystyleProfile([])).toBeNull();
    expect(buildPlaystyleProfile(Array(4).fill(0).map(() => m()))).toBeNull();
  });

  it("detects aggressive (high kills + high deaths)", () => {
    // 13 kills, 9 deaths over 30min → 0.43k/m, 0.30d/m → aggressive
    const matches = Array(5).fill(0).map(() =>
      m({ kills: 13, deaths: 9, assists: 6 })
    );
    const p = buildPlaystyleProfile(matches);
    expect(p?.archetype).toBe("aggressive");
    expect(p?.traits).toContain("Alta presión de kills");
  });

  it("detects safe (low deaths + good farm)", () => {
    const matches = Array(5).fill(0).map(() =>
      m({ kills: 4, deaths: 2, assists: 6, cs: 230 }) // 7.66 CS/min, 0.066 d/min
    );
    const p = buildPlaystyleProfile(matches);
    expect(p?.archetype).toBe("safe");
    expect(p?.traits).toContain("Muy seguro, casi no mueres");
  });

  it("detects supportive (high assists, low kills)", () => {
    const matches = Array(5).fill(0).map(() =>
      m({ kills: 2, deaths: 4, assists: 18, position: "UTILITY", cs: 30 })
    );
    const p = buildPlaystyleProfile(matches);
    expect(p?.archetype).toBe("supportive");
  });

  it("detects scaling when partidas largas + winrate alto", () => {
    const matches = Array(5).fill(0).map(() =>
      m({ kills: 6, deaths: 4, assists: 8, durationSec: 2400, win: true, cs: 240 })
    );
    const p = buildPlaystyleProfile(matches);
    expect(p?.archetype).toBe("scaling");
  });

  it("emits 'Farm bajo' trait when CS/min < 5 for non-support", () => {
    const matches = Array(5).fill(0).map(() =>
      m({ cs: 100, position: "MIDDLE" }) // 3.3 CS/min
    );
    const p = buildPlaystyleProfile(matches);
    expect(p?.traits).toContain("Farm bajo");
  });

  it("does NOT emit 'Farm bajo' for UTILITY (different role expectations)", () => {
    const matches = Array(5).fill(0).map(() =>
      m({ cs: 50, position: "UTILITY" })
    );
    const p = buildPlaystyleProfile(matches);
    expect(p?.traits).not.toContain("Farm bajo");
  });

  it("metrics include aggression + scaling + objective scores in [0,1]", () => {
    const matches = Array(5).fill(0).map(() => m());
    const p = buildPlaystyleProfile(matches);
    expect(p?.metrics.aggressionScore).toBeGreaterThanOrEqual(0);
    expect(p?.metrics.aggressionScore).toBeLessThanOrEqual(1);
    expect(p?.metrics.scalingScore).toBeGreaterThanOrEqual(0);
    expect(p?.metrics.scalingScore).toBeLessThanOrEqual(1);
    expect(p?.metrics.objectiveScore).toBeGreaterThanOrEqual(0);
    expect(p?.metrics.objectiveScore).toBeLessThanOrEqual(1);
  });
});

describe("getArchetypeMeta", () => {
  it("returns label + emoji + tip for every archetype", () => {
    const archetypes = ["aggressive", "scaling", "safe", "playmaker", "carry", "supportive", "balanced"] as const;
    for (const a of archetypes) {
      const meta = getArchetypeMeta(a);
      expect(meta.label).toBeTruthy();
      expect(meta.emoji).toBeTruthy();
      expect(meta.tip).toBeTruthy();
    }
  });
});
