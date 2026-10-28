import { describe, it, expect, vi, beforeEach } from "vitest";

const selectMock = vi.fn();
const getDbMock = vi.fn();
let tauri = true;
vi.mock("../db/client", () => ({
  isTauri: () => tauri,
  getDb: () => getDbMock(),
}));

import {
  computeTiersPerRole,
  loadAggregatedMeta,
  loadAggregatedCounters,
  loadAggregatedBuilds,
  loadAggregatedRunes,
  loadAggregatedSkillOrder,
  getLastAggregationTimestamp,
} from "./aggregateRepo";

function row(
  championId: number,
  position: string,
  winRate: number,
  pickRate = 0.05,
  banRate = 0.02,
  games = 100
) {
  return {
    champion_id: championId,
    position,
    win_rate: winRate,
    pick_rate: pickRate,
    ban_rate: banRate,
    games,
  };
}

describe("computeTiersPerRole (op.gg-style composite tier)", () => {
  it("filters out champions with insufficient sample size (<10 games)", () => {
    const result = computeTiersPerRole([
      row(1, "MIDDLE", 1.0, 0.001, 0, 5), // 100% WR but only 5 games — should be EXCLUDED
      row(2, "MIDDLE", 0.51, 0.1, 0.05, 200),
    ]);
    expect(result.find((m) => m.championKey === "1")).toBeUndefined();
    expect(result.find((m) => m.championKey === "2")).toBeDefined();
  });

  it("does NOT give S-tier to small-sample 60% WR niche pick (Wilson bound)", () => {
    // Niche pick: 12 games at 65% WR — old formula would S-tier this
    const niche = row(1, "MIDDLE", 0.65, 0.005, 0, 12);
    // Meta pick: 500 games at 52% WR + 30% pickrate
    const meta = row(2, "MIDDLE", 0.52, 0.30, 0.10, 500);
    const others = Array.from({ length: 18 }, (_, i) =>
      row(100 + i, "MIDDLE", 0.50, 0.05, 0, 80)
    );
    const result = computeTiersPerRole([niche, meta, ...others]);
    const nicheT = result.find((m) => m.championKey === "1");
    const metaT = result.find((m) => m.championKey === "2");
    // Meta pick should outrank niche on composite score
    expect(["S", "A"]).toContain(metaT?.tier);
    expect(nicheT?.tier).not.toBe("S");
  });

  it("groups by role: same champ in different roles gets independent tier", () => {
    const result = computeTiersPerRole([
      row(1, "MIDDLE", 0.58, 0.2, 0.1, 300), // strong mid
      row(1, "TOP", 0.46, 0.02, 0, 50),     // weak as top filler
      ...Array.from({ length: 19 }, (_, i) =>
        row(100 + i, "MIDDLE", 0.50, 0.05, 0, 80)
      ),
      ...Array.from({ length: 19 }, (_, i) =>
        row(200 + i, "TOP", 0.51, 0.08, 0, 80)
      ),
    ]);
    const mid = result.find((m) => m.championKey === "1" && m.role === "MIDDLE");
    const top = result.find((m) => m.championKey === "1" && m.role === "TOP");
    expect(mid?.tier).toBe("S");
    expect(top?.tier).toBe("D");
  });

  it("absolute thresholds: many champs above 55% WR all get S tier (op.gg-style)", () => {
    // 15 strong champs all >55% WR — ALL should be S, not just top 10%
    const rows = Array.from({ length: 15 }, (_, i) =>
      row(i + 1, "MIDDLE", 0.56 + i * 0.001, 0.1, 0, 200)
    );
    const result = computeTiersPerRole(rows);
    const sTier = result.filter((m) => m.tier === "S");
    // Most or all of these should be S-tier (absolute threshold)
    expect(sTier.length).toBeGreaterThanOrEqual(10);
  });

  it("guarantees at least top 5% as S even when all scores are low", () => {
    // All weak champs (low WR) — but the floor still gives top 5% an S
    const rows = Array.from({ length: 20 }, (_, i) =>
      row(i + 1, "MIDDLE", 0.45 + i * 0.001, 0.05, 0, 100)
    );
    const result = computeTiersPerRole(rows);
    const sTier = result.filter((m) => m.tier === "S");
    expect(sTier.length).toBeGreaterThanOrEqual(1);
  });

  it("S-tier has objectively higher WR than D-tier", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      row(i + 1, "MIDDLE", 0.42 + i * 0.006, 0.05, 0, 150)
    );
    const result = computeTiersPerRole(rows);
    const sTier = result.filter((m) => m.tier === "S");
    const dTier = result.filter((m) => m.tier === "D");
    // Both bands must be populated, otherwise the comparison below is vacuous.
    expect(sTier.length).toBeGreaterThan(0);
    expect(dTier.length).toBeGreaterThan(0);
    expect(Math.min(...sTier.map((m) => m.winRate))).toBeGreaterThan(
      Math.max(...dTier.map((m) => m.winRate))
    );
  });

  it("ban rate amplifies the score (a heavily-banned 51% WR > niche 53% WR)", () => {
    const heavilyBanned = row(1, "MIDDLE", 0.51, 0.15, 0.50, 300); // huge ban rate
    const niche = row(2, "MIDDLE", 0.53, 0.02, 0, 60);
    const others = Array.from({ length: 18 }, (_, i) =>
      row(100 + i, "MIDDLE", 0.49, 0.05, 0, 80)
    );
    const result = computeTiersPerRole([heavilyBanned, niche, ...others]);
    const banned = result.find((m) => m.championKey === "1");
    const n = result.find((m) => m.championKey === "2");
    const tierOrder = ["S", "A", "B", "C", "D"];
    expect(tierOrder.indexOf(banned!.tier)).toBeLessThanOrEqual(
      tierOrder.indexOf(n!.tier)
    );
  });
});

describe("aggregate loaders (SQLite)", () => {
  beforeEach(() => {
    tauri = true;
    selectMock.mockReset().mockResolvedValue([]);
    getDbMock.mockReset().mockResolvedValue({ select: selectMock });
  });

  it("return empty defaults outside Tauri without opening the DB", async () => {
    tauri = false;
    expect(await loadAggregatedMeta("14.20")).toEqual([]);
    expect(await loadAggregatedCounters("14.20")).toEqual([]);
    expect(await loadAggregatedBuilds("14.20", 103, "MIDDLE")).toEqual([]);
    expect(await loadAggregatedRunes("14.20", 103, "MIDDLE")).toBeNull();
    expect(await loadAggregatedSkillOrder("14.20", 103, "MIDDLE")).toBeNull();
    expect(await getLastAggregationTimestamp()).toBeNull();
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("loadAggregatedMeta filters by patch and tiers the rows", async () => {
    selectMock.mockResolvedValue([
      row(103, "MIDDLE", 0.55, 0.2, 0.1, 400),
      row(7, "MIDDLE", 0.6, 0.01, 0, 3), // under 10 games — dropped by tiering
    ]);
    const out = await loadAggregatedMeta("14.20");
    expect(selectMock.mock.calls[0][0]).toContain("FROM meta_aggregate WHERE patch = $1");
    expect(selectMock.mock.calls[0][1]).toEqual(["14.20"]);
    expect(out).toEqual([
      { championKey: "103", role: "MIDDLE", tier: "S", winRate: 0.55, pickRate: 0.2, banRate: 0.1 },
    ]);
  });

  it("loadAggregatedCounters maps ids to string keys", async () => {
    selectMock.mockResolvedValue([
      { champion_id: 103, vs_champion_id: 157, position: "MIDDLE", win_rate: 0.47, games: 88 },
    ]);
    const out = await loadAggregatedCounters("14.20");
    expect(selectMock.mock.calls[0][0]).toContain("FROM counter_aggregate WHERE patch = $1");
    expect(selectMock.mock.calls[0][1]).toEqual(["14.20"]);
    expect(out).toEqual([
      { championKey: "103", vsChampionKey: "157", role: "MIDDLE", winRate: 0.47, sampleSize: 88 },
    ]);
  });

  it("loadAggregatedBuilds splits the CSV item list into numbers", async () => {
    selectMock.mockResolvedValue([
      { champion_id: 103, position: "MIDDLE", item_ids: "6655,3020,4645", games: 40, wins: 24 },
    ]);
    const out = await loadAggregatedBuilds("14.20", 103, "MIDDLE");
    expect(selectMock.mock.calls[0][1]).toEqual(["14.20", 103, "MIDDLE"]);
    expect(out).toEqual([
      { championId: 103, position: "MIDDLE", itemIds: [6655, 3020, 4645], games: 40, wins: 24 },
    ]);
  });

  it("loadAggregatedRunes returns the top row with parsed perks/shards", async () => {
    selectMock.mockResolvedValue([
      {
        champion_id: 103,
        position: "MIDDLE",
        primary_style: 8100,
        sub_style: 8200,
        perks: "8112,8139,8138,8135,8210,8237",
        shards: "5008,5008,5001",
        games: 120,
        wins: 66,
      },
    ]);
    const out = await loadAggregatedRunes("14.20", 103, "MIDDLE");
    expect(selectMock.mock.calls[0][0]).toContain("FROM rune_aggregate");
    expect(selectMock.mock.calls[0][1]).toEqual(["14.20", 103, "MIDDLE"]);
    expect(out).toEqual({
      championId: 103,
      position: "MIDDLE",
      primaryStyle: 8100,
      subStyle: 8200,
      perks: [8112, 8139, 8138, 8135, 8210, 8237],
      shards: [5008, 5008, 5001],
      games: 120,
      wins: 66,
    });
  });

  it("loadAggregatedRunes / SkillOrder return null when no row exists", async () => {
    expect(await loadAggregatedRunes("14.20", 1, "TOP")).toBeNull();
    expect(await loadAggregatedSkillOrder("14.20", 1, "TOP")).toBeNull();
  });

  it("loadAggregatedSkillOrder maps the most-played order", async () => {
    selectMock.mockResolvedValue([{ first_three: "QWE", max_order: "QEW", games: 50, wins: 27 }]);
    const out = await loadAggregatedSkillOrder("14.20", 103, "MIDDLE");
    expect(selectMock.mock.calls[0][0]).toContain("FROM skill_order_aggregate");
    expect(selectMock.mock.calls[0][1]).toEqual(["14.20", 103, "MIDDLE"]);
    expect(out).toEqual({ firstThree: "QWE", maxOrder: "QEW", games: 50, wins: 27 });
  });

  it("swallow query errors (table missing pre-migration) into empty results", async () => {
    selectMock.mockRejectedValue(new Error("no such table"));
    expect(await loadAggregatedMeta("14.20")).toEqual([]);
    expect(await loadAggregatedCounters("14.20")).toEqual([]);
    expect(await loadAggregatedBuilds("14.20", 103, "MIDDLE")).toEqual([]);
    expect(await loadAggregatedRunes("14.20", 103, "MIDDLE")).toBeNull();
    expect(await loadAggregatedSkillOrder("14.20", 103, "MIDDLE")).toBeNull();
  });

  it("getLastAggregationTimestamp parses the stored value or returns null", async () => {
    expect(await getLastAggregationTimestamp()).toBeNull();
    selectMock.mockResolvedValue([{ value: "1700000000000" }]);
    expect(await getLastAggregationTimestamp()).toBe(1_700_000_000_000);
    expect(selectMock.mock.calls[1][0]).toContain("WHERE key = 'last_run'");
  });
});

describe("computeTiersPerRole tier bands", () => {
  it("assigns B/C/D by absolute composite thresholds below the floors", () => {
    // 20 equal-sample rows; presence 0 → composite = WR - 0.5/sqrt(10001) ≈ WR - 0.005.
    // Top 1 forced S, top 3 forced A; the tested rows sit below those floors.
    const filler = Array.from({ length: 17 }, (_, i) => row(100 + i, "TOP", 0.6, 0, 0, 10000));
    const out = computeTiersPerRole([
      ...filler,
      row(1, "TOP", 0.49, 0, 0, 10000), // ≈0.485 → B
      row(2, "TOP", 0.47, 0, 0, 10000), // ≈0.465 → C
      row(3, "TOP", 0.40, 0, 0, 10000), // ≈0.395 → D
    ]);
    const tierOf = (k: string) => out.find((m) => m.championKey === k)?.tier;
    expect(tierOf("1")).toBe("B");
    expect(tierOf("2")).toBe("C");
    expect(tierOf("3")).toBe("D");
    expect(out.filter((m) => m.role === "TOP")).toHaveLength(20);
  });
});
