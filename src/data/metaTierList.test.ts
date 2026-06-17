import { describe, it, expect } from "vitest";
import { buildMetaList } from "./metaTierList";

// Minimal champion db: id -> { id, key } as buildMetaList consumes it.
function db(entries: Array<[id: string, key: string]>) {
  const out: Record<string, { id: string; key: string }> = {};
  for (const [id, key] of entries) out[id] = { id, key };
  return out;
}

describe("buildMetaList (static meta fallback)", () => {
  it("maps a curated row to a MetaTier with the db's numeric key", () => {
    const list = buildMetaList(db([["Aatrox", "266"]]));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      championKey: "266",
      role: "TOP",
      tier: "S",
    });
  });

  it("translates tier → win rate (S=0.54, A=0.52, B=0.50)", () => {
    const list = buildMetaList(
      db([
        ["Aatrox", "266"], // TOP S
        ["Garen", "86"], //  TOP A
        ["Renekton", "58"], // TOP B
      ])
    );
    const byKey = Object.fromEntries(list.map((m) => [m.championKey, m.winRate]));
    expect(byKey["266"]).toBe(0.54);
    expect(byKey["86"]).toBe(0.52);
    expect(byKey["58"]).toBe(0.5);
  });

  it("gives every entry a non-zero pickRate so the strict role filter keeps it", () => {
    // Regression: pickRate 0 would make suggestionEngine's role filter reject
    // every curated champ and fall back to loose tag inference.
    const list = buildMetaList(db([["Yasuo", "157"], ["Lulu", "117"]]));
    expect(list.length).toBeGreaterThan(0);
    for (const m of list) expect(m.pickRate).toBeGreaterThan(0);
  });

  it("skips curated champions that aren't in the loaded db", () => {
    // Only Yasuo is known; the rest of ROWS resolve to no key → dropped.
    const list = buildMetaList(db([["Yasuo", "157"]]));
    expect(list).toHaveLength(1);
    expect(list[0].championKey).toBe("157");
  });

  it("ignores db champions that aren't in the curated list", () => {
    // "Teemo" isn't in ROWS, so it never appears.
    const list = buildMetaList(db([["Teemo", "17"], ["Ahri", "103"]]));
    expect(list.map((m) => m.championKey)).toEqual(["103"]);
  });

  it("returns an empty list for an empty db", () => {
    expect(buildMetaList(db([]))).toEqual([]);
  });
});
