import { describe, it, expect, beforeEach } from "vitest";
import { rosterFromGameflow, applyGameflowRoster } from "./gameflowRoster";
import { useDraftStore } from "./draftStore";

const p = (championId: number, puuid = "") => ({ championId, puuid });

describe("rosterFromGameflow — defensive parsing + side resolution", () => {
  it("orients ally = the local player's team (me on teamTwo)", () => {
    const r = rosterFromGameflow(
      {
        teamOne: [p(99), p(64)],
        teamTwo: [p(72, "ME"), p(157)],
      },
      { puuid: "ME" }
    );
    expect(r).toEqual({ allyIds: [72, 157], enemyIds: [99, 64] });
  });

  it("returns null when the local player is on NEITHER team (never guesses the side)", () => {
    const r = rosterFromGameflow(
      { teamOne: [p(99, "A")], teamTwo: [p(72, "B")] },
      { puuid: "ME" }
    );
    expect(r).toBeNull();
  });

  it("skips championId <= 0 entries (anonymized/unfilled slots)", () => {
    const r = rosterFromGameflow(
      { teamOne: [p(0, "ME"), p(64)], teamTwo: [p(0), p(-1)] },
      { puuid: "ME" }
    );
    expect(r).toEqual({ allyIds: [64], enemyIds: [] });
  });

  it("returns null for missing/empty gameData or all-zero championIds", () => {
    expect(rosterFromGameflow(undefined, { puuid: "ME" })).toBeNull();
    expect(rosterFromGameflow({}, { puuid: "ME" })).toBeNull();
    expect(
      rosterFromGameflow({ teamOne: [p(0, "ME")], teamTwo: [p(0)] }, { puuid: "ME" })
    ).toBeNull();
  });

  it("resolves the side by summonerId when puuid is absent", () => {
    const r = rosterFromGameflow(
      {
        teamOne: [{ championId: 99, summonerId: 42 }],
        teamTwo: [{ championId: 72, summonerId: 7 }],
      },
      { summonerId: 42 }
    );
    expect(r).toEqual({ allyIds: [99], enemyIds: [72] });
  });
});

describe("applyGameflowRoster — fills ONLY an empty board", () => {
  beforeEach(() => {
    useDraftStore.getState().reset();
  });

  it("fills ally + enemy slots from the roster when the board is empty", () => {
    const wrote = applyGameflowRoster({ allyIds: [72, 64], enemyIds: [99] });
    expect(wrote).toBe(true);
    const s = useDraftStore.getState();
    expect(s.ally[0].championKey).toBe("72");
    expect(s.ally[1].championKey).toBe("64");
    expect(s.enemy[0].championKey).toBe("99");
  });

  it("never overwrites a populated board (champ-select truth wins)", () => {
    useDraftStore.getState().setPick("ally", 0, "266");
    const wrote = applyGameflowRoster({ allyIds: [72], enemyIds: [99] });
    expect(wrote).toBe(false);
    const s = useDraftStore.getState();
    expect(s.ally[0].championKey).toBe("266");
    expect(s.enemy[0].championKey).toBe(null);
  });

  it("is a no-op for a null roster", () => {
    expect(applyGameflowRoster(null)).toBe(false);
  });
});
