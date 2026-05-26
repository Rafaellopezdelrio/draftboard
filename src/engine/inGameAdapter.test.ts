import { describe, it, expect } from "vitest";
import { suggestInGameAdaptations } from "./inGameAdapter";
import type { Champion } from "../types/champion";

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
});
