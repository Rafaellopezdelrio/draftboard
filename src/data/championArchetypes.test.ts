import { describe, it, expect } from "vitest";
import type { Archetype } from "../types/champion";
import { CHAMPION_ARCHETYPES } from "./championArchetypes";
import { CHAMPION_ROLES } from "./championRoles";

const VALID_ARCHETYPES: ReadonlySet<Archetype> = new Set<Archetype>([
  "engage",
  "peel",
  "frontline",
  "poke",
  "burst",
  "sustain-dps",
  "splitpush",
  "pick",
  "wave-clear",
]);

describe("CHAMPION_ARCHETYPES — curated archetype map", () => {
  it("every entry maps to 1-4 valid Archetype values, no duplicates", () => {
    for (const [id, archetypes] of Object.entries(CHAMPION_ARCHETYPES)) {
      expect(archetypes.length, `${id} has no archetypes`).toBeGreaterThan(0);
      expect(archetypes.length, `${id} has too many archetypes`).toBeLessThanOrEqual(4);
      expect(new Set(archetypes).size, `${id} has duplicate archetypes`).toBe(
        archetypes.length
      );
      for (const a of archetypes) {
        expect(VALID_ARCHETYPES.has(a), `${id} has invalid archetype "${a}"`).toBe(true);
      }
    }
  });

  it("covers every champion in CHAMPION_ROLES (coverage guard)", () => {
    const missing = Object.keys(CHAMPION_ROLES).filter(
      (id) => !CHAMPION_ARCHETYPES[id]
    );
    expect(missing, `missing archetypes for: ${missing.join(", ")}`).toEqual([]);
  });

  it("fixes the known tag-inference mistakes", () => {
    // Lulu was inferred as "burst" via her Mage tag — she's an enchanter.
    expect(CHAMPION_ARCHETYPES.Lulu).toEqual(["peel"]);
    // Kennen had no "engage" (not a Tank tag) despite his R being a primary
    // teamfight engage tool.
    expect(CHAMPION_ARCHETYPES.Kennen).toContain("engage");
    // Tahm Kench was tagged "engage" via his Tank tag — his identity is
    // saving allies, not starting fights.
    expect(CHAMPION_ARCHETYPES.TahmKench).not.toContain("engage");
    expect(CHAMPION_ARCHETYPES.TahmKench).toContain("peel");
  });

  it("spot-checks across the roster", () => {
    expect(CHAMPION_ARCHETYPES.Leona).toEqual(["engage", "frontline", "peel"]);
    expect(CHAMPION_ARCHETYPES.Ziggs).toEqual(["poke", "wave-clear", "burst"]);
    expect(CHAMPION_ARCHETYPES.Malphite).toContain("engage");
    expect(CHAMPION_ARCHETYPES.Thresh).toContain("pick");
    expect(CHAMPION_ARCHETYPES.Thresh).toContain("peel");
    expect(CHAMPION_ARCHETYPES.Tryndamere).toContain("splitpush");
    expect(CHAMPION_ARCHETYPES.Khazix).toContain("pick");
    expect(CHAMPION_ARCHETYPES.Soraka).toEqual(["peel"]);
    expect(CHAMPION_ARCHETYPES.Janna).toEqual(["peel"]);
    expect(CHAMPION_ARCHETYPES.Xerath).toContain("poke");
    expect(CHAMPION_ARCHETYPES.Jinx).toContain("sustain-dps");
    expect(CHAMPION_ARCHETYPES.Zed).toContain("burst");
  });
});
