// Tests the Riot codename → Spanish label mapping.
//
// Regression target: the user saw "LIVE · KIWI" in the Live panel because
// Riot ships new modes under fruit codenames (CHERRY=Arena, STRAWBERRY=Swarm,
// KIWI=Brawl) before assigning final names. We translate these so the UI
// never leaks Riot's internal vocabulary.

import { describe, it, expect } from "vitest";
import { displayGameMode, GAME_MODE_NAMES } from "./gameModeNames";

describe("displayGameMode", () => {
  it("translates KIWI → Brawl (the regression case)", () => {
    expect(displayGameMode("KIWI")).toBe("Brawl");
  });

  it("translates the fruit-codename family (CHERRY/STRAWBERRY/KIWI)", () => {
    expect(displayGameMode("CHERRY")).toBe("Arena");
    expect(displayGameMode("STRAWBERRY")).toBe("Swarm");
    expect(displayGameMode("KIWI")).toBe("Brawl");
  });

  it("keeps ARAM as ARAM (already user-friendly)", () => {
    expect(displayGameMode("ARAM")).toBe("ARAM");
  });

  it("classic SR maps to 'Grieta'", () => {
    expect(displayGameMode("CLASSIC")).toBe("Grieta");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(displayGameMode("kiwi")).toBe("Brawl");
    expect(displayGameMode("  Aram  ")).toBe("ARAM");
  });

  it("falls back to the uppercased raw string for unknown modes", () => {
    // Future-proof: when Riot drops a new mode "MANGO" before we update the
    // table, the UI should show "MANGO" rather than empty/undefined.
    expect(displayGameMode("MANGO")).toBe("MANGO");
  });

  it("returns 'Partida' for null/undefined/empty", () => {
    expect(displayGameMode(null)).toBe("Partida");
    expect(displayGameMode(undefined)).toBe("Partida");
    expect(displayGameMode("")).toBe("Partida");
  });

  it("covers all major live modes without throwing", () => {
    for (const k of Object.keys(GAME_MODE_NAMES)) {
      expect(displayGameMode(k)).toBe(GAME_MODE_NAMES[k]);
    }
  });
});
