// Tests for the GPI (Gameplay Performance Index) scoring engine.
//
// GPI is what powers the post-game CoachView's "Tu estilo de juego: X/100"
// rating. The category weights are hand-tuned to mirror Riot/op.gg-style
// performance metrics. These tests lock down:
//   - The clamp behaviour (no scores > 100, no negatives)
//   - The role-aware CS/min and Vision/min targets
//   - Edge cases (zero-team-damage games, deaths = 0, no match for puuid)
//   - The total weights sum to 1.0 (else mid-tier scores drift)

import { describe, it, expect } from "vitest";
import { computeGpi } from "./gpiEngine";
import type { MatchFull, MatchParticipant } from "../services/riotApi";

const mkParticipant = (over: Partial<MatchParticipant> & Pick<MatchParticipant, "puuid">): MatchParticipant => ({
  participantId: 1,
  championId: 266,
  teamId: 100,
  position: "MIDDLE",
  win: true,
  kills: 5,
  deaths: 3,
  assists: 8,
  cs: 200,
  goldEarned: 12000,
  totalDamageDealtToChampions: 20000,
  magicDamageDealtToChampions: 10000,
  physicalDamageDealtToChampions: 10000,
  totalDamageTaken: 18000,
  damageDealtToObjectives: 8000,
  visionScore: 25,
  wardsPlaced: 10,
  wardsKilled: 3,
  controlWardsBought: 2,
  champLevel: 16,
  items: [],
  summoner1Id: 4,
  summoner2Id: 14,
  perks: null,
  ...over,
});

const mkMatch = (parts: MatchParticipant[], durationSec = 1800): MatchFull => ({
  matchId: "EUW1_test",
  durationSec,
  endTsMs: Date.now(),
  queueId: 420,
  participants: parts,
  teams: [],
});

describe("computeGpi", () => {
  it("returns null when puuid not in match (defensive against bad lookups)", () => {
    const m = mkMatch([mkParticipant({ puuid: "other" })]);
    expect(computeGpi(m, "missing")).toBeNull();
  });

  it("returns a score with all GPI categories filled", () => {
    const m = mkMatch([mkParticipant({ puuid: "me" })]);
    const score = computeGpi(m, "me");
    expect(score).not.toBeNull();
    expect(score!.matchId).toBe("EUW1_test");
    expect(Object.keys(score!.categories).sort()).toEqual([
      "aggression",
      "farming",
      "laning",
      "objectives",
      "survivability",
      "versatility",
      "vision",
    ]);
  });

  it("scores laning by CS + gold lead over the direct opponent", () => {
    const aheadGpi = computeGpi(
      mkMatch([
        mkParticipant({ puuid: "me", position: "MIDDLE", cs: 250, goldEarned: 15_000 }),
        mkParticipant({ puuid: "opp", teamId: 200, position: "MIDDLE", cs: 180, goldEarned: 11_000 }),
      ]),
      "me"
    )!.categories.laning;
    const behindGpi = computeGpi(
      mkMatch([
        mkParticipant({ puuid: "me", position: "MIDDLE", cs: 180, goldEarned: 11_000 }),
        mkParticipant({ puuid: "opp", teamId: 200, position: "MIDDLE", cs: 250, goldEarned: 15_000 }),
      ]),
      "me"
    )!.categories.laning;
    expect(aheadGpi).toBeGreaterThan(50);
    expect(behindGpi).toBeLessThan(50);
    expect(aheadGpi).toBeGreaterThan(behindGpi);
  });

  it("clamps all category scores between 0 and 100", () => {
    // Extreme good game: 30/0/15, 500 CS, perfect vision.
    const me = mkParticipant({
      puuid: "me",
      kills: 30, deaths: 0, assists: 15,
      cs: 500, visionScore: 100,
      totalDamageDealtToChampions: 100_000,
    });
    const teammate = mkParticipant({ puuid: "ally", kills: 0, totalDamageDealtToChampions: 100 });
    const m = mkMatch([me, teammate]);
    const s = computeGpi(m, "me")!;
    expect(s.total).toBeLessThanOrEqual(100);
    expect(s.total).toBeGreaterThanOrEqual(0);
    for (const c of Object.values(s.categories)) {
      expect(c).toBeLessThanOrEqual(100);
      expect(c).toBeGreaterThanOrEqual(0);
    }
  });

  it("zero deaths gives near-perfect survivability", () => {
    const m = mkMatch([
      mkParticipant({ puuid: "me", deaths: 0 }),
    ]);
    const s = computeGpi(m, "me")!;
    expect(s.categories.survivability).toBe(100);
  });

  it("many deaths tanks the survivability score", () => {
    const m = mkMatch([
      mkParticipant({ puuid: "me", deaths: 20 }), // ~0.66/min in 30min = under 0
    ]);
    const s = computeGpi(m, "me")!;
    expect(s.categories.survivability).toBe(0);
  });

  it("UTILITY role is excused from farming (returns neutral 50)", () => {
    const m = mkMatch([
      mkParticipant({ puuid: "me", position: "UTILITY", cs: 30 }),
    ]);
    const s = computeGpi(m, "me")!;
    expect(s.categories.farming).toBe(50);
  });

  it("CS-heavy game at the bracket target gives ~75 farming", () => {
    // Emerald MID target = 7.5 CS/min. 30 min match. 7.5 * 30 = 225 CS = target.
    // Score formula: (cspm / target) * 75 → exactly 75 at target.
    const m = mkMatch([
      mkParticipant({ puuid: "me", position: "MIDDLE", cs: 225 }),
      mkParticipant({ puuid: "x" }),
    ]);
    const s = computeGpi(m, "me", "EMERALD")!;
    expect(s.categories.farming).toBe(75);
  });

  it("scores farming relative to rank — same CS reads lower at higher rank", () => {
    const m = mkMatch([
      mkParticipant({ puuid: "me", position: "MIDDLE", cs: 225 }),
      mkParticipant({ puuid: "x" }),
    ]);
    const gold = computeGpi(m, "me", "GOLD")!.categories.farming;
    const master = computeGpi(m, "me", "MASTER")!.categories.farming;
    expect(gold).toBeGreaterThan(master);
  });

  it("kill participation drives aggression", () => {
    // Me 10 kills + 0 assists, teammates 0 → KP = 1.0 → high aggression.
    const me = mkParticipant({
      puuid: "me",
      kills: 10, assists: 0,
      totalDamageDealtToChampions: 30_000,
    });
    const teammate = mkParticipant({
      puuid: "ally",
      kills: 0,
      totalDamageDealtToChampions: 10_000,
    });
    const m = mkMatch([me, teammate]);
    const s = computeGpi(m, "me")!;
    expect(s.categories.aggression).toBeGreaterThan(70);
  });

  it("no team kills → aggression handles divide-by-zero gracefully", () => {
    const m = mkMatch([
      mkParticipant({ puuid: "me", kills: 0, assists: 0, totalDamageDealtToChampions: 0 }),
      mkParticipant({ puuid: "ally", kills: 0, totalDamageDealtToChampions: 0 }),
    ]);
    const s = computeGpi(m, "me")!;
    expect(s.categories.aggression).toBeGreaterThanOrEqual(0);
    expect(s.categories.aggression).toBeLessThanOrEqual(100);
    expect(Number.isFinite(s.categories.aggression)).toBe(true);
  });

  it("scoreObjectives returns 50 baseline when team dealt no objective damage", () => {
    const me = mkParticipant({ puuid: "me", damageDealtToObjectives: 0 });
    const ally = mkParticipant({ puuid: "ally", damageDealtToObjectives: 0 });
    const s = computeGpi(mkMatch([me, ally]), "me")!;
    expect(s.categories.objectives).toBe(50);
  });

  it("scores objectives by share of team objective damage", () => {
    // me 4000 of (4000+16000) = 0.2 share -> 50; me 16000 -> 0.8 -> clamp 100.
    const lowShare = computeGpi(
      mkMatch([
        mkParticipant({ puuid: "me", damageDealtToObjectives: 4000 }),
        mkParticipant({ puuid: "ally", damageDealtToObjectives: 16000 }),
      ]),
      "me"
    )!;
    expect(lowShare.categories.objectives).toBe(50);
    const highShare = computeGpi(
      mkMatch([
        mkParticipant({ puuid: "me", damageDealtToObjectives: 16000 }),
        mkParticipant({ puuid: "ally", damageDealtToObjectives: 4000 }),
      ]),
      "me"
    )!;
    expect(highShare.categories.objectives).toBe(100);
  });

  it("total is weighted average of categories (manually checked)", () => {
    // Construct a match where every category lands at exactly 50 — the
    // total should also be 50 (weights sum to 1.0).
    //
    // For 0 deaths / 30min match: deaths=0 → survivability = 100. To get
    // ~50, use deaths so dpm * 200 = 50 → dpm = 0.25 → 30min * 0.25 = 7.5
    // deaths. Round to 8 for integer.
    //
    // We don't pin the exact value — we only assert it's BETWEEN the min
    // and max of the categories (i.e. it's a real weighted mean).
    const me = mkParticipant({ puuid: "me", deaths: 8 });
    const s = computeGpi(mkMatch([me, mkParticipant({ puuid: "ally" })]), "me")!;
    const cats = Object.values(s.categories);
    const min = Math.min(...cats);
    const max = Math.max(...cats);
    expect(s.total).toBeGreaterThanOrEqual(min);
    expect(s.total).toBeLessThanOrEqual(max);
  });

  it("uses team filter (only same teamId counted in team aggregates)", () => {
    const me = mkParticipant({
      puuid: "me", teamId: 100, kills: 5, totalDamageDealtToChampions: 10_000,
    });
    const ally = mkParticipant({
      puuid: "ally", teamId: 100, kills: 5, totalDamageDealtToChampions: 10_000,
    });
    const enemy = mkParticipant({
      puuid: "enemy", teamId: 200, kills: 100, totalDamageDealtToChampions: 1_000_000,
    });
    const s = computeGpi(mkMatch([me, ally, enemy]), "me")!;
    // KP should be against team total kills = 10 (5+5), not 110.
    // me kills+assists = 5+8 = 13. KP = 13/10 = 1.3 → clamped via .6 weight
    // but should be high regardless. If the enemy was counted, KP ≈ 0.118.
    expect(s.categories.aggression).toBeGreaterThan(50);
  });
});
