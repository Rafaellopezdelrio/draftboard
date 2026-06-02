import { describe, it, expect } from "vitest";
import { aramAdvice } from "./aramEngine";
import type { Champion } from "../types/champion";

function ch(name: string, tags: Champion["tags"]): Champion {
  return {
    id: name,
    key: "1",
    name,
    title: "",
    iconUrl: "",
    splashUrl: "",
    tags,
    roles: [],
    archetypes: [],
  };
}

describe("aramAdvice", () => {
  it("gives a poke line for mages", () => {
    const tips = aramAdvice(ch("Lux", ["Mage"]));
    expect(tips.some((t) => /Poke/.test(t))).toBe(true);
  });

  it("recognises poke champs even without the Mage tag", () => {
    const tips = aramAdvice(ch("Ziggs", []));
    expect(tips.some((t) => /Poke/.test(t))).toBe(true);
  });

  it("tells marksmen to build sustain (no recall)", () => {
    const tips = aramAdvice(ch("Jinx", ["Marksman"]));
    expect(tips.some((t) => /sustain|Shieldbow/i.test(t))).toBe(true);
  });

  it("always includes the universal no-recall rule", () => {
    const tips = aramAdvice(ch("Garen", ["Fighter", "Tank"]));
    expect(tips.some((t) => /Sin recall/.test(t))).toBe(true);
  });

  it("caps at 4 bullets", () => {
    const tips = aramAdvice(ch("Kayn", ["Fighter", "Tank", "Assassin", "Mage"]));
    expect(tips.length).toBeLessThanOrEqual(4);
  });
});
