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

  it("does NOT tell a one-trick to swap off their main (masteries are forwarded)", () => {
    const args = {
      db, currentPickKey: "2", myRole: "MIDDLE" as Role,
      allyKeys: [], enemyKeys: [], bannedKeys: [],
    };
    // Without personal data the D-tier pick loses to the S-tier one...
    expect(suggestTrade(args)).not.toBeNull();
    // ...but an M10 300k main must not be told to swap.
    const result = suggestTrade({
      ...args,
      masteries: [
        { championId: 2, championLevel: 10, championPoints: 300_000, lastPlayTime: 0 },
      ],
      rankTier: null,
    });
    expect(result).toBeNull();
  });

  it("falls back to an i18n key reason when the best pick has no reasons", () => {
    // "1" has no meta row (neutral, no reason); "2" is D-tier. Ranked weights
    // make the gap >= 5% without giving the best pick any reason.
    const noReasonDb: ChampionDb = { ...db, meta: [meta("2", "MIDDLE", "D", 0.46)] };
    const result = suggestTrade({
      db: noReasonDb, currentPickKey: "2", myRole: "MIDDLE",
      allyKeys: [], enemyKeys: [], bannedKeys: [], rankTier: "GOLD",
    });
    expect(result?.proposedChampionKey).toBe("1");
    expect(result?.reason).toBe("trade.reasonDefault");
  });
});
