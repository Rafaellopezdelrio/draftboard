import { describe, it, expect } from "vitest";
import { aggregateEnemyItems } from "./itemTags";

// Item IDs referenced (see ITEM_TAGS): 3075 Thornmail, 3072 Bloodthirster,
// 3074 Ravenous Hydra, 3031 Infinity Edge, 3071 Black Cleaver.
function enemy(...itemIDs: number[]) {
  return { items: itemIDs.map((itemID) => ({ itemID })) };
}

describe("aggregateEnemyItems", () => {
  it("returns all zeros for no enemies", () => {
    expect(aggregateEnemyItems([])).toEqual({
      totalArmor: 0,
      totalMr: 0,
      totalHp: 0,
      healers: 0,
      shielders: 0,
      crits: 0,
      totalAd: 0,
      totalAp: 0,
    });
  });

  it("sums defensive stats across enemies (Thornmail = 80 armor / 350 hp)", () => {
    const r = aggregateEnemyItems([enemy(3075)]);
    expect(r.totalArmor).toBe(80);
    expect(r.totalHp).toBe(350);
  });

  it("counts a healer once even when they stack multiple heal items", () => {
    // Bloodthirster + Ravenous Hydra on ONE player = one healer, not two.
    const r = aggregateEnemyItems([enemy(3072, 3074)]);
    expect(r.healers).toBe(1);
  });

  it("counts healers per distinct enemy", () => {
    const r = aggregateEnemyItems([enemy(3072), enemy(3074)]);
    expect(r.healers).toBe(2);
  });

  it("counts crit carriers (Infinity Edge)", () => {
    expect(aggregateEnemyItems([enemy(3031)]).crits).toBe(1);
  });

  it("does NOT flag Black Cleaver as a healer (it has no lifesteal)", () => {
    // Regression: ITEM_TAGS used to mark 3071 heal:true despite the comment
    // saying it shouldn't — a false grievous-wounds trigger.
    const r = aggregateEnemyItems([enemy(3071)]);
    expect(r.healers).toBe(0);
    expect(r.totalAd).toBe(55);
    expect(r.totalHp).toBe(400);
  });

  it("ignores unknown item ids and tolerates a missing items array", () => {
    const r = aggregateEnemyItems([enemy(999999), { items: undefined as never }]);
    expect(r.totalArmor).toBe(0);
    expect(r.healers).toBe(0);
  });
});
