import { describe, it, expect } from "vitest";
import { computeTiersPerRole } from "./aggregateRepo";

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

  it("percentile bins respect op.gg distribution (top ~8% = S, bottom ~5% = D)", () => {
    // 20 champions in one role, each 1% better WR than the previous
    const rows = Array.from({ length: 20 }, (_, i) =>
      row(i + 1, "MIDDLE", 0.40 + i * 0.01, 0.05, 0, 100)
    );
    const result = computeTiersPerRole(rows);
    const sTier = result.filter((m) => m.tier === "S");
    const dTier = result.filter((m) => m.tier === "D");
    // ~8% of 20 = 2, ~5% of 20 = 1
    expect(sTier.length).toBeGreaterThan(0);
    expect(sTier.length).toBeLessThanOrEqual(3);
    expect(dTier.length).toBeGreaterThan(0);
    expect(dTier.length).toBeLessThanOrEqual(3);
    // S tier should have the highest WR champions
    expect(Math.max(...sTier.map((m) => m.winRate))).toBeGreaterThan(
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
