// Locks down CHAMPION_ROLES against silent regressions that produce
// nonsense recommendations. The role-override useEffect in App.tsx relies on
// these arrays being non-empty for every champion users actually play; if
// a champion is missing here entirely, the override never fires and a
// support-flagged Kha'Zix gets recommended Ignite again.

import { describe, it, expect } from "vitest";
import { CHAMPION_ROLES } from "./championRoles";

const ROLES = new Set(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]);

describe("CHAMPION_ROLES", () => {
  it("covers the popular pool used in regression tests (Vayne, Kha'Zix, Zilean)", () => {
    expect(CHAMPION_ROLES.Vayne).toBeDefined();
    expect(CHAMPION_ROLES.Khazix).toBeDefined();
    expect(CHAMPION_ROLES.Zilean).toBeDefined();
  });

  it("every champion has at least one role", () => {
    for (const [champ, roles] of Object.entries(CHAMPION_ROLES)) {
      expect(roles.length, `${champ} has zero roles`).toBeGreaterThan(0);
    }
  });

  it("every listed role is one of the 5 canonical roles", () => {
    for (const [champ, roles] of Object.entries(CHAMPION_ROLES)) {
      for (const r of roles) {
        expect(ROLES.has(r), `${champ} has invalid role ${r}`).toBe(true);
      }
    }
  });

  it("no duplicate roles per champion", () => {
    for (const [champ, roles] of Object.entries(CHAMPION_ROLES)) {
      expect(new Set(roles).size, `${champ} has duplicates`).toBe(roles.length);
    }
  });

  it("Kha'Zix is JUNGLE-only (the bug regression case)", () => {
    // Was tagged UTILITY by Riot tags → would recommend support items/spells.
    // App.tsx role override useEffect depends on this being JUNGLE-only.
    expect(CHAMPION_ROLES.Khazix).toEqual(["JUNGLE"]);
  });

  it("Vayne is multi-role (BOTTOM + TOP) so flex picks don't trigger override", () => {
    expect(CHAMPION_ROLES.Vayne).toContain("BOTTOM");
    expect(CHAMPION_ROLES.Vayne).toContain("TOP");
  });

  it("Zilean is UTILITY-only despite Mage tag", () => {
    expect(CHAMPION_ROLES.Zilean).toEqual(["UTILITY"]);
  });

  it("supports the major support pool (Alistar, Bard, Braum, Blitzcrank)", () => {
    for (const sup of ["Alistar", "Bard", "Braum", "Blitzcrank"]) {
      expect(CHAMPION_ROLES[sup], `${sup} missing`).toContain("UTILITY");
    }
  });

  it("supports the major jungle pool (Belveth, Briar)", () => {
    expect(CHAMPION_ROLES.Belveth).toContain("JUNGLE");
    expect(CHAMPION_ROLES.Briar).toContain("JUNGLE");
  });

  it("primary role (index 0) is the most-played role per championDB convention", () => {
    // App.tsx falls back to allowedRoles[0] when the user has no role.
    // Some flex picks pre-Ambessa fix had MIDDLE listed first when JUNGLE
    // was the dominant role; this test pins primary role for ambiguous cases.
    expect(CHAMPION_ROLES.Akali[0]).toBe("MIDDLE");
    expect(CHAMPION_ROLES.Aurora[0]).toBe("MIDDLE");
    expect(CHAMPION_ROLES.Camille[0]).toBe("TOP");
  });
});
