import { describe, it, expect } from "vitest";
import { getMatchupTips } from "./matchupTips";

describe("matchupTips — bilingual support", () => {
  const idToName = new Map<string, string>([
    ["157", "Yasuo"],
    ["238", "Zed"],
    ["999", "MysteryChamp"],
  ]);

  it("defaults to Spanish when no lang is given", () => {
    const tips = getMatchupTips(undefined, ["157"], idToName);
    expect(tips.length).toBeGreaterThan(0);
    // Spanish content marker: contains "wave" word in Spanish phrasing.
    expect(tips[0].tip).toMatch(/empujes|minions|windwall/i);
  });

  it("returns English when lang='en'", () => {
    const tips = getMatchupTips(undefined, ["157"], idToName, "en");
    expect(tips.length).toBeGreaterThan(0);
    // English marker: no Spanish accents/words.
    expect(tips[0].tip).not.toMatch(/empujes/i);
    expect(tips[0].tip).toMatch(/wave|wind|projectile|push/i);
  });

  it("returns tips for each known enemy", () => {
    const tips = getMatchupTips(undefined, ["157", "238"], idToName, "es");
    const versus = new Set(tips.map((t) => t.versus));
    expect(versus.has("Yasuo")).toBe(true);
    expect(versus.has("Zed")).toBe(true);
  });

  it("silently skips unknown champion names", () => {
    const tips = getMatchupTips(undefined, ["999"], idToName, "en");
    expect(tips).toEqual([]);
  });

  it("skips null and undefined entries in the enemy list", () => {
    const tips = getMatchupTips(undefined, [null, undefined, "157"], idToName);
    expect(tips.every((t) => t.versus === "Yasuo")).toBe(true);
  });
});
