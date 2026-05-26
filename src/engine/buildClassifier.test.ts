import { describe, it, expect } from "vitest";
import {
  classifyBuild,
  aggregateBuildStats,
  tierFromWinRate,
  counterSignature,
} from "./buildClassifier";

describe("aggregateBuildStats", () => {
  it("sums known items + ignores unknown", () => {
    // Bloodthirster (80 AD + heal), Infinity Edge (70 AD + crit)
    const stats = aggregateBuildStats([3072, 3031, 99999]);
    expect(stats.ad).toBe(150);
    expect(stats.healItems).toBe(1);
    expect(stats.critItems).toBe(1);
  });
});

describe("classifyBuild", () => {
  it("classifies 2 crit items as Crit DPS", () => {
    // IE + Phantom Dancer
    const c = classifyBuild([3031, 3046]);
    expect(c.archetype).toBe("Crit DPS");
    expect(c.name).toBe("Crit DPS");
  });

  it("classifies lethality stack as Lethality", () => {
    // Youmuu's + Eclipse + Serylda's
    const c = classifyBuild([3142, 6692, 6701]);
    expect(c.archetype).toBe("Lethality");
  });

  it("classifies tank stack as Tank", () => {
    // Sunfire + Thornmail + Heartsteel
    const c = classifyBuild([3068, 3075, 3084]);
    expect(c.archetype).toBe("Tank");
  });

  it("falls back to Otro for unclassifiable", () => {
    const c = classifyBuild([99999, 88888]);
    expect(c.archetype).toBe("Otro");
  });
});

describe("tierFromWinRate", () => {
  it("returns S+ for >= 56%", () => {
    expect(tierFromWinRate(0.56)).toBe("S+");
    expect(tierFromWinRate(0.6)).toBe("S+");
  });
  it("returns S for >= 53%", () => {
    expect(tierFromWinRate(0.53)).toBe("S");
  });
  it("returns C for < 49%", () => {
    expect(tierFromWinRate(0.45)).toBe("C");
  });
});

describe("counterSignature", () => {
  it("flags high-HP enemies as Vs Tanks", () => {
    expect(counterSignature(2300, 0.5, 0.5)).toBe("Vs Tanks");
  });
  it("flags low-HP enemies as Vs Squishies", () => {
    expect(counterSignature(1800, 0.5, 0.5)).toBe("Vs Squishies");
  });
  it("flags AP-heavy as Vs AP", () => {
    expect(counterSignature(2000, 0.7, 0.3)).toBe("Vs AP");
  });
  it("returns null for balanced", () => {
    expect(counterSignature(2100, 0.5, 0.5)).toBeNull();
  });
});
