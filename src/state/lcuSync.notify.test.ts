// Regression: the my-turn OS notification was hardcoded Spanish while the
// voice line next to it followed the UI locale ("Your turn to ban" spoken,
// "Tu turno de banear" shown).

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const nativeNotify = vi.fn();
vi.mock("../services/nativeNotify", () => ({
  nativeNotify: (...args: unknown[]) => nativeNotify(...args),
}));

import { __testOnly_applySession as applySession } from "./lcuSync";
import { useDraftStore } from "./draftStore";
import { i18n } from "../i18n";
import enBundle from "../i18n/locales/en.json";

type Session = Parameters<typeof applySession>[0];

const turnSession = (type: "ban" | "pick"): Session =>
  ({
    localPlayerCellId: 0,
    myTeam: [
      { cellId: 0, championId: 0, championPickIntent: 0, assignedPosition: "", summonerId: 1 },
    ],
    theirTeam: [],
    bans: { myTeamBans: [], theirTeamBans: [] },
    actions: [[{ id: 7, actorCellId: 0, championId: 0, completed: false, isInProgress: true, type }]],
    timer: { phase: "BAN_PICK", adjustedTimeLeftInPhase: 30000 },
  }) as unknown as Session;

describe("lcuSync — my-turn notification language", () => {
  beforeEach(async () => {
    applySession(null); // resets the once-per-action dedup
    useDraftStore.getState().reset();
    nativeNotify.mockReset();
    i18n.addResourceBundle("en", "translation", enBundle, true, true);
    await i18n.changeLanguage("en");
  });

  afterAll(async () => {
    await i18n.changeLanguage("es");
  });

  it.each([
    ["ban", "voice.banTurn", "notify.banTurnBody"],
    ["pick", "voice.pickTurn", "notify.pickTurnBody"],
  ] as const)("%s turn uses the UI locale", (type, titleKey, bodyKey) => {
    applySession(turnSession(type));
    expect(nativeNotify).toHaveBeenCalledTimes(1);
    const arg = nativeNotify.mock.calls[0][0] as { title: string; body: string };
    expect(arg.title).toBe(i18n.t(titleKey, { lng: "en" }));
    expect(arg.title).not.toBe(i18n.t(titleKey, { lng: "es" }));
    expect(arg.body).toBe(i18n.t(bodyKey));
  });
});
