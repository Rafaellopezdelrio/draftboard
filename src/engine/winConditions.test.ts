import { describe, it, expect } from "vitest";
import { deriveWinConditions } from "./winConditions";
import type { ChampionDb, Role } from "../types/champion";
import es from "../i18n/locales/es.json";

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
    expect(out.some((c) => c.key === "winConditions.rules.enemyPokeSiege")).toBe(true);
  });

  it("flags Vayne as hypercarry needing peel", () => {
    const out = deriveWinConditions({
      db: mockDb(),
      myChampionKey: "6",
      myRole: "BOTTOM",
      allyKeys: ["6", "2"],
      enemyKeys: ["7"],
    });
    expect(
      out.some(
        (c) => c.key === "winConditions.rules.myHypercarry" && c.params?.name === "Vayne"
      )
    ).toBe(true);
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

  it("adds an ADC positioning read for a bottom-laner", () => {
    const out = deriveWinConditions({
      db: mockDb(),
      myChampionKey: "1",
      myRole: "BOTTOM",
      allyKeys: ["1"],
      enemyKeys: ["7"], // Zed
    });
    expect(out.some((c) => c.key.startsWith("winConditions.rules.roleAdc"))).toBe(true);
  });

  it("gives a jungle tempo tip tied to the comp", () => {
    const out = deriveWinConditions({
      db: mockDb(),
      myChampionKey: null,
      myRole: "JUNGLE",
      allyKeys: ["1"],
      enemyKeys: ["3"],
    });
    expect(out.some((c) => c.key.startsWith("winConditions.rules.roleJungle"))).toBe(true);
  });

  it("gives no role tip when role is null", () => {
    const out = deriveWinConditions({
      db: mockDb(),
      myChampionKey: null,
      myRole: null,
      allyKeys: ["1"],
      enemyKeys: ["3"],
    });
    expect(out.some((c) => c.key.includes(".rules.role"))).toBe(false);
  });

  describe("laner macro advice vs role", () => {
    function roleDb(): ChampionDb {
      const base = mockDb();
      const extra = {
        "10": { id: "Hecarim", key: "10", name: "Hecarim", tags: ["Fighter"] },
        "11": { id: "JarvanIV", key: "11", name: "Jarvan IV", tags: ["Fighter"] },
        "12": { id: "Camille", key: "12", name: "Camille", tags: ["Fighter"] },
        "13": { id: "KogMaw", key: "13", name: "Kog'Maw", tags: ["Marksman"] },
      };
      return {
        ...base,
        champions: { ...base.champions, ...extra } as unknown as ChampionDb["champions"],
      } as ChampionDb;
    }
    const keysFor = (role: Role | null) =>
      deriveWinConditions({
        db: roleDb(),
        myChampionKey: null,
        myRole: role,
        allyKeys: ["6", "13"], // Vayne + Kog'Maw = scaling-late
        enemyKeys: ["10", "11", "12"], // Hecarim + J4 + Camille = early-skirmish
      }).map((c) => c.key);

    it("jungler gets neither 'play the first wave safe' nor 'stack CS'", () => {
      const keys = keysFor("JUNGLE");
      expect(keys).not.toContain("winConditions.rules.enemyEarlySkirmish");
      expect(keys).not.toContain("winConditions.rules.allyScalingLate");
      expect(keys).toContain("winConditions.rules.roleJungleScaling");
    });

    it("support is not told to stack CS", () => {
      const keys = keysFor("UTILITY");
      expect(keys).not.toContain("winConditions.rules.allyScalingLate");
      expect(keys).toContain("winConditions.rules.enemyEarlySkirmish");
    });

    it.each(["TOP", "MIDDLE", "BOTTOM", null] as const)("%s keeps the laner advice", (role) => {
      const keys = keysFor(role);
      expect(keys).toContain("winConditions.rules.enemyEarlySkirmish");
      expect(keys).toContain("winConditions.rules.allyScalingLate");
    });
  });

  it("every emitted key resolves to a real translation (no orphan keys)", () => {
    // Sweep many comp/role permutations, collect every key the engine can
    // emit, and assert each one exists in es.json. Guards against an engine
    // branch pointing at a key nobody added to the locale bundle.
    const rules = (es as { winConditions: { rules: Record<string, string> } })
      .winConditions.rules;
    const roles: (Role | null)[] = [
      null,
      "TOP",
      "JUNGLE",
      "MIDDLE",
      "BOTTOM",
      "UTILITY",
    ];
    const champKeys = [null, "1", "2", "3", "4", "5", "6", "7"];
    const enemySets = [[], ["3", "4", "5"], ["7"], ["3"], ["1", "6"], ["2"]];
    const seen = new Set<string>();
    for (const role of roles)
      for (const ck of champKeys)
        for (const en of enemySets)
          for (const al of enemySets) {
            for (const c of deriveWinConditions({
              db: mockDb(),
              myChampionKey: ck,
              myRole: role,
              allyKeys: al,
              enemyKeys: en,
            })) {
              seen.add(c.key);
            }
          }
    const orphans = [...seen].filter(
      (k) => !(k.replace("winConditions.rules.", "") in rules)
    );
    expect(orphans).toEqual([]);
    expect(seen.size).toBeGreaterThan(10); // sanity: we actually exercised many
  });
});
