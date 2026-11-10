import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  MatchFull,
  MatchParticipant,
  MatchTimeline,
  RiotConfig,
  TimelineEvent,
} from "./riotApi";

// DB layer: isTauri() toggles the no-op branch; execute() records every SQL
// statement so we can rebuild the rows written per table.
const executeMock = vi.fn();
let tauri = true;
vi.mock("../db/client", () => ({
  isTauri: () => tauri,
  getDb: async () => ({ execute: executeMock }),
}));

const getMasterLeagueMock = vi.fn();
const getPuuidMock = vi.fn();
const getRecentMatchIdsMock = vi.fn();
const getMatchFullMock = vi.fn();
const getMatchTimelineMock = vi.fn();
vi.mock("./riotApi", () => ({
  getMasterLeague: (...a: unknown[]) => getMasterLeagueMock(...a),
  getPuuidBySummonerId: (...a: unknown[]) => getPuuidMock(...a),
  getRecentMatchIds: (...a: unknown[]) => getRecentMatchIdsMock(...a),
  getMatchFull: (...a: unknown[]) => getMatchFullMock(...a),
  getMatchTimeline: (...a: unknown[]) => getMatchTimelineMock(...a),
}));

import {
  aggregateFromMaster,
  aggregateMultiRegion,
  computeMaxOrder,
  type AggregateProgress,
} from "./metaAggregator";

const NOW = 1_760_000_000_000;
const PATCH = "16.1";
const CFG: RiotConfig = {
  apiKey: "RGAPI-test",
  region: "euw1",
  riotIdName: "Tester",
  riotIdTag: "EUW",
};

function part(
  o: Pick<MatchParticipant, "participantId" | "championId" | "teamId" | "position" | "win"> &
    Partial<MatchParticipant>
): MatchParticipant {
  return {
    puuid: `puuid-${o.participantId}`,
    kills: 0,
    deaths: 0,
    assists: 0,
    cs: 0,
    goldEarned: 0,
    totalDamageDealtToChampions: 0,
    magicDamageDealtToChampions: 0,
    physicalDamageDealtToChampions: 0,
    totalDamageTaken: 0,
    damageDealtToObjectives: 0,
    visionScore: 0,
    wardsPlaced: 0,
    wardsKilled: 0,
    controlWardsBought: 0,
    champLevel: 18,
    items: [],
    summoner1Id: 4,
    summoner2Id: 14,
    perks: undefined,
    ...o,
  };
}

function full(matchId: string, queueId: number, participants: MatchParticipant[]): MatchFull {
  return { matchId, durationSec: 1800, endTsMs: NOW, queueId, participants, teams: [] };
}

function skillUps(pid: number, slots: number[]): TimelineEvent[] {
  return slots.map((skillSlot, i) => ({
    type: "SKILL_LEVEL_UP",
    timestamp: i * 1000,
    participantId: pid,
    skillSlot,
    levelUpType: "NORMAL",
  }));
}

function timeline(matchId: string, frames: TimelineEvent[][]): MatchTimeline {
  return {
    matchId,
    participantToPuuid: {},
    frames: frames.map((events, i) => ({ timestamp: i * 60_000, events, participantFrames: {} })),
  };
}

const AHRI_RUNES = {
  statPerks: { offense: 5008, flex: 5008, defense: 5002 },
  styles: [
    {
      style: 8100,
      description: "primaryStyle",
      selections: [{ perk: 8112 }, { perk: 8139 }, { perk: 8138 }, { perk: 8135 }],
    },
    { style: 8200, description: "subStyle", selections: [{ perk: 8226 }, { perk: 8210 }] },
  ],
};
// No statPerks → shards column must be "".
const ZED_RUNES = {
  styles: [
    { style: 8000, description: "primaryStyle", selections: [{ perk: 8010 }] },
    { style: 8100, description: "subStyle", selections: [{ perk: 8143 }] },
  ],
};
// Missing subStyle → rune page is skipped entirely.
const PRIMARY_ONLY = {
  styles: [{ style: 8400, description: "primaryStyle", selections: [{ perk: 8437 }] }],
};

const AHRI = 103;
const ZED = 238;
const GAREN = 86;
const DARIUS = 122;
const SETT = 875;

// Ahri levels E,Q,W first, then maxes Q > W > E.
const AHRI_SKILLS = [3, 1, 2, 1, 4, 1, 1, 2, 2];

function matchFixtures(): Record<string, { full: MatchFull; tl: MatchTimeline }> {
  return {
    // Team 100 wins.
    M1: {
      full: full("M1", 420, [
        part({ participantId: 1, championId: AHRI, teamId: 100, position: "MIDDLE", win: true, items: [3089, 0, 6655, 3020], perks: AHRI_RUNES }),
        part({ participantId: 2, championId: GAREN, teamId: 100, position: "TOP", win: true, items: [0, 0, 0, 0, 0, 0] }),
        part({ participantId: 6, championId: ZED, teamId: 200, position: "MIDDLE", win: false, items: [3142], perks: ZED_RUNES }),
        part({ participantId: 7, championId: DARIUS, teamId: 200, position: "TOP", win: false, perks: PRIMARY_ONLY }),
      ]),
      // Ahri's level-ups are split across two frames; Zed only has 2 (< 3 → ignored).
      // The item event comes first so a missing type filter would shift Ahri's first three.
      tl: timeline("M1", [
        [{ type: "ITEM_PURCHASED", timestamp: 1, participantId: 1, itemId: 1056 }, ...skillUps(1, AHRI_SKILLS.slice(0, 4))],
        [...skillUps(1, AHRI_SKILLS.slice(4)), ...skillUps(6, [1, 3])],
      ]),
    },
    // Team 100 wins again; Ahri buys the same final items in a different slot order.
    M2: {
      full: full("M2", 420, [
        part({ participantId: 1, championId: AHRI, teamId: 100, position: "MIDDLE", win: true, items: [6655, 3020, 3089], perks: AHRI_RUNES }),
        part({ participantId: 2, championId: GAREN, teamId: 100, position: "TOP", win: true }),
        part({ participantId: 6, championId: ZED, teamId: 200, position: "MIDDLE", win: false, items: [3142], perks: ZED_RUNES }),
        part({ participantId: 7, championId: DARIUS, teamId: 200, position: "TOP", win: false }),
      ]),
      tl: timeline("M2", [skillUps(1, AHRI_SKILLS)]),
    },
    // Team 200 wins; Darius is replaced by Sett so the top matchups stay < 3 games.
    M3: {
      full: full("M3", 420, [
        part({ participantId: 1, championId: AHRI, teamId: 100, position: "MIDDLE", win: false, items: [3157, 4645], perks: AHRI_RUNES }),
        part({ participantId: 2, championId: GAREN, teamId: 100, position: "TOP", win: false }),
        part({ participantId: 6, championId: ZED, teamId: 200, position: "MIDDLE", win: true, items: [3142], perks: ZED_RUNES }),
        part({ participantId: 7, championId: SETT, teamId: 200, position: "TOP", win: true, perks: AHRI_RUNES }),
      ]),
      tl: timeline("M3", [skillUps(1, [1, 2, 3, 1, 1])]),
    },
    // ARAM — must be dropped by the queueId === 420 filter.
    M4: {
      full: full("M4", 450, [
        part({ participantId: 1, championId: AHRI, teamId: 100, position: "MIDDLE", win: true }),
      ]),
      tl: timeline("M4", []),
    },
  };
}

/** Rebuild the rows inserted into `table` from the recorded multi-row INSERTs. */
function insertedRows(table: string, columnCount: number): unknown[][] {
  const params = executeMock.mock.calls
    .filter(([sql]) => String(sql).startsWith(`INSERT INTO ${table} (`))
    .flatMap(([, p]) => p as unknown[]);
  const rows: unknown[][] = [];
  for (let i = 0; i < params.length; i += columnCount) rows.push(params.slice(i, i + columnCount));
  return rows;
}

function statementKinds(): string[] {
  return executeMock.mock.calls.map(([sql]) => {
    const m = /^\s*(DELETE FROM|INSERT INTO) (\w+)/.exec(String(sql));
    return m ? `${m[1]} ${m[2]}` : String(sql);
  });
}

beforeEach(() => {
  tauri = true;
  executeMock.mockReset().mockResolvedValue({ rowsAffected: 0 });
  getMasterLeagueMock.mockReset();
  getPuuidMock.mockReset();
  getRecentMatchIdsMock.mockReset();
  getMatchFullMock.mockReset();
  getMatchTimelineMock.mockReset();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("aggregateFromMaster", () => {
  it("is a no-op outside Tauri", async () => {
    tauri = false;
    const onProgress = vi.fn();
    await aggregateFromMaster(CFG, PATCH, onProgress);
    expect(getMasterLeagueMock).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  describe("full pipeline", () => {
    let progress: AggregateProgress[];

    beforeEach(async () => {
      const fixtures = matchFixtures();
      getMasterLeagueMock.mockResolvedValue({
        tier: "MASTER",
        entries: ["s1", "s2", "s3", "s4"].map((summonerId) => ({ summonerId })),
      });
      getPuuidMock.mockImplementation(async (_cfg: RiotConfig, sid: string) => {
        if (sid === "s2") throw new Error("404");
        return `puuid-${sid}`;
      });
      getRecentMatchIdsMock.mockImplementation(async (_cfg: RiotConfig, puuid: string) => {
        if (puuid === "puuid-s1") return ["M1", "M2", "M4"];
        if (puuid === "puuid-s3") return ["M2", "M3", "M5"]; // M2 duplicated, M5 broken
        throw new Error("429");
      });
      getMatchFullMock.mockImplementation(async (_cfg: RiotConfig, id: string) => {
        if (!fixtures[id]) throw new Error("500");
        return fixtures[id].full;
      });
      getMatchTimelineMock.mockImplementation(async (_cfg: RiotConfig, id: string) => {
        if (!fixtures[id]) throw new Error("500");
        return fixtures[id].tl;
      });
      progress = [];
      await aggregateFromMaster(CFG, PATCH, (p) => progress.push(p));
    });

    it("skips failed lookups, dedupes match ids and asks for 10 matches per account", () => {
      expect(getPuuidMock).toHaveBeenCalledTimes(4);
      // s2 failed to resolve → only 3 accounts listed.
      expect(getRecentMatchIdsMock.mock.calls.map((c) => [c[1], c[2]])).toEqual([
        ["puuid-s1", 10],
        ["puuid-s3", 10],
        ["puuid-s4", 10],
      ]);
      expect(getMatchFullMock.mock.calls.map((c) => c[1])).toEqual(["M1", "M2", "M4", "M3", "M5"]);
    });

    it("reports progress per phase in Spanish, ending with Listo", () => {
      expect(progress[0]).toEqual({ phase: "Listando Master league", done: 0, total: 1 });
      expect(progress).toContainEqual({ phase: "Resolviendo cuentas", done: 4, total: 4 });
      expect(progress).toContainEqual({ phase: "Listando partidas", done: 3, total: 3 });
      expect(progress).toContainEqual({ phase: "Descargando partidas", done: 5, total: 5 });
      // M4 (ARAM) filtered and M5 failed → 3 ranked matches aggregated.
      expect(progress).toContainEqual({ phase: "Agregando", done: 0, total: 3 });
      expect(progress[progress.length - 1]).toEqual({ phase: "Listo", done: 1, total: 1 });
    });

    it("clears each table for the patch before inserting, then stamps last_run", () => {
      expect(statementKinds()).toEqual([
        "DELETE FROM meta_aggregate",
        "INSERT INTO meta_aggregate",
        "DELETE FROM counter_aggregate",
        "INSERT INTO counter_aggregate",
        "DELETE FROM build_aggregate",
        "INSERT INTO build_aggregate",
        "DELETE FROM rune_aggregate",
        "INSERT INTO rune_aggregate",
        "DELETE FROM skill_order_aggregate",
        "INSERT INTO skill_order_aggregate",
        "INSERT INTO aggregation_meta",
      ]);
      const deletes = executeMock.mock.calls.filter(([sql]) => String(sql).startsWith("DELETE"));
      for (const [, params] of deletes) expect(params).toEqual([PATCH]);
      expect(executeMock.mock.calls[executeMock.mock.calls.length - 1][1]).toEqual([String(NOW)]);
    });

    it("writes win and pick rates per champion+role over ranked games only", () => {
      const rows = insertedRows("meta_aggregate", 9);
      const byKey = new Map(rows.map((r) => [`${r[0]}|${r[1]}`, r]));
      expect(rows).toHaveLength(5);
      expect(byKey.get(`${AHRI}|MIDDLE`)).toEqual([AHRI, "MIDDLE", 3, 2, 2 / 3, 1, 0, PATCH, NOW]);
      expect(byKey.get(`${ZED}|MIDDLE`)).toEqual([ZED, "MIDDLE", 3, 1, 1 / 3, 1, 0, PATCH, NOW]);
      expect(byKey.get(`${DARIUS}|TOP`)).toEqual([DARIUS, "TOP", 2, 0, 0, 2 / 3, 0, PATCH, NOW]);
      expect(byKey.get(`${SETT}|TOP`)).toEqual([SETT, "TOP", 1, 1, 1, 1 / 3, 0, PATCH, NOW]);
    });

    it("keeps only same-role matchups with at least 3 games", () => {
      expect(insertedRows("counter_aggregate", 8)).toEqual([
        [AHRI, ZED, "MIDDLE", 3, 2, 2 / 3, PATCH, NOW],
        [ZED, AHRI, "MIDDLE", 3, 1, 1 / 3, PATCH, NOW],
      ]);
    });

    it("groups builds by the sorted non-empty item set and drops singletons", () => {
      expect(insertedRows("build_aggregate", 7)).toEqual([
        [AHRI, "MIDDLE", "3020,3089,6655", 2, 2, PATCH, NOW],
        [ZED, "MIDDLE", "3142", 3, 1, PATCH, NOW],
      ]);
    });

    it("records full rune pages (primary + sub + shards) seen at least twice", () => {
      expect(insertedRows("rune_aggregate", 10)).toEqual([
        [AHRI, "MIDDLE", 8100, 8200, "8112,8139,8138,8135,8226,8210", "5008,5008,5002", 3, 2, PATCH, NOW],
        [ZED, "MIDDLE", 8000, 8100, "8010,8143", "", 3, 1, PATCH, NOW],
      ]);
    });

    it("derives first-three and max order from SKILL_LEVEL_UP timeline events", () => {
      // first3 = E,Q,W ("312"); counts Q=4, W=3, E=1 → max order "123".
      expect(insertedRows("skill_order_aggregate", 8)).toEqual([
        [AHRI, "MIDDLE", "312", "123", 2, 2, PATCH, NOW],
      ]);
    });
  });

  it("caps the sample at 150 Master accounts and keeps the stored data when nothing resolves", async () => {
    getMasterLeagueMock.mockResolvedValue({
      tier: "MASTER",
      entries: Array.from({ length: 160 }, (_, i) => ({ summonerId: `s${i}` })),
    });
    getPuuidMock.mockRejectedValue(new Error("403"));
    const progress: AggregateProgress[] = [];

    // Zero matches must fail the run: no DELETE, no last_run stamp.
    await expect(aggregateFromMaster(CFG, PATCH, (p) => progress.push(p))).rejects.toThrow();

    expect(getPuuidMock).toHaveBeenCalledTimes(150);
    expect(getRecentMatchIdsMock).not.toHaveBeenCalled();
    expect(getMatchFullMock).not.toHaveBeenCalled();
    expect(progress).toContainEqual({ phase: "Resolviendo cuentas", done: 150, total: 150 });
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("uses the puuid a league entry already carries instead of the summonerId lookup", async () => {
    const fixtures = matchFixtures();
    getMasterLeagueMock.mockResolvedValue({ tier: "MASTER", entries: [{ puuid: "p-direct" }] });
    getRecentMatchIdsMock.mockResolvedValue(["M1"]);
    getMatchFullMock.mockResolvedValue(fixtures.M1.full);
    getMatchTimelineMock.mockResolvedValue(fixtures.M1.tl);

    await aggregateFromMaster(CFG, PATCH, () => {});

    expect(getPuuidMock).not.toHaveBeenCalled();
    expect(getRecentMatchIdsMock).toHaveBeenCalledWith(CFG, "p-direct", 10);
    expect(insertedRows("meta_aggregate", 9)).toHaveLength(4);
  });

  it("ignores EVOLVE level-ups when deriving the max order", async () => {
    const evolve = (slot: number): TimelineEvent => ({
      type: "SKILL_LEVEL_UP",
      timestamp: 99,
      participantId: 1,
      skillSlot: slot,
      levelUpType: "EVOLVE",
    });
    getMasterLeagueMock.mockResolvedValue({ tier: "MASTER", entries: [{ summonerId: "s1" }] });
    getPuuidMock.mockResolvedValue("p1");
    // Two games: skill rows need at least 2 to be stored.
    getRecentMatchIdsMock.mockResolvedValue(["K1", "K2"]);
    getMatchFullMock.mockResolvedValue(
      full("K1", 420, [part({ participantId: 1, championId: 121, teamId: 100, position: "JUNGLE", win: true })])
    );
    // Real ranks: E2 Q1 W1 → "312". Counting the three W evolves would give "231".
    getMatchTimelineMock.mockResolvedValue(
      timeline("K1", [[...skillUps(1, [1, 3, 2, 3]), evolve(2), evolve(2), evolve(2)]])
    );

    await aggregateFromMaster(CFG, PATCH, () => {});

    expect(insertedRows("skill_order_aggregate", 8)).toEqual([
      [121, "JUNGLE", "132", "312", 2, 2, PATCH, NOW],
    ]);
  });

  it("propagates a Master league failure without touching the DB", async () => {
    getMasterLeagueMock.mockRejectedValue(new Error("401 Unauthorized"));
    await expect(aggregateFromMaster(CFG, PATCH, () => {})).rejects.toThrow("401 Unauthorized");
    expect(executeMock).not.toHaveBeenCalled();
  });
});

describe("computeMaxOrder", () => {
  it("breaks 5/5/3 ties by which skill reached its final rank first, not by slot", () => {
    // E maxed first, then Q, W last (E5 Q5 W3): used to come out as "132".
    const order = [3, 1, 2, 3, 3, 4, 3, 1, 3, 1, 4, 1, 1, 2, 2];
    expect(computeMaxOrder(order)).toBe("312");
  });

  it("keeps the real order at level 18 when every basic skill is rank 5", () => {
    // E > W > Q, all at 5: used to collapse to "123".
    const order = [3, 2, 1, 3, 3, 4, 3, 2, 3, 2, 4, 2, 2, 1, 1, 4, 1, 1];
    expect(computeMaxOrder(order)).toBe("321");
  });

  it("still ranks by count when there is no tie", () => {
    expect(computeMaxOrder([3, 1, 2, 1, 4, 1, 1, 2, 2])).toBe("123");
  });
});

describe("aggregateMultiRegion", () => {
  it("merges every region into one write under the bare patch and stamps last_run once", async () => {
    const fixtures = matchFixtures();
    getMasterLeagueMock.mockImplementation(async (cfg: RiotConfig) => ({
      tier: "MASTER",
      entries: [{ summonerId: `s-${cfg.region}` }],
    }));
    getPuuidMock.mockImplementation(async (cfg: RiotConfig) => `p-${cfg.region}`);
    const idsByRegion: Record<string, string[]> = { kr: ["M1"], euw1: ["M2"], na1: ["M3"] };
    getRecentMatchIdsMock.mockImplementation(async (cfg: RiotConfig) => idsByRegion[cfg.region]);
    getMatchFullMock.mockImplementation(async (_c: RiotConfig, id: string) => fixtures[id].full);
    getMatchTimelineMock.mockImplementation(async (_c: RiotConfig, id: string) => fixtures[id].tl);

    await aggregateMultiRegion(CFG, PATCH, () => {});

    // One DELETE + one write per table, all under the patch the readers query.
    expect(statementKinds().filter((k) => k.startsWith("DELETE"))).toEqual([
      "DELETE FROM meta_aggregate",
      "DELETE FROM counter_aggregate",
      "DELETE FROM build_aggregate",
      "DELETE FROM rune_aggregate",
      "DELETE FROM skill_order_aggregate",
    ]);
    const patchParams = executeMock.mock.calls
      .filter(([sql]) => String(sql).startsWith("DELETE FROM"))
      .map(([, p]) => p);
    expect(patchParams.every((p) => JSON.stringify(p) === JSON.stringify([PATCH]))).toBe(true);
    // Ahri played one game in each region: the three are summed, pick rate 3/3.
    const ahri = insertedRows("meta_aggregate", 9).find((r) => r[0] === AHRI);
    expect(ahri).toEqual([AHRI, "MIDDLE", 3, 2, 2 / 3, 1, 0, PATCH, NOW]);
    expect(statementKinds().filter((k) => k === "INSERT INTO aggregation_meta")).toHaveLength(1);
  });

  it("fails without touching the DB when no region yields a match", async () => {
    getMasterLeagueMock.mockResolvedValue({ tier: "MASTER", entries: [] });
    await expect(aggregateMultiRegion(CFG, PATCH, () => {})).rejects.toThrow();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("runs KR, EUW and NA in order and survives a failing region", async () => {
    const fixtures = matchFixtures();
    getMasterLeagueMock.mockImplementation(async (cfg: RiotConfig) => {
      if (cfg.region === "euw1") throw new Error("429 rate limited");
      return { tier: "MASTER", entries: cfg.region === "kr" ? [{ summonerId: "s1" }] : [] };
    });
    getPuuidMock.mockResolvedValue("p1");
    getRecentMatchIdsMock.mockResolvedValue(["M1"]);
    getMatchFullMock.mockResolvedValue(fixtures.M1.full);
    getMatchTimelineMock.mockResolvedValue(fixtures.M1.tl);
    const progress: AggregateProgress[] = [];
    const base = { ...CFG, region: "br1" as const };

    await aggregateMultiRegion(base, PATCH, (p) => progress.push(p));

    const calledCfgs = getMasterLeagueMock.mock.calls.map((c) => c[0] as RiotConfig);
    expect(calledCfgs.map((c) => c.region)).toEqual(["kr", "euw1", "na1"]);
    expect(calledCfgs.every((c) => c.apiKey === "RGAPI-test")).toBe(true);
    expect(base.region).toBe("br1");

    // EUW threw; what KR downloaded is still written, once, under the bare patch.
    const metaDeletes = executeMock.mock.calls
      .filter(([sql]) => String(sql) === "DELETE FROM meta_aggregate WHERE patch = $1")
      .map(([, p]) => p);
    expect(metaDeletes).toEqual([[PATCH]]);

    const phases = progress.map((p) => p.phase);
    expect(phases[0]).toBe("Región KR (1/3)");
    expect(phases).toContain("KR: Listando Master league");
    expect(phases).toContain("Región euw1 falló: Error: 429 rate limited");
    expect(phases).toContain("Región NA1 (3/3)");
    expect(progress[progress.length - 1]).toEqual({ phase: "Multi-región completado", done: 1, total: 1 });
  });
});
