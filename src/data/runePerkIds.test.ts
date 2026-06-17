import { describe, it, expect } from "vitest";
import { lookupPerkId, RUNE_NAME_TO_PERK_ID } from "./runePerkIds";

describe("lookupPerkId", () => {
  it("resolves an exact rune name to its perk id", () => {
    expect(lookupPerkId("Press the Attack")).toBe(8005);
    expect(lookupPerkId("Lethal Tempo")).toBe(8008);
  });

  it("matches case-insensitively (scraped names vary in casing)", () => {
    expect(lookupPerkId("press the attack")).toBe(8005);
    expect(lookupPerkId("ATTACK SPEED")).toBe(5005);
  });

  it("resolves Spanish-locale rune names (op.gg es scrape)", () => {
    expect(lookupPerkId("Fuerza Adaptable")).toBe(5008);
  });

  it("returns null for undefined / empty / unknown names", () => {
    expect(lookupPerkId(undefined)).toBeNull();
    expect(lookupPerkId("")).toBeNull();
    expect(lookupPerkId("Totally Not A Rune")).toBeNull();
  });

  it("every mapped id is a positive integer (no placeholder zeros)", () => {
    for (const [name, id] of Object.entries(RUNE_NAME_TO_PERK_ID)) {
      expect(Number.isInteger(id), `${name} → ${id}`).toBe(true);
      expect(id, name).toBeGreaterThan(0);
    }
  });
});
