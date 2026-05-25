import { describe, it, expect } from "vitest";
import {
  DPM_TIER_LABELS,
  DPM_TIER_ORDER,
  DPM_PLATFORM_LABELS,
  type DpmTier,
} from "./dpmTierlist";

// dpmTierlist's fetch is just a thin wrapper around the proxy and is
// covered by the worker-side tests. Here we pin the public constants
// the UI relies on (the rank selector dropdowns specifically).

describe("DPM_TIER_LABELS / DPM_TIER_ORDER", () => {
  it("includes every Riot rank from Iron to Challenger plus 'all'", () => {
    expect(DPM_TIER_ORDER).toContain("iron");
    expect(DPM_TIER_ORDER).toContain("bronze");
    expect(DPM_TIER_ORDER).toContain("silver");
    expect(DPM_TIER_ORDER).toContain("gold");
    expect(DPM_TIER_ORDER).toContain("platinum");
    expect(DPM_TIER_ORDER).toContain("emerald");
    expect(DPM_TIER_ORDER).toContain("diamond");
    expect(DPM_TIER_ORDER).toContain("master");
    expect(DPM_TIER_ORDER).toContain("grandmaster");
    expect(DPM_TIER_ORDER).toContain("challenger");
    expect(DPM_TIER_ORDER).toContain("all");
  });

  it("has 17 brackets total (matching dpm.lol's selector)", () => {
    expect(DPM_TIER_ORDER).toHaveLength(17);
  });

  it("has a label for every tier in the order list", () => {
    for (const t of DPM_TIER_ORDER) {
      expect(DPM_TIER_LABELS[t]).toBeTruthy();
    }
  });

  it("orders highest-rank first (Challenger before Iron)", () => {
    const cIdx = DPM_TIER_ORDER.indexOf("challenger");
    const iIdx = DPM_TIER_ORDER.indexOf("iron");
    expect(cIdx).toBeLessThan(iIdx);
  });

  it("labels are human-readable Spanish/English strings", () => {
    const challengerLabel = DPM_TIER_LABELS.challenger;
    expect(challengerLabel.length).toBeGreaterThan(0);
    expect(challengerLabel).toMatch(/[A-Z]/);
  });

  it("type DpmTier matches the union of order entries", () => {
    // Compile-time check: assigning each order value to DpmTier should compile.
    const probe: DpmTier[] = [...DPM_TIER_ORDER];
    expect(probe.length).toBe(DPM_TIER_ORDER.length);
  });
});

describe("DPM_PLATFORM_LABELS", () => {
  it("covers Riot's official region codes", () => {
    expect(DPM_PLATFORM_LABELS.euw1).toBeTruthy();
    expect(DPM_PLATFORM_LABELS.kr).toBeTruthy();
    expect(DPM_PLATFORM_LABELS.na1).toBeTruthy();
    expect(DPM_PLATFORM_LABELS.eun1).toBeTruthy();
    expect(DPM_PLATFORM_LABELS.br1).toBeTruthy();
    expect(DPM_PLATFORM_LABELS.la1).toBeTruthy();
    expect(DPM_PLATFORM_LABELS.la2).toBeTruthy();
    expect(DPM_PLATFORM_LABELS.oc1).toBeTruthy();
    expect(DPM_PLATFORM_LABELS.tr1).toBeTruthy();
    expect(DPM_PLATFORM_LABELS.ru).toBeTruthy();
    expect(DPM_PLATFORM_LABELS.jp1).toBeTruthy();
  });

  it("has 11 platforms total (dpm.lol's supported list)", () => {
    expect(Object.keys(DPM_PLATFORM_LABELS)).toHaveLength(11);
  });
});
