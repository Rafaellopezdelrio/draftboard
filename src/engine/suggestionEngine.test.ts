import { describe, it, expect } from "vitest";
import { suggest, masteryRecency } from "./suggestionEngine";
import { useDraftStore } from "../state/draftStore";
import type { Champion, ChampionDb, MetaTier, Role } from "../types/champion";
import type { ChampionMasteryDto } from "../services/riotApi";
import type { ChampionPersonalStat } from "../services/matchRepo";

function champ(
  key: string,
  name: string,
  roles: Role[],
  opts: Partial<Champion> = {}
): Champion {
  return {
    id: name.replace(/\s/g, ""),
    key,
    name,
    title: "",
    iconUrl: "",
    splashUrl: "",
    tags: [],
    roles,
    archetypes: [],
    ...opts,
  };
}

function meta(
  championKey: string,
  role: Role,
  pickRate = 0.05,
  tier: MetaTier["tier"] = "B"
): MetaTier {
  return {
    championKey,
    role,
    tier,
    winRate: 0.51,
    pickRate,
    banRate: 0,
  };
}

const LEE_KEY = "64";
const ZED_KEY = "238";
const YASUO_KEY = "157";
const ORIANNA_KEY = "61";

function mkDb(metaEntries: MetaTier[] = []): ChampionDb {
  return {
    patch: "16.10",
    champions: {
      [LEE_KEY]: champ(LEE_KEY, "Lee Sin", ["TOP", "JUNGLE", "MIDDLE"]), // tag-inferred (loose)
      [ZED_KEY]: champ(ZED_KEY, "Zed", ["JUNGLE", "MIDDLE"]),
      [YASUO_KEY]: champ(YASUO_KEY, "Yasuo", ["MIDDLE", "BOTTOM"]),
      [ORIANNA_KEY]: champ(ORIANNA_KEY, "Orianna", ["MIDDLE", "UTILITY"]),
    },
    counters: [],
    meta: metaEntries,
    fetchedAt: Date.now(),
  };
}

function masteryEntry(
  championId: number,
  level = 10,
  points = 150000
): ChampionMasteryDto {
  return {
    championId,
    championLevel: level,
    championPoints: points,
    lastPlayTime: Date.now(),
  };
}

function personalEntry(
  championId: number,
  winRate = 0.55,
  games = 10
): ChampionPersonalStat {
  return {
    championId,
    games,
    wins: Math.round(games * winRate),
    winRate,
  };
}

describe("suggestionEngine", () => {
  it("regression: Zilean does NOT appear in MIDDLE (authoritative role map fix)", () => {
    // Zilean has "Mage" + "Support" Riot tags → old tag inference would put
    // him in MIDDLE + UTILITY. The CHAMPION_ROLES authoritative map says
    // UTILITY only.
    const db: ChampionDb = {
      patch: "16.10",
      champions: {
        "26": {
          id: "Zilean",
          key: "26",
          name: "Zilean",
          title: "",
          iconUrl: "",
          splashUrl: "",
          tags: ["Support", "Mage"],
          roles: ["MIDDLE", "UTILITY"], // loose tag inference (the bug source)
          archetypes: [],
        },
        [ZED_KEY]: champ(ZED_KEY, "Zed", ["MIDDLE"]),
      },
      counters: [],
      meta: [],
      fetchedAt: 0,
    };
    const result = suggest({
      db,
      role: "MIDDLE",
      allyKeys: [],
      enemyKeys: [],
      bannedKeys: [],
    });
    const keys = result.map((s) => s.champion.key);
    expect(keys).not.toContain("26"); // Zilean must NOT appear in mid
    expect(keys).toContain(ZED_KEY);
  });

  it("role filter (strict via meta data): Lee Sin one-trick does NOT appear in MIDDLE when meta says he's jungle-only", () => {
    // Meta data declares: Lee Sin only plays JUNGLE (no MIDDLE row)
    const db = mkDb([
      meta(LEE_KEY, "JUNGLE", 0.15),
      meta(ZED_KEY, "MIDDLE", 0.1),
      meta(YASUO_KEY, "MIDDLE", 0.1),
      meta(ORIANNA_KEY, "MIDDLE", 0.1),
    ]);
    const result = suggest({
      db,
      role: "MIDDLE",
      allyKeys: [],
      enemyKeys: [],
      bannedKeys: [],
      masteries: [masteryEntry(Number(LEE_KEY))], // mega Lee Sin main
    });
    const keys = result.map((s) => s.champion.key);
    expect(keys).not.toContain(LEE_KEY); // critical: Lee Sin must NOT be a mid suggestion
    expect(keys).toContain(ZED_KEY);
    expect(keys).toContain(YASUO_KEY);
  });

  it("role filter (no meta data): uses authoritative CHAMPION_ROLES map (Lee Sin = JUNGLE only)", () => {
    const db = mkDb([]); // no meta synced yet
    const result = suggest({
      db,
      role: "MIDDLE",
      allyKeys: [],
      enemyKeys: [],
      bannedKeys: [],
    });
    const keys = result.map((s) => s.champion.key);
    // CHAMPION_ROLES authoritative map says LeeSin is JUNGLE only.
    // Mid suggestions must NOT include him even without synced meta data.
    expect(keys).not.toContain(LEE_KEY);
  });

  it("low-playrate champions (under 0.3%) excluded from role suggestions", () => {
    const db = mkDb([
      meta(LEE_KEY, "MIDDLE", 0.001), // 0.1% pickrate — should be filtered
      meta(ZED_KEY, "MIDDLE", 0.1),
    ]);
    const result = suggest({
      db,
      role: "MIDDLE",
      allyKeys: [],
      enemyKeys: [],
      bannedKeys: [],
    });
    const keys = result.map((s) => s.champion.key);
    expect(keys).not.toContain(LEE_KEY);
    expect(keys).toContain(ZED_KEY);
  });

  it("excludes already picked/banned champions", () => {
    const db = mkDb([
      meta(ZED_KEY, "MIDDLE"),
      meta(YASUO_KEY, "MIDDLE"),
      meta(ORIANNA_KEY, "MIDDLE"),
    ]);
    const result = suggest({
      db,
      role: "MIDDLE",
      allyKeys: [ZED_KEY],
      enemyKeys: [YASUO_KEY],
      bannedKeys: [ORIANNA_KEY],
    });
    const keys = result.map((s) => s.champion.key);
    expect(keys).not.toContain(ZED_KEY);
    expect(keys).not.toContain(YASUO_KEY);
    expect(keys).not.toContain(ORIANNA_KEY);
  });

  it("mastery + main dominance bumps one-tricks above generic S-tier", () => {
    const db = mkDb([
      meta(ZED_KEY, "MIDDLE", 0.1, "S"), // S-tier meta
      meta(YASUO_KEY, "MIDDLE", 0.1, "B"),
    ]);
    const result = suggest({
      db,
      role: "MIDDLE",
      allyKeys: [],
      enemyKeys: [],
      bannedKeys: [],
      masteries: [masteryEntry(Number(YASUO_KEY), 11, 200000)], // Yasuo one-trick
      personalStats: [personalEntry(Number(YASUO_KEY), 0.6)],
    });
    // Yasuo one-trick (B-tier) should outrank generic S-tier Zed thanks to mastery + bonus
    expect(result[0].champion.key).toBe(YASUO_KEY);
  });

  it("an old main not played for months no longer outranks the champion played now", () => {
    // The owner's case: Lee Sin-style old main (max mastery, last played half a
    // year ago, 1 recent game) against the champion of most recent games.
    const DAY = 86_400_000;
    const db = mkDb([
      meta(ZED_KEY, "MIDDLE", 0.1, "A"),
      meta(YASUO_KEY, "MIDDLE", 0.1, "A"),
    ]);
    const oldMain = { ...masteryEntry(Number(YASUO_KEY), 11, 300000), lastPlayTime: Date.now() - 180 * DAY };
    const playedNow = { ...masteryEntry(Number(ZED_KEY), 6, 40000), lastPlayTime: Date.now() - 2 * DAY };
    const result = suggest({
      db,
      role: "MIDDLE",
      allyKeys: [],
      enemyKeys: [],
      bannedKeys: [],
      masteries: [oldMain, playedNow],
      personalStats: [personalEntry(Number(ZED_KEY), 0.57, 14), personalEntry(Number(YASUO_KEY), 1, 1)],
    });
    expect(result[0].champion.key).toBe(ZED_KEY);
    // The old main gets no "your main" / "perfect pick" label either.
    const yasuo = result.find((s) => s.champion.key === YASUO_KEY);
    expect(yasuo?.reasons).not.toContain("suggestions.reason.main");
    expect(yasuo?.reasons).not.toContain("suggestions.reason.perfectPick");
  });

  it("masteryRecency: full within 30 days, then 85% / 60% / 40%; no date counts in full", () => {
    const now = Date.UTC(2026, 10, 17);
    const ago = (d: number) => now - d * 86_400_000;
    expect([10, 31, 200, 400].map((d) => masteryRecency(ago(d), now))).toEqual([1, 0.85, 0.6, 0.4]);
    expect(masteryRecency(0, now)).toBe(1);
  });

  it("role=null returns top picks across all roles", () => {
    const db = mkDb([
      meta(ZED_KEY, "MIDDLE", 0.1, "S"),
      meta(YASUO_KEY, "MIDDLE", 0.1),
      meta(LEE_KEY, "JUNGLE", 0.1),
    ]);
    const result = suggest({
      db,
      role: null,
      allyKeys: [],
      enemyKeys: [],
      bannedKeys: [],
    });
    expect(result.length).toBeGreaterThan(0);
    // No champions filtered by role
    const keys = result.map((s) => s.champion.key);
    expect(keys).toContain(LEE_KEY);
  });

  it("limit parameter respected", () => {
    const db = mkDb([
      meta(ZED_KEY, "MIDDLE"),
      meta(YASUO_KEY, "MIDDLE"),
      meta(ORIANNA_KEY, "MIDDLE"),
    ]);
    const result = suggest({
      db,
      role: "MIDDLE",
      allyKeys: [],
      enemyKeys: [],
      bannedKeys: [],
      limit: 2,
    });
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("reasons include 'tu main' for very high mastery", () => {
    const db = mkDb([meta(YASUO_KEY, "MIDDLE")]);
    const result = suggest({
      db,
      role: "MIDDLE",
      allyKeys: [],
      enemyKeys: [],
      bannedKeys: [],
      masteries: [masteryEntry(Number(YASUO_KEY), 11, 250000)],
    });
    const yasuo = result.find((s) => s.champion.key === YASUO_KEY);
    expect(yasuo).toBeDefined();
    expect(yasuo!.reasons).toContain("suggestions.reason.main");
  });

  it("liveCounters feed the counter dimension (broad op.gg data, not flat 0.5)", () => {
    // Without any counter data the counter dimension is a flat 0.5. A live
    // op.gg counter saying Orianna beats the enemy Zed should lift Orianna's
    // counter score and surface the "contrarresta a enemigos" reason.
    const db = mkDb([meta(ORIANNA_KEY, "MIDDLE")]);
    const result = suggest({
      db,
      role: "MIDDLE",
      allyKeys: [],
      enemyKeys: [ZED_KEY],
      bannedKeys: [],
      liveCounters: [
        {
          championKey: ORIANNA_KEY,
          vsChampionKey: ZED_KEY,
          role: "MIDDLE",
          winRate: 0.66,
          sampleSize: 1200,
        },
      ],
    });
    const ori = result.find((s) => s.champion.key === ORIANNA_KEY);
    expect(ori).toBeDefined();
    expect(ori!.breakdown.counter).toBeCloseTo(0.66, 5);
    expect(ori!.reasons).toContain("suggestions.reason.counters");
  });

  it("liveCounters take priority over sparse personal db.counters for the same pair", () => {
    const db = mkDb([meta(ORIANNA_KEY, "MIDDLE")]);
    // Personal data says Orianna loses to Zed (small sample); live op.gg says
    // she wins. Live must win the tie.
    db.counters = [
      {
        championKey: ORIANNA_KEY,
        vsChampionKey: ZED_KEY,
        role: "MIDDLE",
        winRate: 0.3,
        sampleSize: 4,
      },
    ];
    const result = suggest({
      db,
      role: "MIDDLE",
      allyKeys: [],
      enemyKeys: [ZED_KEY],
      bannedKeys: [],
      liveCounters: [
        {
          championKey: ORIANNA_KEY,
          vsChampionKey: ZED_KEY,
          role: "MIDDLE",
          winRate: 0.62,
          sampleSize: 1500,
        },
      ],
    });
    const ori = result.find((s) => s.champion.key === ORIANNA_KEY);
    expect(ori!.breakdown.counter).toBeCloseTo(0.62, 5);
  });

  it("liveCounters REORDER suggestions (same pair flips on which one is countered)", () => {
    // The headline counter-pick promise: as enemies lock in, suggestions move.
    // Orianna and Yasuo are identical MIDDLE candidates (same tier, no ally /
    // mastery / personal signal), so the counter dimension is the ONLY thing
    // that can separate them. Run the SAME draft twice, moving a strong op.gg
    // counter from one to the other: the ranked order must flip. Symmetric =
    // weight- and fixture-order-independent (no reliance on tie-break order).
    const db = mkDb([meta(ORIANNA_KEY, "MIDDLE"), meta(YASUO_KEY, "MIDDLE")]);
    const base = {
      db,
      role: "MIDDLE" as Role,
      allyKeys: [] as string[],
      enemyKeys: [ZED_KEY],
      bannedKeys: [] as string[],
    };
    const counterFor = (key: string) => ({
      championKey: key,
      vsChampionKey: ZED_KEY,
      role: "MIDDLE" as Role,
      winRate: 0.7,
      sampleSize: 1000,
    });
    const rank = (res: ReturnType<typeof suggest>, key: string) =>
      res.findIndex((s) => s.champion.key === key);

    const oriFav = suggest({ ...base, liveCounters: [counterFor(ORIANNA_KEY)] });
    expect(rank(oriFav, ORIANNA_KEY)).toBeLessThan(rank(oriFav, YASUO_KEY));

    const yasFav = suggest({ ...base, liveCounters: [counterFor(YASUO_KEY)] });
    expect(rank(yasFav, YASUO_KEY)).toBeLessThan(rank(yasFav, ORIANNA_KEY));
  });

  it("synergy rewards a complementary pick over a redundant one", () => {
    // Ally is a sustain-dps carry. An engage/frontline pick complements it
    // (engage→dps, frontline→dps); another sustain-dps is redundant.
    const db: ChampionDb = {
      patch: "16.10",
      champions: {
        "1": champ("1", "Engager", ["MIDDLE"], { archetypes: ["frontline", "engage"] }),
        "2": champ("2", "Carry", ["MIDDLE"], { archetypes: ["sustain-dps"] }),
        "3": champ("3", "Redundant", ["MIDDLE"], { archetypes: ["sustain-dps"] }),
      },
      counters: [],
      meta: [],
      fetchedAt: 0,
    };
    const result = suggest({
      db,
      role: "MIDDLE",
      allyKeys: ["2"], // the sustain-dps carry, already picked
      enemyKeys: [],
      bannedKeys: [],
    });
    const engager = result.find((s) => s.champion.key === "1");
    const redundant = result.find((s) => s.champion.key === "3");
    expect(engager!.breakdown.synergy).toBeGreaterThan(redundant!.breakdown.synergy);
  });

  it("flags a hard matchup in the reasons (best-overall ≠ best-matchup coherence)", () => {
    const db = mkDb([meta(ORIANNA_KEY, "MIDDLE")]);
    const result = suggest({
      db,
      role: "MIDDLE",
      allyKeys: [],
      enemyKeys: [ZED_KEY],
      bannedKeys: [],
      liveCounters: [
        {
          championKey: ORIANNA_KEY,
          vsChampionKey: ZED_KEY,
          role: "MIDDLE",
          winRate: 0.35, // op.gg says Orianna loses this lane
          sampleSize: 1000,
        },
      ],
    });
    const ori = result.find((s) => s.champion.key === ORIANNA_KEY);
    expect(ori!.breakdown.counter).toBeLessThan(0.45);
    expect(ori!.reasons).toContain("suggestions.reason.hardMatchup");
  });
});

// Regression: the LCU sync writes the local player's own hover/lock into
// their ally slot, so it arrived in allyKeys and the engine dropped it from
// the candidates and scored it as a teammate.
describe("suggestionEngine — own hovered champion", () => {
  const params = {
    role: "MIDDLE" as Role,
    enemyKeys: [],
    bannedKeys: [],
  };
  const db = mkDb([meta(ZED_KEY, "MIDDLE", 0.1), meta(ORIANNA_KEY, "MIDDLE", 0.1)]);

  it("keeps selfKey as a candidate and does not count it as an ally", () => {
    const out = suggest({ ...params, db, allyKeys: [ZED_KEY], selfKey: ZED_KEY });
    const zed = out.find((s) => s.champion.key === ZED_KEY);
    expect(zed).toBeDefined();
    expect(zed!.breakdown.hasAllyData).toBe(false);
    expect(out).toEqual(suggest({ ...params, db, allyKeys: [], selfKey: null }));
  });

  it("defaults selfKey to the draft store's own selection", () => {
    useDraftStore.getState().setLocalSelection(0, ZED_KEY, null);
    try {
      const keys = suggest({ ...params, db, allyKeys: [ZED_KEY] }).map((s) => s.champion.key);
      expect(keys).toContain(ZED_KEY);
    } finally {
      useDraftStore.getState().setLocalSelection(null, null, null);
    }
  });

  // This is what the draft logger's followedSuggestion relies on: at lock-in
  // the pick sits in the ally slot and must still be ranked.
  it("still ranks the champion once it is locked", () => {
    useDraftStore.getState().setLocalSelection(0, ZED_KEY, ZED_KEY);
    try {
      const keys = suggest({ ...params, db, allyKeys: [ZED_KEY] }).map((s) => s.champion.key);
      expect(keys).toContain(ZED_KEY);
    } finally {
      useDraftStore.getState().setLocalSelection(null, null, null);
    }
  });

  it("still excludes real teammates' picks", () => {
    const keys = suggest({ ...params, db, allyKeys: [ZED_KEY], selfKey: ORIANNA_KEY }).map(
      (s) => s.champion.key
    );
    expect(keys).not.toContain(ZED_KEY);
  });
});

describe("suggestionEngine — your champions filter, the game decides", () => {
  // Real DDragon ids so the curated role map applies.
  const K = { zed: "238", yasuo: "157", ori: "61", syndra: "134", malph: "54", leona: "89", j4: "59", lulu: "117", darius: "122", jinx: "222", garen: "86" };
  function db(): ChampionDb {
    return {
      patch: "16.22",
      champions: {
        [K.zed]: champ(K.zed, "Zed", ["MIDDLE"], { tags: ["Assassin"], archetypes: ["burst", "pick"] }),
        [K.yasuo]: champ(K.yasuo, "Yasuo", ["MIDDLE"], { tags: ["Fighter", "Assassin"], archetypes: ["sustain-dps"] }),
        [K.ori]: champ(K.ori, "Orianna", ["MIDDLE"], { tags: ["Mage", "Support"], archetypes: ["peel", "wave-clear"] }),
        [K.syndra]: champ(K.syndra, "Syndra", ["MIDDLE"], { tags: ["Mage"], archetypes: ["burst"] }),
        [K.malph]: champ(K.malph, "Malphite", ["TOP"], { tags: ["Tank"], archetypes: ["engage", "frontline"] }),
        [K.leona]: champ(K.leona, "Leona", ["UTILITY"], { tags: ["Tank", "Support"], archetypes: ["engage", "frontline"] }),
        [K.j4]: champ(K.j4, "Jarvan IV", ["JUNGLE"], { tags: ["Tank", "Fighter"], archetypes: ["engage"] }),
        [K.lulu]: champ(K.lulu, "Lulu", ["UTILITY"], { tags: ["Support", "Mage"], archetypes: ["peel"] }),
        [K.darius]: champ(K.darius, "Darius", ["TOP"], { tags: ["Fighter", "Tank"], archetypes: ["frontline"] }),
        [K.jinx]: champ(K.jinx, "Jinx", ["BOTTOM"], { tags: ["Marksman"], archetypes: ["sustain-dps"] }),
        [K.garen]: champ(K.garen, "Garen", ["TOP"], { tags: ["Fighter", "Tank"], archetypes: ["frontline"] }),
      },
      counters: [],
      meta: [meta(K.zed, "MIDDLE", 0.08, "A"), meta(K.yasuo, "MIDDLE", 0.08, "A"), meta(K.ori, "MIDDLE", 0.05, "A")],
      fetchedAt: Date.now(),
    };
  }
  const vs = (key: string, enemy: string, winRate: number) => ({ championKey: key, vsChampionKey: enemy, role: "MIDDLE" as Role, winRate, sampleSize: 2000 });
  const base = { role: "MIDDLE" as Role, bannedKeys: [], selfKey: null, rankTier: "GOLD" };

  it("inside your pool the lane matchup decides, not the most played champion", () => {
    const result = suggest({
      ...base,
      db: db(),
      allyKeys: [],
      enemyKeys: [K.syndra],
      personalStats: [personalEntry(Number(K.zed), 0.55, 40), personalEntry(Number(K.yasuo), 0.5, 4)],
      liveCounters: [vs(K.zed, K.syndra, 0.45), vs(K.yasuo, K.syndra, 0.54)],
    });
    expect(result[0].champion.key).toBe(K.yasuo);
    expect(result[0].breakdown.isComfort).toBe(true);
    expect(result.find((s) => s.champion.key === K.zed)?.reasons).toContain("suggestions.reason.hardMatchup");
  });

  it("a champion you don't play needs a clearly better game, and then shows as best for this game", () => {
    const clear = suggest({
      ...base,
      db: { ...db(), meta: [meta(K.zed, "MIDDLE", 0.08, "B"), meta(K.ori, "MIDDLE", 0.08, "S")] },
      allyKeys: [],
      enemyKeys: [K.syndra],
      personalStats: [personalEntry(Number(K.zed), 0.55, 20)],
      liveCounters: [vs(K.zed, K.syndra, 0.5), vs(K.ori, K.syndra, 0.56)],
    });
    expect(clear[0].champion.key).toBe(K.zed); // still yours first
    const ori = clear.find((s) => s.champion.key === K.ori);
    expect(ori?.reasons[0]).toBe("suggestions.reason.bestForDraft");

    const close = suggest({
      ...base,
      db: db(),
      allyKeys: [],
      enemyKeys: [K.syndra],
      personalStats: [personalEntry(Number(K.zed), 0.55, 20)],
      liveCounters: [vs(K.zed, K.syndra, 0.5), vs(K.ori, K.syndra, 0.51)],
    });
    expect(close.flatMap((s) => s.reasons)).not.toContain("suggestions.reason.bestForDraft");
  });

  it("no best-for-this-game label before the enemy has picked", () => {
    const result = suggest({ ...base, db: db(), allyKeys: [], enemyKeys: [], personalStats: [personalEntry(Number(K.zed), 0.55, 20)] });
    expect(result.flatMap((s) => s.reasons)).not.toContain("suggestions.reason.bestForDraft");
  });

  it("answers a team that dives: peel beats an equal pick that doesn't", () => {
    const result = suggest({
      ...base,
      db: db(),
      allyKeys: [],
      enemyKeys: [K.malph, K.leona, K.j4, K.darius],
      personalStats: [personalEntry(Number(K.zed), 0.55, 10), personalEntry(Number(K.ori), 0.55, 10)],
    });
    expect(result[0].champion.key).toBe(K.ori);
    expect(result[0].reasons).toContain("suggestions.reason.answersComp");
  });

  it("balances your team's damage: with three physical allies a magic pick beats a physical one", () => {
    const result = suggest({
      ...base,
      db: db(),
      allyKeys: [K.darius, K.jinx, K.garen],
      enemyKeys: [],
      personalStats: [personalEntry(Number(K.zed), 0.55, 10), personalEntry(Number(K.ori), 0.55, 10)],
    });
    const order = result.map((s) => s.champion.key);
    expect(order.indexOf(K.ori)).toBeLessThan(order.indexOf(K.zed));
  });

  it("3 games in your role make a champion yours; fewer only 'known'", () => {
    const run = (games: number) =>
      suggest({ ...base, db: db(), allyKeys: [], enemyKeys: [], personalStats: [personalEntry(Number(K.yasuo), 0.6, games)] }).find(
        (s) => s.champion.key === K.yasuo
      )?.breakdown.isComfort;
    expect(run(3)).toBe(true);
    expect(run(2)).toBe(false);
  });

  it("keeps losing on a champion: 5+ games well under 50% stops counting it as yours", () => {
    const r = suggest({ ...base, db: db(), allyKeys: [], enemyKeys: [], personalStats: [personalEntry(Number(K.yasuo), 0.2, 10)] });
    expect(r.find((s) => s.champion.key === K.yasuo)?.breakdown.isComfort).toBe(false);
  });
});
