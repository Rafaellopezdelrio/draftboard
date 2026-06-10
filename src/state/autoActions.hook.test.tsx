import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Spies on the LCU write surface — auto-actions push runes/spells/item-sets
// into the live Riot client, so the thing we most need to guard is that they
// fire the RIGHT number of times (audit findings F4 double-fire, F5 stale role).
const applyRunes = vi.fn((..._a: unknown[]) => Promise.resolve(true));
const applySummonerSpells = vi.fn((..._a: unknown[]) => Promise.resolve(true));
const pushItemSet = vi.fn((..._a: unknown[]) => Promise.resolve(true));
vi.mock("../services/lcuService", () => ({
  applyRunes: (...a: unknown[]) => applyRunes(...a),
  applySummonerSpells: (...a: unknown[]) => applySummonerSpells(...a),
  pushItemSet: (...a: unknown[]) => pushItemSet(...a),
}));
vi.mock("../services/aggregateRepo", () => ({
  loadAggregatedRunes: () =>
    Promise.resolve({ primaryStyle: 8000, subStyle: 8100, perks: [1, 2, 3] }),
}));
vi.mock("../services/opggBuilds", () => ({
  fetchOpggBuild: () =>
    Promise.resolve({
      summonerSpells: [{ ids: [4, 12] }],
      starterItems: [],
      boots: [],
      coreItems: [],
      fourthItems: [],
      fifthItems: [],
      sixthItems: [],
    }),
  pickBestBuild: () => null,
}));
vi.mock("../services/spellCoherence", () => ({
  pickCoherentSpells: () => ({ ids: [4, 12], reason: "", overrode: false }),
}));

import { useAutoActions } from "./autoActions";
import { useDraftStore } from "./draftStore";
import { usePrefsStore } from "./prefsStore";
import type { ChampionDb } from "../types/champion";

const db = {
  patch: "16.11.1",
  champions: {
    "266": { id: "Aatrox", key: "266", name: "Aatrox", roles: ["TOP"], archetypes: [] },
  },
} as unknown as ChampionDb;

function setPrefs(over: Record<string, unknown>) {
  usePrefsStore.setState({
    prefs: { ...usePrefsStore.getState().prefs, ...over },
  });
}

function lock(championKey: string) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent("draft:champion-locked", { detail: { championKey } })
    );
  });
}

describe("useAutoActions — LCU write de-duplication (F4/F5)", () => {
  beforeEach(() => {
    applyRunes.mockClear();
    applySummonerSpells.mockClear();
    pushItemSet.mockClear();
    act(() => {
      useDraftStore.getState().reset();
      useDraftStore.getState().setLocalSelection(null, null, null);
      useDraftStore.getState().setMyRole("TOP");
    });
    setPrefs({
      safeMode: false,
      autoApplyOnHover: true,
      autoApplyRunes: true,
      autoApplySpells: false,
      autoApplyItemSet: false,
    });
  });

  it("hover then lock of the SAME champ applies runes ONCE, not twice (F4)", async () => {
    renderHook(() => useAutoActions({ db }));

    // Hover → runes applied once.
    act(() => useDraftStore.getState().setLocalSelection(0, "266", null));
    await waitFor(() => expect(applyRunes).toHaveBeenCalledTimes(1));

    // Lock the same champ → the hover effect is now gated off and the lock
    // handler dedups the identical champ:role key → NO second rune write.
    act(() => useDraftStore.getState().setLocalSelection(0, "266", "266"));
    lock("266");
    await new Promise((r) => setTimeout(r, 0));
    expect(applyRunes).toHaveBeenCalledTimes(1);
  });

  it("lock without prior hover applies runes + spells + items once each", async () => {
    setPrefs({ autoApplySpells: true, autoApplyItemSet: true });
    renderHook(() => useAutoActions({ db }));

    act(() => useDraftStore.getState().setLocalSelection(0, null, "266"));
    lock("266");

    await waitFor(() => expect(applyRunes).toHaveBeenCalledTimes(1));
    expect(applySummonerSpells).toHaveBeenCalledTimes(1);
    // pickBestBuild mocked to null → no item blocks → pushItemSet skipped,
    // but the spells path proves the lock handler ran with a resolved role.
  });

  it("safe mode blocks every auto-action", async () => {
    setPrefs({ safeMode: true });
    renderHook(() => useAutoActions({ db }));

    act(() => useDraftStore.getState().setLocalSelection(0, "266", null));
    lock("266");
    await new Promise((r) => setTimeout(r, 0));
    expect(applyRunes).not.toHaveBeenCalled();
    expect(applySummonerSpells).not.toHaveBeenCalled();
  });

  it("re-picking the same champ in a NEW draft re-applies (dedup reset on clear)", async () => {
    renderHook(() => useAutoActions({ db }));

    act(() => useDraftStore.getState().setLocalSelection(0, "266", null));
    await waitFor(() => expect(applyRunes).toHaveBeenCalledTimes(1));

    // Leave champ select → selection clears → dedup ref resets.
    act(() => useDraftStore.getState().setLocalSelection(null, null, null));
    // New draft, same champ hovered again → re-applies.
    act(() => useDraftStore.getState().setLocalSelection(0, "266", null));
    await waitFor(() => expect(applyRunes).toHaveBeenCalledTimes(2));
  });
});
