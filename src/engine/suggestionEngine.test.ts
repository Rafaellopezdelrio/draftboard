import { describe, it, expect } from "vitest";
import { suggest } from "./suggestionEngine";
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
    expect(yasuo!.reasons.some((r) => r.includes("tu main"))).toBe(true);
  });

  it("liveCounters feed the counter dimension (broad op.gg data, not flat 0.5)", () => {
    // Without any counter data the counter dimension is a flat 0.5. A live
    // op.gg counter saying Orianna beats the enemy Zed should lift Orianna's
    // counter score and surface the "countra a enemigos" reason.
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
    expect(ori!.reasons.some((r) => r.includes("countra"))).toBe(true);
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
});
