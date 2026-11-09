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
    expect(tips).toContain("aram.poke");
  });

  it("recognises poke champs even without the Mage tag", () => {
    const tips = aramAdvice(ch("Ziggs", []));
    expect(tips).toContain("aram.poke");
  });

  it("tells marksmen to build sustain (no recall)", () => {
    const tips = aramAdvice(ch("Jinx", ["Marksman"]));
    expect(tips).toContain("aram.marksman");
  });

  it("always includes the universal no-recall rule", () => {
    const tips = aramAdvice(ch("Garen", ["Fighter", "Tank"]));
    expect(tips).toContain("aram.universalSustain");
  });

  it("gives enchanters the support line, not the poke line", () => {
    const tips = aramAdvice(ch("Soraka", ["Support", "Mage"]));
    expect(tips).toContain("aram.support");
    expect(tips).not.toContain("aram.poke");
  });

  it("keeps the poke line for poke champs tagged Support (Lux)", () => {
    const tips = aramAdvice(ch("Lux", ["Mage", "Support"]));
    expect(tips).toContain("aram.poke");
    expect(tips).not.toContain("aram.support");
  });

  it("caps at 4 bullets", () => {
    const tips = aramAdvice(ch("Kayn", ["Fighter", "Tank", "Assassin", "Mage"]));
    expect(tips.length).toBeLessThanOrEqual(4);
  });
});
