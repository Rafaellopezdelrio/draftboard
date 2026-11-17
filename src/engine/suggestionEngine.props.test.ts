// Property tests: random drafts every run, rules that must always hold.
// A failure prints the seed; replay with PROP_SEED=<seed> npx vitest run <file>.
import { describe, it, expect } from "vitest";
import { suggest, masteryRecency, __test } from "./suggestionEngine";
import { PROP_SEED, rng } from "../test/random";
import type { Archetype, Champion, ChampionDb, CounterEntry, MetaTier, Role } from "../types/champion";
import type { ChampionMasteryDto } from "../services/riotApi";
import type { ChampionPersonalStat } from "../services/matchRepo";

const ROLES: Role[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const TAGS = ["Assassin", "Mage", "Marksman", "Fighter", "Tank", "Support"];
const ARCHETYPES: Archetype[] = ["engage", "frontline", "peel", "poke", "burst", "sustain-dps"];
const TIERS: MetaTier["tier"][] = ["S+", "S", "A", "B", "C", "D"];
const RUNS = 200;
const DAY = 86_400_000;

function randomWorld(r: ReturnType<typeof rng>) {
  const n = r.int(12, 40);
  const champions: Record<string, Champion> = {};
  const metaRows: MetaTier[] = [];
  const counters: CounterEntry[] = [];
  for (let i = 0; i < n; i++) {
    const key = String(5000 + i); // ids outside the hand role map
    const roles = ROLES.filter(() => r.chance(0.35));
    if (roles.length === 0) roles.push(r.pick(ROLES));
    champions[key] = {
      id: `Rand${i}`,
      key,
      name: `Rand${i}`,
      title: "",
      iconUrl: "",
      splashUrl: "",
      tags: TAGS.filter(() => r.chance(0.3)),
      roles,
      archetypes: ARCHETYPES.filter(() => r.chance(0.25)),
    };
    for (const role of roles)
      if (r.chance(0.8)) metaRows.push({ championKey: key, role, tier: r.pick(TIERS), winRate: r.float(0.45, 0.55), pickRate: r.float(0, 0.15), banRate: 0 });
  }
  const keys = Object.keys(champions);
  for (let i = 0; i < n * 3; i++)
    counters.push({ championKey: r.pick(keys), vsChampionKey: r.pick(keys), role: r.pick(ROLES), winRate: r.float(0.35, 0.65), sampleSize: r.int(0, 400) });
  const db = { patch: "16.22", champions, counters, meta: metaRows, fetchedAt: 0 } as ChampionDb;

  const shuffled = [...keys].sort(() => r.next() - 0.5);
  const enemyKeys = shuffled.slice(0, r.int(0, 5));
  const allyKeys = shuffled.slice(5, 5 + r.int(0, 4));
  const bannedKeys = shuffled.slice(9, 9 + r.int(0, 3));
  const personalStats: ChampionPersonalStat[] = keys.filter(() => r.chance(0.3)).map((k) => {
    const games = r.int(0, 30);
    const wins = r.int(0, games);
    return { championId: Number(k), games, wins, winRate: games ? wins / games : 0 };
  });
  const masteries: ChampionMasteryDto[] = keys.filter(() => r.chance(0.3)).map(
    (k) => ({ championId: Number(k), championLevel: r.int(1, 12), championPoints: r.int(0, 400_000), lastPlayTime: r.chance(0.2) ? 0 : Date.now() - r.int(0, 900) * DAY }) as ChampionMasteryDto
  );
  return {
    db,
    role: r.chance(0.15) ? null : r.pick(ROLES),
    enemyKeys,
    allyKeys,
    bannedKeys,
    personalStats,
    masteries,
    rankTier: r.pick([null, "GOLD", "UNRANKED", "DIAMOND"]),
    limit: r.int(1, 12),
  };
}

describe(`suggest — random drafts (seed ${PROP_SEED})`, () => {
  it("scores and fits stay in 0..1, no taken champion, no lane outsider, at most `limit`, sorted except the 'best for this game' slot", () => {
    const r = rng();
    for (let run = 0; run < RUNS; run++) {
      const w = randomWorld(r);
      const out = suggest({ ...w, selfKey: null });
      const msg = `seed ${PROP_SEED}, run ${run}`;
      expect(out.length, msg).toBeLessThanOrEqual(w.limit);
      const taken = new Set([...w.enemyKeys, ...w.allyKeys, ...w.bannedKeys]);
      for (const s of out) {
        expect(taken.has(s.champion.key), msg).toBe(false);
        expect(s.score, msg).toBeGreaterThanOrEqual(0);
        expect(s.score, msg).toBeLessThanOrEqual(1);
        expect(s.breakdown.fit, msg).toBeGreaterThanOrEqual(0);
        expect(s.breakdown.fit, msg).toBeLessThanOrEqual(1);
        expect(Number.isFinite(s.score), msg).toBe(true);
        if (w.role) expect(__test.isPlayableInRole(s.champion, w.role, w.db), msg).toBe(true);
        expect(s.color, msg).toBe(s.score >= 0.6 ? "good" : s.score >= 0.45 ? "meh" : "bad");
      }
      const best = out.findIndex((s) => s.reasons.includes("suggestions.reason.bestForDraft"));
      const ranked = best >= 0 ? out.filter((_, i) => i !== best) : out;
      for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].score, msg).toBeGreaterThanOrEqual(ranked[i].score);
      if (best >= 0) {
        expect(out[best].breakdown.isComfort, msg).toBe(false);
        // Your #1 (top score) always stays first; the "best for this game"
        // pick never replaces it.
        expect(best, msg).toBeGreaterThan(0);
        expect(out[best].breakdown.fit - out[0].breakdown.fit, msg).toBeGreaterThanOrEqual(0.05 - 1e-9);
      }
      if (out.length > 0) {
        const all = suggest({ ...w, limit: 999, selfKey: null });
        expect(out[0].champion.key, msg).toBe(all[0].champion.key);
      }
    }
  });

  it("a better lane matchup never lowers a champion's score", () => {
    const r = rng(PROP_SEED + 1);
    for (let run = 0; run < RUNS; run++) {
      const w = randomWorld(r);
      const keys = Object.keys(w.db.champions).filter((k) => !w.enemyKeys.includes(k));
      if (w.enemyKeys.length === 0 || keys.length === 0) continue;
      const me = r.pick(keys);
      const enemy = r.pick(w.enemyKeys);
      const role = w.role ?? w.db.champions[me].roles[0];
      const lo = r.float(0.35, 0.6);
      const hi = lo + r.float(0, 0.1);
      const withRate = (wr: number) => ({
        ...w.db,
        counters: [{ championKey: me, vsChampionKey: enemy, role, winRate: wr, sampleSize: 500 }, ...w.db.counters],
      });
      const score = (wr: number) =>
        suggest({ ...w, db: withRate(wr), role, bannedKeys: [], allyKeys: [], limit: 999, selfKey: null })
          .find((s) => s.champion.key === me)?.score;
      const a = score(lo);
      const b = score(hi);
      if (a === undefined || b === undefined) continue;
      expect(b, `seed ${PROP_SEED}, run ${run}`).toBeGreaterThanOrEqual(a - 1e-12);
    }
  });

  it("playing a champion more (more games, same win rate) never lowers its score", () => {
    const r = rng(PROP_SEED + 2);
    for (let run = 0; run < RUNS; run++) {
      const w = randomWorld(r);
      const me = r.pick(Object.keys(w.db.champions));
      if (w.enemyKeys.includes(me) || w.allyKeys.includes(me) || w.bannedKeys.includes(me)) continue;
      const games = r.int(0, 4);
      const stats = (g: number) => [{ championId: Number(me), games: g, wins: g, winRate: g ? 1 : 0 }];
      const score = (g: number) =>
        suggest({ ...w, personalStats: stats(g), masteries: [], limit: 999, selfKey: null }).find((s) => s.champion.key === me)?.score;
      const a = score(games);
      const b = score(games + r.int(1, 5));
      if (a === undefined || b === undefined) continue;
      expect(b, `seed ${PROP_SEED}, run ${run}`).toBeGreaterThanOrEqual(a - 1e-12);
    }
  });
});

describe(`mastery — random values (seed ${PROP_SEED})`, () => {
  it("recency never grows with age; mastery score stays in 0.2..1 and never grows with age", () => {
    const r = rng(PROP_SEED + 3);
    const now = 2_000 * DAY;
    for (let run = 0; run < RUNS; run++) {
      const a = r.int(1, 1500) * DAY * r.next();
      const b = a + r.float(0, 400) * DAY;
      expect(masteryRecency(now - b, now)).toBeLessThanOrEqual(masteryRecency(now - a, now));
      const lvl = r.int(0, 12);
      const pts = r.int(0, 500_000);
      const m = (age: number) => new Map([[1, { championId: 1, championLevel: lvl, championPoints: pts, lastPlayTime: Date.now() - age } as ChampionMasteryDto]]);
      const sa = __test.masteryScore(1, m(a + 1));
      const sb = __test.masteryScore(1, m(b + 1));
      for (const s of [sa, sb]) {
        expect(s, `seed ${PROP_SEED}, run ${run}`).toBeGreaterThanOrEqual(0.2 - 1e-12);
        expect(s, `seed ${PROP_SEED}, run ${run}`).toBeLessThanOrEqual(1 + 1e-12);
      }
      expect(sb, `seed ${PROP_SEED}, run ${run}`).toBeLessThanOrEqual(sa + 1e-12);
    }
  });

  it("the lane-weighted matchup always sits between the worst and best real matchup", () => {
    const r = rng(PROP_SEED + 4);
    for (let run = 0; run < RUNS; run++) {
      const enemies = Array.from({ length: r.int(1, 5) }, (_, i) => String(i));
      const counters: CounterEntry[] = enemies
        .filter(() => r.chance(0.8))
        .map((e) => ({ championKey: "me", vsChampionKey: e, role: "MIDDLE", winRate: r.float(0.3, 0.7), sampleSize: r.int(0, 300) }));
      const real = counters.filter((c) => c.sampleSize >= 50).map((c) => c.winRate);
      const v = __test.laneWeightedCounter("me", enemies, r.chance(0.5) ? r.pick(enemies) : null, "MIDDLE", counters);
      if (real.length === 0) expect(v).toBe(0.5);
      else {
        expect(v, `seed ${PROP_SEED}, run ${run}`).toBeGreaterThanOrEqual(Math.min(...real) - 1e-12);
        expect(v, `seed ${PROP_SEED}, run ${run}`).toBeLessThanOrEqual(Math.max(...real) + 1e-12);
      }
    }
  });
});
