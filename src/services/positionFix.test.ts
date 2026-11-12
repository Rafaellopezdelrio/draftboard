import { describe, it, expect, beforeEach } from "vitest";
import { choosePosition, registerChampionIds, __testOnly_resetChampionIds } from "./positionFix";
import type { ChampionDb } from "../types/champion";

const db = {
  champions: {
    "103": { key: "103", id: "Ahri" },
    "84": { key: "84", id: "Akali" },
    "64": { key: "64", id: "LeeSin" },
  },
} as unknown as ChampionDb;

beforeEach(() => {
  __testOnly_resetChampionIds();
  registerChampionIds(db);
});

describe("choosePosition", () => {
  it("a mid-only champion that Riot labels TOP is stored as MIDDLE (the reported Ahri case)", () => {
    expect(choosePosition(["TOP"], 103)).toBe("MIDDLE");
    expect(choosePosition(["TOP", "TOP"], "103")).toBe("MIDDLE");
  });

  it("prefers the second Riot signal when it fits and the first does not", () => {
    expect(choosePosition(["JUNGLE", "TOP"], 84)).toBe("TOP");
  });

  it("keeps a real off-role pick for a champion played in several roles", () => {
    expect(choosePosition(["UTILITY"], 84)).toBe("UTILITY");
  });

  it("keeps Riot's position when it fits", () => {
    expect(choosePosition(["JUNGLE"], 64)).toBe("JUNGLE");
    expect(choosePosition(["MIDDLE"], 103)).toBe("MIDDLE");
  });

  it("normalizes old lane names and returns empty without a signal", () => {
    expect(choosePosition(["mid"], 103)).toBe("MIDDLE");
    expect(choosePosition(["", null, undefined, "NONE"], 103)).toBe("");
  });

  it("unknown champion (list not loaded yet): Riot's value as is", () => {
    __testOnly_resetChampionIds();
    expect(choosePosition(["TOP"], 103)).toBe("TOP");
  });
});
