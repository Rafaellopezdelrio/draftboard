import { describe, it, expect } from "vitest";
import { suggestTrade } from "./tradeEngine";
import type { ChampionDb, Champion, MetaTier, Role } from "../types/champion";

function ch(key: string, name: string, roles: Role[] = ["MIDDLE"]): Champion {
  return {
    id: name, key, name, title: "", iconUrl: `${name}.png`, splashUrl: "",
    tags: [], roles, archetypes: [],
  };
}
function meta(key: string, role: Role, tier: MetaTier["tier"], wr = 0.51): MetaTier {
  return { championKey: key, role, tier, winRate: wr, pickRate: 0.1, banRate: 0 };
}

const db: ChampionDb = {
  patch: "16.10",
  champions: {
    "1": ch("1", "Strong"),
    "2": ch("2", "Weak"),
    "3": ch("3", "Decent"),
  },
  meta: [
    meta("1", "MIDDLE", "S", 0.56),
    meta("2", "MIDDLE", "D", 0.46),
    meta("3", "MIDDLE", "B", 0.51),
  ],
  counters: [],
  fetchedAt: 0,
};

describe("suggestTrade", () => {
  it("returns null when no current pick", () => {
    expect(
      suggestTrade({
        db, currentPickKey: null, myRole: "MIDDLE",
        allyKeys: [], enemyKeys: [], bannedKeys: [],
      })
    ).toBeNull();
  });

  it("returns null when no role", () => {
    expect(
      suggestTrade({
        db, currentPickKey: "2", myRole: null,
        allyKeys: [], enemyKeys: [], bannedKeys: [],
      })
    ).toBeNull();
  });

  it("suggests a swap when a much better pick exists", () => {
    const result = suggestTrade({
      db, currentPickKey: "2", myRole: "MIDDLE",
      allyKeys: [], enemyKeys: [], bannedKeys: [],
    });
    expect(result).not.toBeNull();
    expect(result?.proposedChampionKey).toBe("1"); // S-tier
    expect(result?.scoreDelta).toBeGreaterThan(0);
  });

  it("does NOT suggest swap when current pick is already best", () => {
    const result = suggestTrade({
      db, currentPickKey: "1", myRole: "MIDDLE",
      allyKeys: [], enemyKeys: [], bannedKeys: [],
    });
    expect(result).toBeNull();
  });

  it("does NOT suggest swap when delta is too small (<5%)", () => {
    // Custom db where Decent and Strong are very close
    const closeDb: ChampionDb = {
      ...db,
      meta: [
        meta("1", "MIDDLE", "A", 0.515),
        meta("3", "MIDDLE", "A", 0.513), // basically tied
      ],
    };
    const result = suggestTrade({
      db: closeDb, currentPickKey: "3", myRole: "MIDDLE",
      allyKeys: [], enemyKeys: [], bannedKeys: [],
    });
    expect(result).toBeNull();
  });
});
