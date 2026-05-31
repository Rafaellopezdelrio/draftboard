import { describe, it, expect } from "vitest";
import { predictDraftWinrate } from "./draftWinrateEngine";
import type { ChampionDb, Champion, MetaTier, CounterEntry, Role } from "../types/champion";

function ch(key: string, name: string, roles: Role[] = ["MIDDLE"], archetypes: Champion["archetypes"] = []): Champion {
  return {
    id: name, key, name, title: "", iconUrl: "", splashUrl: "",
    tags: [], roles, archetypes,
  };
}
function meta(key: string, role: Role, wr: number): MetaTier {
  return { championKey: key, role, tier: "B", winRate: wr, pickRate: 0.05, banRate: 0 };
}
function counter(a: string, vs: string, role: Role, wr: number): CounterEntry {
  return { championKey: a, vsChampionKey: vs, role, winRate: wr, sampleSize: 100 };
}

function mkDb(opts: { champs?: Champion[]; meta?: MetaTier[]; counters?: CounterEntry[] } = {}): ChampionDb {
  const champs = opts.champs ?? [];
  const champions: Record<string, Champion> = {};
  for (const c of champs) champions[c.key] = c;
  return {
    patch: "16.10",
    champions,
    meta: opts.meta ?? [],
    counters: opts.counters ?? [],
    fetchedAt: 0,
  };
}

describe("predictDraftWinrate", () => {
  it("returns 0.5 baseline when no signal", () => {
    const p = predictDraftWinrate({
      db: mkDb(),
      allyKeys: [],
      enemyKeys: [],
    });
    expect(p.winrate).toBe(0.5);
  });

  it("favors ally when ally has better meta winrate", () => {
    const db = mkDb({
      champs: [ch("1", "A"), ch("2", "B")],
      meta: [meta("1", "MIDDLE", 0.56), meta("2", "MIDDLE", 0.48)],
    });
    const p = predictDraftWinrate({ db, allyKeys: ["1"], enemyKeys: ["2"] });
    expect(p.winrate).toBeGreaterThan(0.5);
    expect(p.reasons.some((r) => r.includes("meta tier"))).toBe(true);
  });

  it("penalises ally when their comp is missing archetypes vs full enemy comp", () => {
    const db = mkDb({
      champs: [
        ch("1", "Solo carry", ["MIDDLE"], []), // ally: no archetypes
        ch("2", "Tank", ["TOP"], ["engage", "frontline", "peel"]), // enemy: full
      ],
      meta: [meta("1", "MIDDLE", 0.5), meta("2", "TOP", 0.5)],
    });
    const p = predictDraftWinrate({ db, allyKeys: ["1"], enemyKeys: ["2"] });
    expect(p.winrate).toBeLessThanOrEqual(0.5);
    expect(p.reasons.some((r) => /huecos|completa/.test(r))).toBe(true);
  });

  it("counters boost the side with favorable matchups", () => {
    const db = mkDb({
      champs: [ch("1", "A"), ch("2", "B")],
      meta: [meta("1", "MIDDLE", 0.5), meta("2", "MIDDLE", 0.5)],
      counters: [counter("1", "2", "MIDDLE", 0.62)],
    });
    const p = predictDraftWinrate({ db, allyKeys: ["1"], enemyKeys: ["2"] });
    expect(p.winrate).toBeGreaterThan(0.5);
    expect(p.reasons.some((r) => /matchups/i.test(r))).toBe(true);
  });

  it("winrate is always clamped to [0, 1]", () => {
    // Extreme inputs: huge meta diff, both counters, missing archetypes
    const db = mkDb({
      champs: [ch("1", "Best"), ch("2", "Worst")],
      meta: [meta("1", "MIDDLE", 0.99), meta("2", "MIDDLE", 0.01)],
      counters: [counter("1", "2", "MIDDLE", 1.0)],
    });
    const p = predictDraftWinrate({ db, allyKeys: ["1"], enemyKeys: ["2"] });
    expect(p.winrate).toBeLessThanOrEqual(1);
    expect(p.winrate).toBeGreaterThanOrEqual(0);
  });

  it("uses liveCounters (op.gg) when personal db.counters is empty — revives the dead factor", () => {
    const db = mkDb({
      champs: [ch("1", "A"), ch("2", "B")],
      meta: [meta("1", "MIDDLE", 0.5), meta("2", "MIDDLE", 0.5)],
      counters: [], // no personal history → counter factor was previously dead
    });
    const p = predictDraftWinrate({
      db,
      allyKeys: ["1"],
      enemyKeys: ["2"],
      liveCounters: [counter("1", "2", "MIDDLE", 0.62)],
    });
    expect(p.winrate).toBeGreaterThan(0.5);
    expect(p.reasons.some((r) => /matchups/i.test(r))).toBe(true);
  });

  it("liveCounters take priority over sparse db.counters for the same pair", () => {
    const db = mkDb({
      champs: [ch("1", "A"), ch("2", "B")],
      meta: [meta("1", "MIDDLE", 0.5), meta("2", "MIDDLE", 0.5)],
      counters: [counter("1", "2", "MIDDLE", 0.3)], // personal (4 games) says we lose
    });
    const p = predictDraftWinrate({
      db,
      allyKeys: ["1"],
      enemyKeys: ["2"],
      liveCounters: [counter("1", "2", "MIDDLE", 0.65)], // op.gg (1000s games) says we win
    });
    expect(p.winrate).toBeGreaterThan(0.5);
  });

  it("ignores meta entries for champions not in roles list", () => {
    // Champion has only TOP role, but meta has him in MIDDLE — should NOT count
    const db = mkDb({
      champs: [ch("1", "ToplaneOnly", ["TOP"])],
      meta: [meta("1", "MIDDLE", 0.99)], // wrong role, should be filtered
    });
    const p = predictDraftWinrate({ db, allyKeys: ["1"], enemyKeys: [] });
    // No usable meta → baseline 0.5
    expect(p.winrate).toBe(0.5);
  });
});
