// Regression tests for the ARAM-CHAOS "picks invisible" bug.
//
// Original failure mode: when the LCU emitted an ARAM session payload
// (no `bans` field), applySession() crashed on `s.bans.myTeamBans` at the
// end of the function. The crash was silently swallowed by Tauri's event
// listener wrapper, so the only visible symptom was that the next
// session update never made it into the store — picks stayed empty.
//
// These tests pin down the defensive guards so an ARAM-shaped payload
// always writes picks into the draftStore.

import { describe, it, expect, beforeEach } from "vitest";
import { __testOnly_applySession as applySession } from "./lcuSync";
import { useDraftStore } from "./draftStore";

const player = (cellId: number, championId: number, opts: Partial<Record<string, unknown>> = {}) => ({
  cellId,
  championId,
  championPickIntent: 0,
  assignedPosition: "",
  summonerId: 1000 + cellId,
  ...opts,
});

describe("lcuSync.applySession — defensive parsing", () => {
  beforeEach(() => {
    useDraftStore.getState().reset();
  });

  it("is a no-op when payload is null (Delete event from LCU)", () => {
    expect(() => applySession(null)).not.toThrow();
    const s = useDraftStore.getState();
    expect(s.ally.every((slot) => slot.championKey === null)).toBe(true);
    expect(s.enemy.every((slot) => slot.championKey === null)).toBe(true);
  });

  it("is a no-op when payload is undefined", () => {
    expect(() => applySession(undefined)).not.toThrow();
  });

  it("ARAM session with no bans field still writes picks (the regression)", () => {
    // Howling Abyss session: 5 vs 5, all locked, NO bans object at all.
    const aramSession = {
      localPlayerCellId: 2,
      myTeam: [
        player(0, 266), // Aatrox
        player(1, 157), // Yasuo
        player(2, 64), // Lee Sin
        player(3, 81), // Ezreal
        player(4, 412), // Thresh
      ],
      theirTeam: [
        player(5, 23),
        player(6, 99),
        player(7, 91),
        player(8, 51),
        player(9, 25),
      ],
      // bans intentionally missing — this is what crashed before.
    } as unknown as Parameters<typeof applySession>[0];

    expect(() => applySession(aramSession)).not.toThrow();
    const s = useDraftStore.getState();
    expect(s.ally.map((sl) => sl.championKey)).toEqual([
      "266", "157", "64", "81", "412",
    ]);
    expect(s.enemy.map((sl) => sl.championKey)).toEqual([
      "23", "99", "91", "51", "25",
    ]);
  });

  it("ARAM CHAOS (user on enemy side) — picks still mapped correctly", () => {
    // LCU's `myTeam` is always the local user's team, regardless of which
    // map side (ORDER vs CHAOS) they're on. Verify we don't accidentally
    // flip them when the user is on CHAOS.
    const session = {
      localPlayerCellId: 5, // user cell is in myTeam[0]
      myTeam: [
        player(5, 64),
        player(6, 23),
        player(7, 99),
        player(8, 91),
        player(9, 51),
      ],
      theirTeam: [
        player(0, 266),
        player(1, 157),
        player(2, 64),
        player(3, 81),
        player(4, 412),
      ],
    } as unknown as Parameters<typeof applySession>[0];

    applySession(session);
    const s = useDraftStore.getState();
    expect(s.ally[0].championKey).toBe("64"); // user's pick
    expect(s.enemy[0].championKey).toBe("266");
  });

  it("missing theirTeam (mid-transition frame) doesn't crash, just leaves enemy slots", () => {
    const partial = {
      localPlayerCellId: 0,
      myTeam: [player(0, 266)],
    } as unknown as Parameters<typeof applySession>[0];

    expect(() => applySession(partial)).not.toThrow();
    const s = useDraftStore.getState();
    expect(s.ally[0].championKey).toBe("266");
  });

  it("bans with missing arrays inside (partial bans object) survives", () => {
    const session = {
      localPlayerCellId: 0,
      myTeam: [player(0, 266)],
      theirTeam: [],
      bans: { myTeamBans: undefined, theirTeamBans: undefined },
    } as unknown as Parameters<typeof applySession>[0];
    expect(() => applySession(session)).not.toThrow();
    expect(useDraftStore.getState().ally[0].championKey).toBe("266");
  });

  it("intent fallback fires when championId is 0 but pickIntent is set", () => {
    // Blind pick / ARAM hover before lock: championId=0, intent has the
    // hover champion. We want to see that hover so users can prep counters.
    const session = {
      localPlayerCellId: 0,
      myTeam: [player(0, 0, { championPickIntent: 64 })],
      theirTeam: [],
    } as unknown as Parameters<typeof applySession>[0];
    applySession(session);
    expect(useDraftStore.getState().ally[0].championKey).toBe("64");
  });

  it("normal SR session with bans still works after refactor", () => {
    const sr = {
      localPlayerCellId: 0,
      myTeam: [player(0, 266)],
      theirTeam: [player(5, 23)],
      bans: { myTeamBans: [1, 2], theirTeamBans: [3, 4] },
    } as unknown as Parameters<typeof applySession>[0];
    applySession(sr);
    const s = useDraftStore.getState();
    expect(s.ally[0].championKey).toBe("266");
    expect(s.enemy[0].championKey).toBe("23");
    expect(s.bans.ally[0]).toBe("1");
    expect(s.bans.enemy[1]).toBe("4");
  });
});
