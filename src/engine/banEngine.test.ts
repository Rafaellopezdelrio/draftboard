import { describe, it, expect } from "vitest";
import { suggestBans } from "./banEngine";
import type { ChampionDb, Champion, MetaTier, Role } from "../types/champion";
import type { PersonalMatchupStat } from "../services/matchRepo";

function ch(key: string, name: string): Champion {
  return {
    id: name, key, name, title: "", iconUrl: `${name}.png`, splashUrl: "",
    tags: [], roles: ["MIDDLE"], archetypes: [],
  };
}

function meta(key: string, role: Role, wr: number, tier: MetaTier["tier"] = "S"): MetaTier {
  return { championKey: key, role, tier, winRate: wr, pickRate: 0.05, banRate: 0 };
}

function matchup(opponentChampionId: number, winRate: number, games = 5, position = "MIDDLE"): PersonalMatchupStat {
  return { opponentChampionId, position, winRate, games, wins: Math.round(games * winRate) };
}

const db: ChampionDb = {
  patch: "16.10",
  champions: {
    "1": ch("1", "PersonalNightmare"),
    "2": ch("2", "GlobalSTier"),
    "3": ch("3", "AlsoSTier"),
    "4": ch("4", "DTier"),
  },
  meta: [
    meta("2", "MIDDLE", 0.555, "S"),
    meta("3", "MIDDLE", 0.535, "S"),
    meta("4", "MIDDLE", 0.45, "D"),
  ],
  counters: [],
  fetchedAt: 0,
};

describe("suggestBans", () => {
  it("returns personal nightmare bans first (high severity)", () => {
    const result = suggestBans({
      db,
      role: "MIDDLE",
      matchups: [matchup(1, 0.25, 8)],
      bannedKeys: [],
      pickedKeys: [],
    });
    expect(result[0].source).toBe("personal");
    expect(result[0].severity).toBe("high");
    expect(result[0].championKey).toBe("1");
  });

  it("ignores matchups with fewer than 2 games (noise)", () => {
    const result = suggestBans({
      db,
      role: "MIDDLE",
      matchups: [matchup(1, 0.0, 1)], // 0% WR but only 1 game
      bannedKeys: [],
      pickedKeys: [],
    });
    expect(result.find((s) => s.championKey === "1")).toBeUndefined();
  });

  it("ignores matchups with >=45% WR (not bad enough)", () => {
    const result = suggestBans({
      db,
      role: "MIDDLE",
      matchups: [matchup(1, 0.47, 10)],
      bannedKeys: [],
      pickedKeys: [],
    });
    expect(result.find((s) => s.championKey === "1")).toBeUndefined();
  });

  it("falls through to global S-tier threats when no personal data", () => {
    const result = suggestBans({
      db,
      role: "MIDDLE",
      matchups: [],
      bannedKeys: [],
      pickedKeys: [],
    });
    const keys = result.map((s) => s.championKey);
    expect(keys).toContain("2"); // S-tier mid
    expect(keys).toContain("3"); // S-tier mid
    expect(keys).not.toContain("4"); // D-tier — too weak to ban
  });

  it("excludes already-banned or already-picked champions", () => {
    const result = suggestBans({
      db,
      role: "MIDDLE",
      matchups: [matchup(1, 0.2, 5)],
      bannedKeys: ["2"],
      pickedKeys: ["3"],
    });
    const keys = result.map((s) => s.championKey);
    expect(keys).not.toContain("2");
    expect(keys).not.toContain("3");
  });

  it("respects limit param", () => {
    const result = suggestBans({
      db,
      role: "MIDDLE",
      matchups: [
        matchup(1, 0.1, 5),
        matchup(101, 0.2, 5),
      ],
      bannedKeys: [],
      pickedKeys: [],
      limit: 1,
    });
    expect(result.length).toBeLessThanOrEqual(1);
  });

  it("does NOT suggest global threats when no role is selected", () => {
    const result = suggestBans({
      db,
      role: null,
      matchups: [],
      bannedKeys: [],
      pickedKeys: [],
    });
    // No personal, no role → no global S-tier suggestions
    expect(result.length).toBe(0);
  });

  it("severity escalates with worse personal WR", () => {
    const result = suggestBans({
      db: {
        ...db,
        champions: {
          "10": ch("10", "ChampA"),
          "11": ch("11", "ChampB"),
          "12": ch("12", "ChampC"),
        },
      },
      role: "MIDDLE",
      matchups: [
        matchup(10, 0.28, 5), // high severity (<30%)
        matchup(11, 0.35, 5), // medium severity (30-40%)
        matchup(12, 0.42, 5), // low severity (40-45%)
      ],
      bannedKeys: [],
      pickedKeys: [],
    });
    const a = result.find((s) => s.championKey === "10");
    const b = result.find((s) => s.championKey === "11");
    const c = result.find((s) => s.championKey === "12");
    expect(a?.severity).toBe("high");
    expect(b?.severity).toBe("medium");
    expect(c?.severity).toBe("low");
  });
});
