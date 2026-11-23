import { describe, it, expect, beforeEach } from "vitest";
import { choosePosition, registerChampionIds, settleTeamPositions, __testOnly_resetChampionIds } from "./positionFix";
import type { ChampionDb } from "../types/champion";

const db = {
  champions: {
    "103": { key: "103", id: "Ahri" },
    "84": { key: "84", id: "Akali" },
    "64": { key: "64", id: "LeeSin" },
    "81": { key: "81", id: "Ezreal" },
    "498": { key: "498", id: "Xayah" },
    "122": { key: "122", id: "Darius" },
    "234": { key: "234", id: "Viego" },
    "902": { key: "902", id: "Milio" },
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

describe("settleTeamPositions", () => {
  const team = (rows: Array<[number, string]>, teamId = 100) =>
    rows.map(([championId, riot]) => ({ teamId, championId, riot, position: choosePosition([riot, riot], championId) }));

  it("keeps a real off-meta pick when the fix would leave the team two of a role (Ezreal top, 23/11)", () => {
    const players = team([[81, "TOP"], [234, "JUNGLE"], [84, "MIDDLE"], [498, "BOTTOM"], [902, "UTILITY"]]);
    expect(players[0].position).toBe("BOTTOM"); // what the per-player check says
    expect(settleTeamPositions(players)).toEqual(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]);
  });

  it("still fixes Riot swapping two players (mid Ahri labelled TOP, the top laner labelled MIDDLE)", () => {
    const players = team([[103, "TOP"], [234, "JUNGLE"], [122, "MIDDLE"], [498, "BOTTOM"], [902, "UTILITY"]]);
    expect(settleTeamPositions(players)).toEqual(["MIDDLE", "JUNGLE", "TOP", "BOTTOM", "UTILITY"]);
  });

  it("changes nothing on a complete team, and skips teams without roles (ARAM)", () => {
    const ok = team([[122, "TOP"], [234, "JUNGLE"], [103, "MIDDLE"], [498, "BOTTOM"], [902, "UTILITY"]]);
    expect(settleTeamPositions(ok)).toEqual(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]);
    const aram = team([[122, ""], [234, ""], [103, ""], [498, ""], [902, ""]]);
    expect(settleTeamPositions(aram)).toEqual(["", "", "", "", ""]);
  });

  it("settles each team on its own", () => {
    const players = [
      ...team([[81, "TOP"], [234, "JUNGLE"], [84, "MIDDLE"], [498, "BOTTOM"], [902, "UTILITY"]]),
      ...team([[122, "TOP"], [64, "JUNGLE"], [103, "MIDDLE"], [81, "BOTTOM"], [902, "UTILITY"]], 200),
    ];
    expect(settleTeamPositions(players).slice(5)).toEqual(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]);
    expect(settleTeamPositions(players)[0]).toBe("TOP");
  });
});
