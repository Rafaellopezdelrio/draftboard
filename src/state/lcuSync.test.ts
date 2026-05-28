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

  it("null session CLEARS a populated board (dodge / queue exit / game start)", () => {
    // Seed a full draft + local selection + phase.
    applySession({
      localPlayerCellId: 0,
      myTeam: [player(0, 266), player(1, 157)],
      theirTeam: [player(5, 23)],
      bans: { myTeamBans: [1, 2], theirTeamBans: [3, 4] },
      timer: { phase: "BAN_PICK", adjustedTimeLeftInPhase: 30000 },
    } as unknown as Parameters<typeof applySession>[0]);
    const seeded = useDraftStore.getState();
    expect(seeded.ally[0].championKey).toBe("266");
    expect(seeded.bans.ally[0]).toBe("1");
    expect(seeded.myChampionLocked).toBe("266");
    expect(seeded.phase).toBe("BAN_PICK");

    // Leaving champ select → null payload → board fully wiped so the dead
    // draft doesn't linger on screen. myRole is the only field preserved.
    applySession(null);
    const s = useDraftStore.getState();
    expect(s.ally.every((sl) => sl.championKey === null)).toBe(true);
    expect(s.enemy.every((sl) => sl.championKey === null)).toBe(true);
    expect(s.bans.ally.every((b) => !b)).toBe(true);
    expect(s.bans.enemy.every((b) => !b)).toBe(true);
    expect(s.myChampionLocked).toBe(null);
    expect(s.myChampionIntent).toBe(null);
    expect(s.myCellId).toBe(null);
    expect(s.phase).toBe(null);
    expect(s.enemySummonerIds).toEqual([]);
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

  it("BLIND PICK: myTeam fields stay 0 but actions[][] has the pick → still rendered", () => {
    // Regression for blind-pick bug — Riot's queue 430 leaves
    // myTeam[].championId AND championPickIntent at 0 while the pick
    // action holds the real champion. We must fall back to actions[][].
    const blind = {
      localPlayerCellId: 2,
      myTeam: [
        player(0, 0),
        player(1, 0),
        player(2, 0), // me, blind pick — myTeam fields all zero
        player(3, 0),
        player(4, 0),
      ],
      theirTeam: [player(5, 0), player(6, 0), player(7, 0), player(8, 0), player(9, 0)],
      actions: [
        // hovers + locks come on actorCellId
        [
          { type: "pick", actorCellId: 2, championId: 266, completed: false, id: 1 }, // me hover
          { type: "pick", actorCellId: 0, championId: 157, completed: true, id: 2 },  // ally locked
          { type: "pick", actorCellId: 5, championId: 64, completed: true, id: 3 },   // enemy locked
        ],
      ],
      bans: { myTeamBans: [], theirTeamBans: [] }, // explicit empty so the
      // post-pick preservation guard doesn't return early
    } as unknown as Parameters<typeof applySession>[0];

    applySession(blind);
    const s = useDraftStore.getState();
    expect(s.ally[2].championKey).toBe("266"); // me — from actions hover
    expect(s.ally[0].championKey).toBe("157"); // ally — from actions lock
    expect(s.enemy[0].championKey).toBe("64"); // enemy — from actions lock
  });

  it("BLIND PICK: locked over hover when both present for same cell", () => {
    const blind = {
      localPlayerCellId: 0,
      myTeam: [player(0, 0)],
      theirTeam: [],
      actions: [
        [
          { type: "pick", actorCellId: 0, championId: 266, completed: false, id: 1 }, // hover
          { type: "pick", actorCellId: 0, championId: 157, completed: true, id: 2 },  // locked
        ],
      ],
      bans: { myTeamBans: [], theirTeamBans: [] },
    } as unknown as Parameters<typeof applySession>[0];

    applySession(blind);
    expect(useDraftStore.getState().ally[0].championKey).toBe("157");
  });

  it("transition frame (no bans field, no actions) preserves previously-set bans", () => {
    // Regression for surrender-vote / post-pick frame: LCU sometimes
    // pushes a frame with neither s.bans nor s.actions while the user
    // is still in champ select. Naively iterating 5 slots and writing
    // null would nuke bans the user can still see in the client.
    //
    // First frame: real ban data lands.
    const realFrame = {
      localPlayerCellId: 0,
      myTeam: [player(0, 266)],
      theirTeam: [player(5, 23)],
      bans: { myTeamBans: [1, 2, 3, 4, 5], theirTeamBans: [6, 7, 8, 9, 10] },
    } as unknown as Parameters<typeof applySession>[0];
    applySession(realFrame);
    expect(useDraftStore.getState().bans.ally[0]).toBe("1");

    // Second frame: transition — bans field gone, actions[] empty.
    // Without the preservation guard the store would clear all 5 bans.
    const transitionFrame = {
      localPlayerCellId: 0,
      myTeam: [player(0, 266)],
      theirTeam: [player(5, 23)],
      // bans + actions intentionally absent
    } as unknown as Parameters<typeof applySession>[0];
    applySession(transitionFrame);
    const after = useDraftStore.getState();
    expect(after.bans.ally[0]).toBe("1"); // preserved
    expect(after.bans.enemy[4]).toBe("10"); // preserved
  });
});
