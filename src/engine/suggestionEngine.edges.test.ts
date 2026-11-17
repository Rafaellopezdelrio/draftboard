// Edge tests for the pick engine's internal pieces. Written after mutation
// testing (Stryker) showed the engine tests caught only 41 % of injected
// faults: these pin each threshold and weight so a flipped `>=`, a dropped
// bonus or a swapped number turns a test red.
import { describe, it, expect } from "vitest";
import { __test, masteryRecency } from "./suggestionEngine";
import type { Archetype, Champion, ChampionDb, CounterEntry, MetaTier, Role } from "../types/champion";
import type { ChampionMasteryDto } from "../services/riotApi";
import type { ChampionPersonalStat } from "../services/matchRepo";

const {
  isUnranked,
  isPlayableInRole,
  laneWeightedCounter,
  damageKind,
  damageSplit,
  countArchetypes,
  compFitScore,
  comfortTier,
  personalScore,
  masteryScore,
  synergyScore,
  metaScore,
  archetypeFitScore,
  scoreChampion,
} = __test;

const DAY = 86_400_000;

function champ(key: string, id: string, opts: Partial<Champion> = {}): Champion {
  return { id, key, name: id, title: "", iconUrl: "", splashUrl: "", tags: [], roles: [], archetypes: [], ...opts };
}
function meta(championKey: string, role: Role, pickRate: number, tier: MetaTier["tier"] = "B"): MetaTier {
  return { championKey, role, tier, winRate: 0.51, pickRate, banRate: 0 };
}
function db(champions: Champion[], metaRows: MetaTier[] = []): ChampionDb {
  return {
    patch: "16.22",
    champions: Object.fromEntries(champions.map((c) => [c.key, c])),
    counters: [],
    meta: metaRows,
    fetchedAt: 0,
  } as ChampionDb;
}
function counter(championKey: string, vsChampionKey: string, winRate: number, sampleSize = 100, role: Role = "MIDDLE"): CounterEntry {
  return { championKey, vsChampionKey, role, winRate, sampleSize };
}
function mastery(championId: number, championLevel: number, championPoints = 0, lastPlayTime?: number): ChampionMasteryDto {
  return { championId, championLevel, championPoints, lastPlayTime } as ChampionMasteryDto;
}
function personal(championId: number, games: number, wins: number): ChampionPersonalStat {
  return { championId, games, wins, winRate: games ? wins / games : 0 };
}

describe("isUnranked", () => {
  it("no rank, empty, UNRANKED, UNRANK and NONE (any case) count as unranked", () => {
    for (const t of [null, undefined, "", "UNRANKED", "unranked", "UNRANK", "none", "NONE"]) {
      expect(isUnranked(t), String(t)).toBe(true);
    }
  });
  it("a real tier is ranked", () => {
    for (const t of ["GOLD", "iron", "Challenger"]) expect(isUnranked(t), t).toBe(false);
  });
});

describe("isPlayableInRole", () => {
  // Qiyana is MIDDLE-only in the hand map; "Brandnew" is not in it at all.
  const qiyana = champ("246", "Qiyana", { roles: ["MIDDLE"] });
  const brandnew = champ("9001", "Brandnew", { roles: ["TOP", "JUNGLE"] });

  it("a live lane list entry (≥ 0.3 % pick) makes the lane real even against the hand map", () => {
    expect(isPlayableInRole(qiyana, "JUNGLE", db([qiyana], [meta("246", "JUNGLE", 0.08)]))).toBe(true);
    expect(isPlayableInRole(qiyana, "JUNGLE", db([qiyana], [meta("246", "JUNGLE", 0.003)]))).toBe(true);
  });
  it("a token lane entry under 0.3 % does not override the hand map", () => {
    expect(isPlayableInRole(qiyana, "JUNGLE", db([qiyana], [meta("246", "JUNGLE", 0.0029)]))).toBe(false);
  });
  it("without lane data the hand map decides", () => {
    expect(isPlayableInRole(qiyana, "MIDDLE", db([qiyana]))).toBe(true);
    expect(isPlayableInRole(qiyana, "JUNGLE", db([qiyana]))).toBe(false);
  });
  it("a champion outside the map follows the lane lists, then its tags", () => {
    const withMeta = db([brandnew], [meta("9001", "TOP", 0.02)]);
    expect(isPlayableInRole(brandnew, "TOP", withMeta)).toBe(true);
    // In the lists but not for this lane → not playable there, tags aside.
    expect(isPlayableInRole(brandnew, "JUNGLE", withMeta)).toBe(false);
    expect(isPlayableInRole(brandnew, "TOP", db([brandnew], [meta("9001", "TOP", 0.0029)]))).toBe(false);
    // No data at all → its own tags.
    expect(isPlayableInRole(brandnew, "JUNGLE", db([brandnew]))).toBe(true);
    expect(isPlayableInRole(brandnew, "MIDDLE", db([brandnew]))).toBe(false);
  });
});

describe("laneWeightedCounter", () => {
  it("averages real matchups with the lane opponent counted twice", () => {
    const cs = [counter("1", "10", 0.6), counter("1", "11", 0.45)];
    expect(laneWeightedCounter("1", ["10", "11"], "10", "MIDDLE", cs)).toBeCloseTo((0.6 * 2 + 0.45) / 3, 10);
    expect(laneWeightedCounter("1", ["10", "11"], "11", "MIDDLE", cs)).toBeCloseTo((0.6 + 0.45 * 2) / 3, 10);
    expect(laneWeightedCounter("1", ["10", "11"], null, "MIDDLE", cs)).toBeCloseTo((0.6 + 0.45) / 2, 10);
  });
  it("skips pairs under 50 games, other lanes and other champions; 0.5 with no data", () => {
    const cs = [
      counter("1", "10", 0.7, 49),
      counter("1", "11", 0.7, 100, "TOP"),
      counter("2", "12", 0.7),
      counter("1", "13", 0.4, 50),
    ];
    expect(laneWeightedCounter("1", ["10", "11", "12", "13"], null, "MIDDLE", cs)).toBeCloseTo(0.4, 10);
    expect(laneWeightedCounter("1", ["10", "11", "12"], null, "MIDDLE", cs)).toBe(0.5);
    expect(laneWeightedCounter("1", [], null, "MIDDLE", cs)).toBe(0.5);
  });
});

describe("damageKind / damageSplit / countArchetypes", () => {
  it("reads the main damage from class tags", () => {
    expect(damageKind(champ("1", "Akali", { tags: ["Assassin"] }))).toBe("magic"); // AP assassin list
    expect(damageKind(champ("2", "Evelynn2", { tags: ["Assassin", "Mage"] }))).toBe("magic");
    expect(damageKind(champ("3", "Zed", { tags: ["Assassin"] }))).toBe("physical");
    expect(damageKind(champ("4", "Lux", { tags: ["Mage"] }))).toBe("magic");
    expect(damageKind(champ("5", "Jinx", { tags: ["Marksman"] }))).toBe("physical");
    expect(damageKind(champ("6", "Darius", { tags: ["Fighter"] }))).toBe("physical");
    expect(damageKind(champ("7", "Malphite", { tags: ["Tank"] }))).toBeNull();
    expect(damageKind(champ("8", "Janna", { tags: ["Support"] }))).toBeNull();
  });
  it("counts damage types and archetypes over known champions only", () => {
    const d = db([
      champ("1", "Lux", { tags: ["Mage"], archetypes: ["poke"] }),
      champ("2", "Jinx", { tags: ["Marksman"], archetypes: ["sustain-dps", "poke"] }),
      champ("3", "Malphite", { tags: ["Tank"], archetypes: ["engage", "frontline"] }),
      champ("4", "Zed", { tags: ["Assassin"], archetypes: ["burst"] }),
    ]);
    expect(damageSplit(d, ["1", "2", "3", "4", "999"])).toEqual({ magic: 1, physical: 2 });
    const a = countArchetypes(d, ["1", "2", "3", "999"]);
    expect(a.get("poke")).toBe(2);
    expect(a.get("engage")).toBe(1);
    expect(a.get("burst")).toBeUndefined();
  });
});

function compCtx(over: {
  engage?: number;
  poke?: number;
  divers?: number;
  burst?: number;
  magic?: number;
  physical?: number;
}) {
  const enemyArchetypes = new Map<Archetype, number>();
  if (over.engage) enemyArchetypes.set("engage", over.engage);
  if (over.poke) enemyArchetypes.set("poke", over.poke);
  return {
    enemyArchetypes,
    enemyComp: { apShare: 0, adShare: 0, hardCC: 0, burstThreats: over.burst ?? 0, divers: over.divers ?? 0, healers: 0 },
    allyDamage: { magic: over.magic ?? 0, physical: over.physical ?? 0 },
  } as unknown as Parameters<typeof compFitScore>[1];
}

describe("compFitScore", () => {
  const peel = champ("1", "Janna", { archetypes: ["peel"] });
  const front = champ("2", "Malphite", { tags: ["Tank"], archetypes: ["frontline"] });
  const engager = champ("3", "Leona", { tags: ["Tank"], archetypes: ["engage"] });
  const mage = champ("4", "Lux", { tags: ["Mage"] });
  const adc = champ("5", "Jinx", { tags: ["Marksman"] });
  const plain = champ("6", "Plain");

  it("nothing to say → 0.5", () => {
    expect(compFitScore(plain, compCtx({}))).toBe(0.5);
  });
  it("3+ engage/divers on the enemy → peel or frontline +0.15 (2 is not enough)", () => {
    expect(compFitScore(peel, compCtx({ engage: 2, divers: 1 }))).toBeCloseTo(0.65, 10);
    expect(compFitScore(front, compCtx({ engage: 3 }))).toBeCloseTo(0.65, 10);
    expect(compFitScore(peel, compCtx({ engage: 1, divers: 1 }))).toBe(0.5);
    expect(compFitScore(mage, compCtx({ engage: 3 }))).toBe(0.5);
  });
  it("2+ poke on the enemy → engage +0.15 (1 is not enough)", () => {
    expect(compFitScore(engager, compCtx({ poke: 2 }))).toBeCloseTo(0.65, 10);
    expect(compFitScore(engager, compCtx({ poke: 1 }))).toBe(0.5);
    expect(compFitScore(peel, compCtx({ poke: 3 }))).toBe(0.5);
  });
  it("2+ burst threats → frontline or peel +0.1 (1 is not enough)", () => {
    expect(compFitScore(front, compCtx({ burst: 2 }))).toBeCloseTo(0.6, 10);
    expect(compFitScore(peel, compCtx({ burst: 2 }))).toBeCloseTo(0.6, 10);
    expect(compFitScore(front, compCtx({ burst: 1 }))).toBe(0.5);
  });
  it("own team ≥ 75 % one damage type over 3+ sources: other type +0.2, same type −0.15", () => {
    expect(compFitScore(adc, compCtx({ magic: 3, physical: 1 }))).toBeCloseTo(0.7, 10);
    expect(compFitScore(mage, compCtx({ magic: 3, physical: 1 }))).toBeCloseTo(0.35, 10);
    expect(compFitScore(mage, compCtx({ physical: 3 }))).toBeCloseTo(0.7, 10);
    expect(compFitScore(adc, compCtx({ physical: 3 }))).toBeCloseTo(0.35, 10);
    // 2 of 3 is not "mostly one type"; 2 sources is too few; tanks deal no type.
    expect(compFitScore(adc, compCtx({ magic: 2, physical: 1 }))).toBe(0.5);
    expect(compFitScore(adc, compCtx({ magic: 2 }))).toBe(0.5);
    expect(compFitScore(front, compCtx({ magic: 4 }))).toBe(0.5);
  });
  it("stays inside 0..1 when every bonus stacks", () => {
    const all = champ("7", "All", { tags: ["Marksman"], archetypes: ["peel", "engage"] });
    expect(compFitScore(all, compCtx({ engage: 3, poke: 2, burst: 2, magic: 3 }))).toBe(1);
  });
});

describe("comfortTier", () => {
  it("pool: 3+ games or recent mastery ≥ 0.7", () => {
    expect(comfortTier(0.2, personal(1, 3, 1))).toBe("pool");
    expect(comfortTier(0.7, undefined)).toBe("pool");
  });
  it("known: a game or mastery ≥ 0.5; else nothing", () => {
    expect(comfortTier(0.2, personal(1, 2, 1))).toBe("known");
    expect(comfortTier(0.2, personal(1, 1, 0))).toBe("known");
    expect(comfortTier(0.69, undefined)).toBe("known");
    expect(comfortTier(0.5, undefined)).toBe("known");
    expect(comfortTier(0.49, undefined)).toBeNull();
    expect(comfortTier(0.2, personal(1, 0, 0))).toBeNull();
  });
  it("losing a lot (shrunk win rate < 42 % over 5+ games) drops pool to known", () => {
    expect(comfortTier(0.2, personal(1, 5, 0))).toBe("known"); // 2.5/10 = 25 %
    expect(comfortTier(0.2, personal(1, 5, 2))).toBe("pool"); // 4.5/10 = 45 %
    expect(comfortTier(0.2, personal(1, 4, 0))).toBe("pool"); // under 5 games: no verdict yet
    expect(comfortTier(0.9, personal(1, 10, 1))).toBe("known"); // 3.5/15 = 23 %
  });
});

describe("personalScore", () => {
  it("own win rate from 3 games on, 0.5 before", () => {
    const m = new Map([[1, personal(1, 3, 2)], [2, personal(2, 2, 2)]]);
    expect(personalScore(1, m)).toBeCloseTo(2 / 3, 10);
    expect(personalScore(2, m)).toBe(0.5);
    expect(personalScore(3, m)).toBe(0.5);
  });
});

describe("masteryScore", () => {
  const score = (m: ChampionMasteryDto) => masteryScore(m.championId, new Map([[m.championId, m]]));
  it("no mastery → 0.2", () => {
    expect(masteryScore(1, new Map())).toBe(0.2);
  });
  it("by level: 10 → 1, 7 → 0.85, 5 → 0.7, 3 → 0.55, below → 0.4", () => {
    expect(score(mastery(1, 10))).toBeCloseTo(1, 10);
    expect(score(mastery(1, 9))).toBeCloseTo(0.85, 10);
    expect(score(mastery(1, 7))).toBeCloseTo(0.85, 10);
    expect(score(mastery(1, 6))).toBeCloseTo(0.7, 10);
    expect(score(mastery(1, 5))).toBeCloseTo(0.7, 10);
    expect(score(mastery(1, 4))).toBeCloseTo(0.55, 10);
    expect(score(mastery(1, 3))).toBeCloseTo(0.55, 10);
    expect(score(mastery(1, 2))).toBeCloseTo(0.4, 10);
  });
  it("points bonus: 200k +0.1, 100k +0.05, capped at 1", () => {
    expect(score(mastery(1, 5, 200_000))).toBeCloseTo(0.8, 10);
    expect(score(mastery(1, 5, 199_999))).toBeCloseTo(0.75, 10);
    expect(score(mastery(1, 5, 100_000))).toBeCloseTo(0.75, 10);
    expect(score(mastery(1, 5, 99_999))).toBeCloseTo(0.7, 10);
    expect(score(mastery(1, 10, 500_000))).toBeCloseTo(1, 10);
  });
  it("fades toward 0.2 when the champion was last played long ago", () => {
    const longAgo = Date.now() - 100 * DAY; // 60 % still counts
    expect(score(mastery(1, 7, 0, longAgo))).toBeCloseTo(0.2 + 0.65 * 0.6, 6);
  });
});

describe("masteryRecency edges", () => {
  const now = 1_000 * DAY;
  it("full to 30 days, 85 % to 90, 60 % to a year, 40 % after", () => {
    expect(masteryRecency(now - 30 * DAY, now)).toBe(1);
    expect(masteryRecency(now - 30 * DAY - 1, now)).toBe(0.85);
    expect(masteryRecency(now - 90 * DAY, now)).toBe(0.85);
    expect(masteryRecency(now - 90 * DAY - 1, now)).toBe(0.6);
    expect(masteryRecency(now - 365 * DAY, now)).toBe(0.6);
    expect(masteryRecency(now - 365 * DAY - 1, now)).toBe(0.4);
    expect(masteryRecency(0, now)).toBe(1);
  });
});

describe("synergyScore", () => {
  const d = db([
    champ("1", "Engager", { archetypes: ["engage"] }),
    champ("2", "Burst", { archetypes: ["burst"] }),
    champ("3", "Both", { archetypes: ["burst", "sustain-dps"] }),
    champ("4", "Tank", { archetypes: ["frontline"] }),
  ]);
  it("no allies → 0.5; each complementary ally +0.1, counted once, capped at 0.85", () => {
    expect(synergyScore(d.champions["1"], [], d)).toBe(0.5);
    expect(synergyScore(d.champions["1"], ["2"], d)).toBeCloseTo(0.6, 10);
    expect(synergyScore(d.champions["2"], ["1"], d)).toBeCloseTo(0.6, 10); // either direction
    expect(synergyScore(d.champions["1"], ["3"], d)).toBeCloseTo(0.6, 10); // two pairs, one ally
    expect(synergyScore(d.champions["1"], ["2", "3"], d)).toBeCloseTo(0.7, 10);
    expect(synergyScore(d.champions["1"], ["4", "999"], d)).toBe(0.5);
    const many = db([champ("1", "E", { archetypes: ["engage"] }), ...[2, 3, 4, 5].map((i) => champ(String(i), `B${i}`, { archetypes: ["burst"] }))]);
    expect(synergyScore(many.champions["1"], ["2", "3", "4", "5"], many)).toBeCloseTo(0.85, 10);
  });
});

describe("metaScore / archetypeFitScore", () => {
  it("maps each grade, 0.5 without an entry for that lane or with an unknown grade", () => {
    const tiers: Array<[MetaTier["tier"], number]> = [["S+", 0.98], ["S", 0.95], ["A", 0.8], ["B", 0.6], ["C", 0.4], ["D", 0.2]];
    for (const [t, v] of tiers) expect(metaScore("1", "MIDDLE", db([], [meta("1", "MIDDLE", 0.1, t)])), t).toBe(v);
    expect(metaScore("1", "TOP", db([], [meta("1", "MIDDLE", 0.1, "S")]))).toBe(0.5);
    expect(metaScore("1", "MIDDLE", db([], [meta("1", "MIDDLE", 0.1, "Z" as MetaTier["tier"])]))).toBe(0.5);
  });
  it("fills a gap → 1, otherwise 0", () => {
    const c = champ("1", "Tank", { archetypes: ["frontline"] });
    expect(archetypeFitScore(c, new Set<Archetype>(["frontline", "peel"]))).toBe(1);
    expect(archetypeFitScore(c, new Set<Archetype>(["peel"]))).toBe(0);
    expect(archetypeFitScore(c, new Set<Archetype>())).toBe(0);
  });
});

describe("scoreChampion", () => {
  const RANKED = { context: 0.5, meta: 0.25 };
  const UNRANKED = { context: 0.6, meta: 0.15 };
  const c = champ("1", "Lux", { tags: ["Mage"] });

  function ctx(over: Partial<Parameters<typeof scoreChampion>[1]> = {}) {
    return {
      db: db([c], [meta("1", "MIDDLE", 0.1, "S")]),
      role: "MIDDLE" as Role,
      enemyKeys: [] as string[],
      allyKeys: [] as string[],
      missingArchetypes: new Set<Archetype>(),
      personalById: new Map<number, ChampionPersonalStat>(),
      masteryById: new Map<number, ChampionMasteryDto>(),
      weights: RANKED,
      counters: [] as CounterEntry[],
      laneOpponent: null,
      enemyComp: null,
      enemyArchetypes: new Map<Archetype, number>(),
      allyDamage: { magic: 0, physical: 0 },
      ...over,
    } as Parameters<typeof scoreChampion>[1];
  }

  it("neutral draft: context 0.425, fit 0.6, score 0.45 from draft + meta alone", () => {
    const s = scoreChampion(c, ctx());
    // context = .55·.5 (counter) + .2·.5 (comp) + .1·.5 (synergy) + .15·0 (gap)
    expect(s.breakdown.fit).toBeCloseTo((0.5 * 0.425 + 0.25 * 0.95) / 0.75, 10);
    expect(s.score).toBeCloseTo(0.5 * 0.425 + 0.25 * 0.95, 10);
    expect(s.breakdown.meta).toBe(0.95);
    expect(s.breakdown.counter).toBe(0.5);
    expect(s.breakdown.isComfort).toBe(false);
    expect(s.breakdown.hasEnemyData).toBe(false);
    expect(s.breakdown.hasAllyData).toBe(false);
    expect(s.reasons).toEqual(["suggestions.reason.strongMeta"]);
  });

  it("unranked leans on the draft: weights 0.6 / 0.15", () => {
    const s = scoreChampion(c, ctx({ weights: UNRANKED }));
    expect(s.score).toBeCloseTo(0.6 * 0.425 + 0.15 * 0.95, 10);
  });

  it("the lane matchup is stretched ×5 around 50 % and labelled at 52 / 48 %", () => {
    const good = scoreChampion(c, ctx({ enemyKeys: ["9"], laneOpponent: "9", counters: [counter("1", "9", 0.52)] }));
    expect(good.breakdown.counter).toBeCloseTo(0.52, 10);
    // edge 0.6 instead of 0.5 → context +0.055 → score +0.0275
    expect(good.score).toBeCloseTo(0.5 * (0.425 + 0.55 * 0.1) + 0.25 * 0.95, 10);
    expect(good.reasons).toContain("suggestions.reason.counters");
    expect(good.breakdown.hasEnemyData).toBe(true);

    const bad = scoreChampion(c, ctx({ enemyKeys: ["9"], counters: [counter("1", "9", 0.48)] }));
    expect(bad.reasons).toContain("suggestions.reason.hardMatchup");
    expect(bad.reasons).not.toContain("suggestions.reason.counters");

    const even = scoreChampion(c, ctx({ enemyKeys: ["9"], counters: [counter("1", "9", 0.5)] }));
    expect(even.reasons).not.toContain("suggestions.reason.hardMatchup");
    expect(even.reasons).not.toContain("suggestions.reason.counters");

    // Stretched edge is clamped: a 70 % lane is worth the same as 60 %.
    const huge = scoreChampion(c, ctx({ enemyKeys: ["9"], counters: [counter("1", "9", 0.7)] }));
    const top = scoreChampion(c, ctx({ enemyKeys: ["9"], counters: [counter("1", "9", 0.6)] }));
    expect(huge.score).toBeCloseTo(top.score, 10);
  });

  it("a pool champion gets +0.25, a known one +0.12, labelled", () => {
    const pool = scoreChampion(c, ctx({ personalById: new Map([[1, personal(1, 3, 3)]]) }));
    expect(pool.score).toBeCloseTo(0.45 + 0.25, 10);
    expect(pool.breakdown.isComfort).toBe(true);
    expect(pool.breakdown.isPerfectPick).toBe(true); // pool + S
    expect(pool.reasons.slice(0, 3)).toEqual([
      "suggestions.reason.perfectPick",
      "suggestions.reason.comfort",
      "WR 100%",
    ]);
    expect(pool.color).toBe("good");

    const known = scoreChampion(c, ctx({ personalById: new Map([[1, personal(1, 1, 1)]]) }));
    expect(known.score).toBeCloseTo(0.45 + 0.12, 10);
    expect(known.breakdown.isComfort).toBe(false);
    expect(known.color).toBe("meh");
  });

  it("perfect pick needs A or better; B is not enough", () => {
    const b = scoreChampion(c, ctx({
      db: db([c], [meta("1", "MIDDLE", 0.1, "B")]),
      personalById: new Map([[1, personal(1, 3, 3)]]),
    }));
    expect(b.breakdown.isPerfectPick).toBe(false);
    const a = scoreChampion(c, ctx({
      db: db([c], [meta("1", "MIDDLE", 0.1, "A")]),
      personalById: new Map([[1, personal(1, 3, 3)]]),
    }));
    expect(a.breakdown.isPerfectPick).toBe(true);
  });

  it("mastery labels: main at 0.95+, 'you know it' above 0.75", () => {
    const main = scoreChampion(c, ctx({ masteryById: new Map([[1, mastery(1, 10)]]) }));
    expect(main.reasons).toContain("suggestions.reason.main");
    expect(main.breakdown.masteryLevel).toBe(10);
    const knowIt = scoreChampion(c, ctx({ masteryById: new Map([[1, mastery(1, 7, 100_000)]]) }));
    expect(knowIt.reasons).toContain("suggestions.reason.youKnowIt");
    expect(knowIt.reasons).not.toContain("suggestions.reason.main");
  });

  it("answers the enemy comp, fills a gap, pairs with an ally", () => {
    const tank = champ("2", "Malphite", { tags: ["Tank"], archetypes: ["frontline", "engage"] });
    const ally = champ("3", "Jinx", { tags: ["Marksman"], archetypes: ["sustain-dps"] });
    const s = scoreChampion(tank, ctx({
      db: db([tank, ally], [meta("2", "MIDDLE", 0.1, "C")]),
      allyKeys: ["3"],
      missingArchetypes: new Set<Archetype>(["frontline"]),
      enemyArchetypes: new Map<Archetype, number>([["engage", 3]]),
    }));
    expect(s.reasons).toContain("suggestions.reason.answersComp"); // 0.65
    expect(s.reasons).toContain("suggestions.reason.fillsGap");
    expect(s.reasons).toContain("suggestions.reason.synergy"); // 0.6
    expect(s.reasons).not.toContain("suggestions.reason.strongMeta"); // C = 0.4
    expect(s.breakdown.archetype).toBe(1);
    expect(s.breakdown.synergy).toBeCloseTo(0.6, 10);
    expect(s.breakdown.hasAllyData).toBe(true);
  });

  it("a weak pick is coloured bad, and the score never passes 1", () => {
    const weak = scoreChampion(c, ctx({ db: db([c], [meta("1", "MIDDLE", 0.1, "D")]) }));
    expect(weak.score).toBeLessThan(0.45);
    expect(weak.color).toBe("bad");
    const stacked = scoreChampion(c, ctx({
      enemyKeys: ["9"],
      counters: [counter("1", "9", 0.7)],
      personalById: new Map([[1, personal(1, 10, 10)]]),
      db: db([c], [meta("1", "MIDDLE", 0.1, "S+")]),
    }));
    expect(stacked.score).toBeLessThanOrEqual(1);
  });

  it("uses the champion's first role when no lane is selected", () => {
    const top = champ("4", "Garen", { roles: ["TOP"] });
    const s = scoreChampion(top, ctx({ role: null, db: db([top], [meta("4", "TOP", 0.1, "A")]) }));
    expect(s.breakdown.meta).toBe(0.8);
  });
});
