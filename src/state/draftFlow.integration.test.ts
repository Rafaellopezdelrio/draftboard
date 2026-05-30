// Integration test for the CORE draft loop, end to end:
//
//   LCU champ-select session  →  applySession()  →  draftStore
//     →  App-style key derivation  →  suggest() engine
//
// Every bug this layer produced in practice lived in the WIRING between
// these steps (live champion vs suggestion, blind-pick actions[][] not
// reaching the store, board not clearing on leave), and none was covered by
// the per-unit tests. This locks the whole chain across draft + blind pick +
// the role-null cold start so those regressions can't come back silently.

import { describe, it, expect, beforeEach } from "vitest";
import { __testOnly_applySession as applySession } from "./lcuSync";
import { useDraftStore } from "./draftStore";
import { suggest } from "../engine/suggestionEngine";
import type { Champion, ChampionDb, MetaTier, Role } from "../types/champion";

function champ(key: string, name: string, roles: Role[]): Champion {
  return {
    id: name.replace(/\s/g, ""),
    key,
    name,
    title: "",
    iconUrl: "",
    splashUrl: "",
    tags: [],
    roles,
    archetypes: [],
  };
}

function meta(championKey: string, role: Role, tier: MetaTier["tier"] = "A"): MetaTier {
  return { championKey, role, tier, winRate: 0.51, pickRate: 0.05, banRate: 0 };
}

// Champion keys used below.
const ZED = "238";
const YASUO = "157";
const ORIANNA = "61";
const ANNIE = "1";
const VIKTOR = "112";
const AATROX = "266";
const LEE = "64";

const db: ChampionDb = {
  patch: "16.10",
  champions: {
    [ZED]: champ(ZED, "Zed", ["MIDDLE"]),
    [YASUO]: champ(YASUO, "Yasuo", ["MIDDLE"]),
    [ORIANNA]: champ(ORIANNA, "Orianna", ["MIDDLE"]),
    [ANNIE]: champ(ANNIE, "Annie", ["MIDDLE"]),
    [VIKTOR]: champ(VIKTOR, "Viktor", ["MIDDLE"]),
    [AATROX]: champ(AATROX, "Aatrox", ["TOP"]),
    [LEE]: champ(LEE, "Lee Sin", ["JUNGLE"]),
  },
  counters: [],
  meta: [
    meta(ORIANNA, "MIDDLE", "S"),
    meta(ANNIE, "MIDDLE", "A"),
    meta(VIKTOR, "MIDDLE", "A"),
  ],
  fetchedAt: Date.now(),
};

const player = (cellId: number, championId: number, opts: Record<string, unknown> = {}) => ({
  cellId,
  championId,
  championPickIntent: 0,
  assignedPosition: "",
  summonerId: 1000 + cellId,
  ...opts,
});

// Mirror of App's useDraftDerivations — pull the keys the engine consumes
// straight out of the store, exactly as the real app does.
function deriveKeys() {
  const s = useDraftStore.getState();
  const allyKeys = s.ally.map((x) => x.championKey).filter((k): k is string => !!k);
  const enemyKeys = s.enemy.map((x) => x.championKey).filter((k): k is string => !!k);
  const bannedKeys = [...s.bans.ally, ...s.bans.enemy].filter((k): k is string => !!k);
  return { allyKeys, enemyKeys, bannedKeys };
}

describe("core draft flow — session → store → suggest", () => {
  beforeEach(() => useDraftStore.getState().reset());

  it("DRAFT: enemy/ally picks + bans reach the store and are excluded from suggestions", () => {
    // I'm MIDDLE (cell 0). Ally locked Aatrox top, enemy locked Zed mid,
    // both teams have a ban.
    applySession({
      localPlayerCellId: 0,
      myTeam: [player(0, 0, { assignedPosition: "MIDDLE" }), player(1, Number(AATROX))],
      theirTeam: [player(5, Number(ZED))],
      bans: { myTeamBans: [Number(YASUO)], theirTeamBans: [] },
    } as unknown as Parameters<typeof applySession>[0]);

    const { allyKeys, enemyKeys, bannedKeys } = deriveKeys();
    expect(allyKeys).toContain(AATROX);
    expect(enemyKeys).toContain(ZED);
    expect(bannedKeys).toContain(YASUO);

    const sugg = suggest({ db, role: "MIDDLE", allyKeys, enemyKeys, bannedKeys });
    expect(sugg.length).toBeGreaterThan(0);
    const keys = sugg.map((s) => s.champion.key);
    // Taken (picked + banned) champs must never be suggested.
    for (const k of [...allyKeys, ...enemyKeys, ...bannedKeys]) {
      expect(keys).not.toContain(k);
    }
    // The available MIDDLE meta champs should surface.
    expect(keys).toContain(ORIANNA);
  });

  it("BLIND PICK: actions[][] picks flow end to end into suggestions", () => {
    // Queue 430: myTeam/theirTeam championId stay 0; the real pick lives in
    // actions[][]. This proves the fallback reaches the store + engine, not
    // just the unit-level parse.
    applySession({
      localPlayerCellId: 2,
      myTeam: [player(2, 0, { assignedPosition: "MIDDLE" })],
      theirTeam: [player(5, 0), player(6, 0)],
      actions: [
        [
          { type: "pick", actorCellId: 5, championId: Number(ZED), completed: true, id: 1 },
          { type: "pick", actorCellId: 6, championId: Number(AATROX), completed: true, id: 2 },
        ],
      ],
      bans: { myTeamBans: [], theirTeamBans: [] },
    } as unknown as Parameters<typeof applySession>[0]);

    const { enemyKeys } = deriveKeys();
    expect(enemyKeys).toContain(ZED);
    expect(enemyKeys).toContain(AATROX);

    const sugg = suggest({ db, role: "MIDDLE", allyKeys: [], enemyKeys, bannedKeys: [] });
    expect(sugg.length).toBeGreaterThan(0);
    expect(sugg.map((s) => s.champion.key)).not.toContain(ZED);
  });

  it("COLD START (no role, no draft): still returns meta-general suggestions", () => {
    // First thing the user sees before any pick / role assignment.
    const sugg = suggest({ db, role: null, allyKeys: [], enemyKeys: [], bannedKeys: [] });
    expect(sugg.length).toBeGreaterThan(0);
  });

  it("LEAVE: an empty session clears the board so stale picks don't bleed into the next game", () => {
    applySession({
      localPlayerCellId: 0,
      myTeam: [player(0, Number(ORIANNA), { assignedPosition: "MIDDLE" })],
      theirTeam: [player(5, Number(ZED))],
      bans: { myTeamBans: [Number(YASUO)], theirTeamBans: [] },
    } as unknown as Parameters<typeof applySession>[0]);
    expect(deriveKeys().enemyKeys).toContain(ZED);

    // Leave (Rust delivers an emptied object, cell -1).
    applySession({
      localPlayerCellId: -1,
      myTeam: [],
      theirTeam: [],
    } as unknown as Parameters<typeof applySession>[0]);

    const { allyKeys, enemyKeys, bannedKeys } = deriveKeys();
    expect(allyKeys).toEqual([]);
    expect(enemyKeys).toEqual([]);
    expect(bannedKeys).toEqual([]);
  });
});
