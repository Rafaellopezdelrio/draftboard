import { describe, it, expect } from "vitest";
import { suggestInGameAdaptations } from "./inGameAdapter";
import type { Champion } from "../types/champion";
import { i18n } from "../i18n";

const adcChamp: Champion = {
  key: "22",
  id: "Ashe",
  name: "Ashe",
  title: "",
  iconUrl: "",
  splashUrl: "",
  tags: ["Marksman"],
  roles: ["BOTTOM"],
  archetypes: [],
};
const mageChamp: Champion = {
  key: "61",
  id: "Orianna",
  name: "Orianna",
  title: "",
  iconUrl: "",
  splashUrl: "",
  tags: ["Mage", "Support"],
  roles: ["MIDDLE"],
  archetypes: [],
};

describe("suggestInGameAdaptations", () => {
  it("returns empty before min game time", () => {
    const out = suggestInGameAdaptations({
      champion: adcChamp,
      enemyPlayers: [{ items: [{ itemID: 3072 }] }, { items: [{ itemID: 6630 }] }],
      gameTime: 60,
    });
    expect(out).toEqual([]);
  });

  it("recommends Mortal Reminder when 2+ enemies stack lifesteal/heal", () => {
    const out = suggestInGameAdaptations({
      champion: adcChamp,
      enemyPlayers: [
        { items: [{ itemID: 3072 }] }, // Bloodthirster
        { items: [{ itemID: 6630 }] }, // Goredrinker
      ],
      gameTime: 15 * 60,
    });
    const gw = out.find((s) => s.key === "gw-ad");
    expect(gw?.itemId).toBe(3033);
  });

  it("recommends Morellonomicon for AP scaling vs healers", () => {
    const out = suggestInGameAdaptations({
      champion: mageChamp,
      enemyPlayers: [
        { items: [{ itemID: 3072 }] },
        { items: [{ itemID: 6610 }] },
      ],
      gameTime: 15 * 60,
    });
    expect(out.find((s) => s.key === "gw-ap")?.itemId).toBe(3165);
  });

  it("recommends Void Staff for AP vs heavy MR stack", () => {
    const out = suggestInGameAdaptations({
      champion: mageChamp,
      enemyPlayers: [
        { items: [{ itemID: 4644 }] },          // FoN 70 MR
        { items: [{ itemID: 3065 }] },          // Spirit Visage 50 MR
        { items: [{ itemID: 3102 }] },          // Banshee's 50 MR
        { items: [{ itemID: 3091 }] },          // Wit's End 50 MR (total 220 > 200)
      ],
      gameTime: 18 * 60,
    });
    expect(out.find((s) => s.key === "magpen")?.itemId).toBe(3135);
  });

  it("recommends Lord Dominik's for AD vs heavy armor", () => {
    const out = suggestInGameAdaptations({
      champion: adcChamp,
      enemyPlayers: [
        { items: [{ itemID: 3143 }] },           // Randuin's 80
        { items: [{ itemID: 3075 }] },           // Thornmail 80
        { items: [{ itemID: 3068 }] },           // Sunfire 50 (210 total)
      ],
      gameTime: 18 * 60,
    });
    expect(out.find((s) => s.key === "armpen-crit")?.itemId).toBe(3036);
  });

  it("does not re-suggest items already owned", () => {
    const out = suggestInGameAdaptations({
      champion: adcChamp,
      enemyPlayers: [
        { items: [{ itemID: 3072 }] },
        { items: [{ itemID: 6630 }] },
      ],
      gameTime: 15 * 60,
      myItems: [{ itemID: 3033 }], // already have Mortal Reminder
    });
    expect(out.find((s) => s.key === "gw-ad")).toBeUndefined();
  });

  const champ = (id: string, tags: string[]): Champion => ({
    ...adcChamp,
    id,
    name: id,
    tags,
  });
  const healers = [{ items: [{ itemID: 3072 }] }, { items: [{ itemID: 6630 }] }];
  const armorStack = [
    { items: [{ itemID: 3143 }] },
    { items: [{ itemID: 3075 }] },
    { items: [{ itemID: 3068 }] },
  ];
  const mrStack = [
    { items: [{ itemID: 4644 }] },
    { items: [{ itemID: 3065 }] },
    { items: [{ itemID: 3102 }] },
    { items: [{ itemID: 3091 }] },
  ];
  const keys = (c: Champion, enemyPlayers: Array<{ items: Array<{ itemID: number }> }>, myItems?: Array<{ itemID: number }>) =>
    suggestInGameAdaptations({ champion: c, enemyPlayers, gameTime: 18 * 60, myItems });

  it("uses Serylda's Grudge's real item id (6694), not Opportunity (6701)", () => {
    const out = keys(adcChamp, armorStack);
    expect(out.find((s) => s.key === "armpen-bruiser")?.itemId).toBe(6694);
    // Owning Serylda's hides both armor-pen cards; owning Opportunity hides neither.
    expect(keys(adcChamp, armorStack, [{ itemID: 6694 }]).some((s) => s.key.startsWith("armpen"))).toBe(false);
    const withOpp = keys(adcChamp, armorStack, [{ itemID: 6701 }]).map((s) => s.key);
    expect(withOpp).toEqual(expect.arrayContaining(["armpen-crit", "armpen-bruiser"]));
  });

  it("gives tank supports Bramble Vest and no AP pen items", () => {
    const leona = champ("Leona", ["Tank", "Support"]);
    const out = keys(leona, [...healers, ...mrStack]);
    expect(out.find((s) => s.key === "gw-tank")?.itemId).toBe(3076);
    expect(out.some((s) => ["gw-ap", "magpen", "sorcs"].includes(s.key))).toBe(false);
  });

  it("gives AD supports no AP items", () => {
    const senna = champ("Senna", ["Marksman", "Support"]);
    expect(keys(senna, mrStack).some((s) => ["magpen", "sorcs"].includes(s.key))).toBe(false);
  });

  it("skips magic pen for enchanters", () => {
    const janna = champ("Janna", ["Support", "Mage"]);
    expect(keys(janna, mrStack).some((s) => ["magpen", "sorcs"].includes(s.key))).toBe(false);
  });

  it("gives AD assassins an AD anti-heal item, not Bramble Vest", () => {
    const zed = champ("Zed", ["Assassin"]);
    const out = keys(zed, healers);
    expect(out.find((s) => s.key === "gw-ad")?.itemId).toBe(6609);
    expect(out.some((s) => s.key === "gw-tank")).toBe(false);
  });

  it("shows Edge of Night only to AD non-marksmen and Randuin's only to tanks/fighters", () => {
    const shields = [{ items: [{ itemID: 3053 }] }, { items: [{ itemID: 3156 }] }];
    const crits = [{ items: [{ itemID: 3031 }] }, { items: [{ itemID: 6676 }] }];
    const jinx = champ("Jinx", ["Marksman"]);
    const ahri = champ("Ahri", ["Mage", "Assassin"]);
    const lux = champ("Lux", ["Mage", "Support"]);
    const zed = champ("Zed", ["Assassin"]);
    const malphite = champ("Malphite", ["Tank", "Fighter"]);
    expect(keys(jinx, shields).some((s) => s.key === "anti-shield")).toBe(false);
    expect(keys(ahri, shields).some((s) => s.key === "anti-shield")).toBe(false);
    expect(keys(zed, shields).some((s) => s.key === "anti-shield")).toBe(true);
    const darius = champ("Darius", ["Fighter", "Tank"]);
    expect(keys(darius, shields).some((s) => s.key === "anti-shield")).toBe(false);
    expect(keys(lux, crits).some((s) => s.key === "anti-crit")).toBe(false);
    expect(keys(malphite, crits).some((s) => s.key === "anti-crit")).toBe(true);
  });

  it("exposes reasons as i18n keys + params instead of hardcoded Spanish", () => {
    const out = keys(adcChamp, [...healers, ...armorStack]);
    const gw = out.find((s) => s.key === "gw-ad");
    expect(gw?.reasonKey).toBe("inGameAdapt.gwAd");
    expect(gw?.reasonParams).toEqual({ healers: 2 });
    const ldr = out.find((s) => s.key === "armpen-crit");
    expect(ldr?.reasonKey).toBe("inGameAdapt.armpenCrit");
    expect(ldr?.reasonParams?.armor).toBeGreaterThanOrEqual(200);
    for (const s of out) {
      expect(s.reasonKey).toMatch(/^inGameAdapt\./);
      expect(s.reason).toBe(i18n.t(s.reasonKey ?? "", s.reasonParams));
    }
  });
});
