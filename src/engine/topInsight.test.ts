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
    expect(out?.tipKey).toBe("coach.tip.vision.critical");
    expect(out?.labelKey).toBe("coach.category.vision");
  });

  it("uses needs-work tip for 35-55", () => {
    const out = deriveTopInsight(baseGpi({ aggression: 45 }));
    expect(out?.severity).toBe("needs-work");
  });

  it("adds secondary tip when 2 axes are weak", () => {
    const out = deriveTopInsight(baseGpi({ farming: 30, vision: 40 }));
    expect(out?.category).toBe("farming");
    expect(out?.secondaryTipKey).toBe("coach.tip.vision.needsWork");
    expect(out?.secondaryAreaKey).toBe("coach.category.vision");
  });
});

describe("deriveTopInsight — role-aware tips", () => {
  it("never picks versatility (one-game KDA) since its tip talks about champion pool", () => {
    const out = deriveTopInsight(baseGpi({ versatility: 10, vision: 50 }));
    expect(out?.category).toBe("vision");
    expect(out?.secondaryAreaKey).toBeUndefined();
  });

  it("returns null when only versatility is low", () => {
    expect(deriveTopInsight(baseGpi({ versatility: 10 }))).toBeNull();
  });

  it("skips the lane tip for junglers but keeps it for laners", () => {
    const jungle = deriveTopInsight({ ...baseGpi({ laning: 20, farming: 50 }), role: "JUNGLE" });
    expect(jungle?.category).toBe("farming");
    const top = deriveTopInsight({ ...baseGpi({ laning: 20, farming: 50 }), role: "TOP" });
    expect(top?.category).toBe("laning");
    expect(top?.tipKey).toBe("coach.tip.laning.critical");
  });

  it("only junglers get the Smite-based critical objectives tip", () => {
    const sup = deriveTopInsight({ ...baseGpi({ objectives: 15 }), role: "UTILITY" });
    expect(sup?.severity).toBe("critical");
    expect(sup?.tipKey).toBe("coach.tip.objectives.needsWork");
    const jg = deriveTopInsight({ ...baseGpi({ objectives: 15 }), role: "JUNGLE" });
    expect(jg?.tipKey).toBe("coach.tip.objectives.critical");
  });

  it("ignores the fixed farming/laning placeholders for supports", () => {
    const sup: GpiScore = { ...baseGpi({ farming: 50, laning: 50 }), role: "UTILITY" };
    expect(deriveTopInsight(sup)).toBeNull();
    const weakVision = deriveTopInsight({ ...sup, categories: { ...sup.categories, vision: 40 } });
    expect(weakVision?.category).toBe("vision");
    expect(weakVision?.secondaryAreaKey).toBeUndefined();
  });
});
