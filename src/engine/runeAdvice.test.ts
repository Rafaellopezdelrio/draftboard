import { describe, it, expect } from "vitest";
import { runeAdvice } from "./runeAdvice";
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

const me = ch("Ahri", ["Mage"]); // squishy

describe("runeAdvice", () => {
  it("returns nothing before there are enemies", () => {
    expect(runeAdvice(me, [])).toEqual([]);
  });

  it("suggests MR vs an AP-heavy comp", () => {
    const enemies = [ch("Lux", ["Mage"]), ch("Syndra", ["Mage"]), ch("Brand", ["Mage"])];
    expect(runeAdvice(me, enemies)).toContain("runeAdvice.apHeavy");
  });

  it("suggests armor + Bone Plating vs an AD-heavy comp", () => {
    const enemies = [ch("Jinx", ["Marksman"]), ch("Garen", ["Fighter"]), ch("Riven", ["Fighter"])];
    expect(runeAdvice(me, enemies)).toContain("runeAdvice.adHeavy");
  });

  it("suggests sustain vs poke", () => {
    const enemies = [ch("Xerath", []), ch("Ziggs", [])];
    expect(runeAdvice(me, enemies)).toContain("runeAdvice.poke");
  });

  it("suggests tenacity vs heavy CC for a squishy champ", () => {
    const enemies = [ch("Leona", []), ch("Nautilus", [])];
    expect(runeAdvice(me, enemies)).toContain("runeAdvice.ccHeavy");
  });

  it("falls back to a neutral tip for a balanced comp", () => {
    expect(runeAdvice(me, [ch("Garen", ["Fighter"])])[0]).toBe("runeAdvice.balanced");
  });

  it("caps at 3 tips", () => {
    const enemies = [
      ch("Lux", ["Mage"]),
      ch("Syndra", ["Mage"]),
      ch("Brand", ["Mage"]),
      ch("Xerath", []),
      ch("Leona", []),
      ch("Nautilus", []),
    ];
    expect(runeAdvice(me, enemies).length).toBeLessThanOrEqual(3);
  });
});
