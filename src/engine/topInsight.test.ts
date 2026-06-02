import { describe, it, expect } from "vitest";
import { deriveTopInsight } from "./topInsight";
import type { GpiScore } from "./gpiEngine";

const baseGpi = (overrides: Partial<GpiScore["categories"]>): GpiScore => ({
  total: 60,
  matchId: "TEST_1",
  categories: {
    farming: 70,
    vision: 70,
    aggression: 70,
    survivability: 70,
    objectives: 70,
    versatility: 70,
    laning: 70,
    ...overrides,
  },
});

describe("deriveTopInsight", () => {
  it("returns null when all axes are healthy", () => {
    expect(deriveTopInsight(baseGpi({}))).toBeNull();
  });

  it("returns null when GPI is null", () => {
    expect(deriveTopInsight(null)).toBeNull();
  });

  it("picks the worst category", () => {
    const out = deriveTopInsight(baseGpi({ farming: 25 }));
    expect(out?.category).toBe("farming");
    expect(out?.severity).toBe("critical");
  });

  it("uses critical tip for score < 35", () => {
    const out = deriveTopInsight(baseGpi({ vision: 20 }));
    expect(out?.severity).toBe("critical");
    expect(out?.tip).toMatch(/Wards/i);
  });

  it("uses needs-work tip for 35-55", () => {
    const out = deriveTopInsight(baseGpi({ aggression: 45 }));
    expect(out?.severity).toBe("needs-work");
  });

  it("adds secondary tip when 2 axes are weak", () => {
    const out = deriveTopInsight(baseGpi({ farming: 30, vision: 40 }));
    expect(out?.category).toBe("farming");
    expect(out?.secondaryTip).toBeDefined();
  });
});
