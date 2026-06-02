import { describe, it, expect } from "vitest";
import { bracketForTier, benchmarkStats } from "./rankBenchmarks";

describe("bracketForTier", () => {
  it("maps tiers to brackets", () => {
    expect(bracketForTier("GOLD")).toBe("gold-plat");
    expect(bracketForTier("emerald")).toBe("emerald-diamond");
    expect(bracketForTier("CHALLENGER")).toBe("master-plus");
    expect(bracketForTier("IRON")).toBe("iron-silver");
  });
  it("defaults to the median bracket when unknown/unranked", () => {
    expect(bracketForTier(null)).toBe("gold-plat");
    expect(bracketForTier("WOOD")).toBe("gold-plat");
  });
});

describe("benchmarkStats", () => {
  const base = { bracket: "gold-plat", role: "MIDDLE" } as const;

  it("calls a low CS/min below the bracket baseline", () => {
    const [b] = benchmarkStats({ ...base, cspm: 5.0, vspm: null, dpm: null, kda: null });
    expect(b.key).toBe("cspm");
    expect(b.verdict).toBe("below");
    expect(b.expected).toBeGreaterThan(b.value);
  });

  it("calls a high CS/min above baseline, and one near it 'at'", () => {
    expect(benchmarkStats({ ...base, cspm: 8.5, vspm: null, dpm: null, kda: null })[0].verdict).toBe("above");
    expect(benchmarkStats({ ...base, cspm: 6.8, vspm: null, dpm: null, kda: null })[0].verdict).toBe("at");
  });

  it("inverts deaths/min (more deaths = worse = below)", () => {
    const worse = benchmarkStats({ ...base, cspm: null, vspm: null, dpm: 0.45, kda: null })[0];
    expect(worse.verdict).toBe("below");
    const better = benchmarkStats({ ...base, cspm: null, vspm: null, dpm: 0.15, kda: null })[0];
    expect(better.verdict).toBe("above");
  });

  it("skips metrics with no data", () => {
    const out = benchmarkStats({ ...base, cspm: 6.8, vspm: null, dpm: null, kda: null });
    expect(out.map((b) => b.key)).toEqual(["cspm"]);
  });
});
