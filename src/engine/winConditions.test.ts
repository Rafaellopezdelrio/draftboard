import { describe, it, expect } from "vitest";
import { deriveWinConditions } from "./winConditions";
import type { ChampionDb } from "../types/champion";

function mockDb(): ChampionDb {
  const champs = {
    "1": { id: "Jinx", key: "1", name: "Jinx", title: "", iconUrl: "", splashUrl: "", tags: ["Marksman"], roles: ["BOTTOM"] as const, archetypes: [] },
    "2": { id: "Leona", key: "2", name: "Leona", title: "", iconUrl: "", splashUrl: "", tags: ["Tank", "Support"], roles: ["UTILITY"] as const, archetypes: [] },
    "3": { id: "Caitlyn", key: "3", name: "Caitlyn", title: "", iconUrl: "", splashUrl: "", tags: ["Marksman"], roles: ["BOTTOM"] as const, archetypes: [] },
    "4": { id: "Lux", key: "4", name: "Lux", title: "", iconUrl: "", splashUrl: "", tags: ["Mage"], roles: ["MIDDLE"] as const, archetypes: [] },
    "5": { id: "Xerath", key: "5", name: "Xerath", title: "", iconUrl: "", splashUrl: "", tags: ["Mage"], roles: ["MIDDLE"] as const, archetypes: [] },
    "6": { id: "Vayne", key: "6", name: "Vayne", title: "", iconUrl: "", splashUrl: "", tags: ["Marksman"], roles: ["BOTTOM"] as const, archetypes: [] },
    "7": { id: "Zed", key: "7", name: "Zed", title: "", iconUrl: "", splashUrl: "", tags: ["Assassin"], roles: ["MIDDLE"] as const, archetypes: [] },
  };
  return {
    patch: "15.10.1",
    champions: champs as unknown as ChampionDb["champions"],
    meta: [],
    archetypeIndex: {},
  } as unknown as ChampionDb;
}

describe("deriveWinConditions", () => {
  it("returns mixed default when no context", () => {
    const out = deriveWinConditions({
      db: mockDb(),
      myChampionKey: null,
      myRole: null,
      allyKeys: [],
      enemyKeys: [],
    });
    expect(out.length).toBeGreaterThan(0);
  });

  it("detects poke-siege enemy comp", () => {
    const out = deriveWinConditions({
      db: mockDb(),
      myChampionKey: "1",
      myRole: "BOTTOM",
      allyKeys: ["1"],
      enemyKeys: ["3", "4", "5"], // Cait + Lux + Xerath = 3 long-range
    });
    expect(out.some((c) => c.text.includes("poke") || c.text.includes("all-ins"))).toBe(true);
  });

  it("flags Vayne as hypercarry needing peel", () => {
    const out = deriveWinConditions({
      db: mockDb(),
      myChampionKey: "6",
      myRole: "BOTTOM",
      allyKeys: ["6", "2"],
      enemyKeys: ["7"],
    });
    expect(out.some((c) => c.text.includes("Vayne") && c.text.includes("peel"))).toBe(true);
  });

  it("caps at 4 conditions max", () => {
    const out = deriveWinConditions({
      db: mockDb(),
      myChampionKey: "6",
      myRole: "BOTTOM",
      allyKeys: ["6", "2", "4"],
      enemyKeys: ["3", "4", "5", "7"],
    });
    expect(out.length).toBeLessThanOrEqual(4);
  });
});
