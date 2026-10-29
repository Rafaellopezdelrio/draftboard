// lolvvv's pro build is the preferred source for auto spells and the item
// set (owner preference, 2026-10-29); op.gg fills the late items lolvvv
// doesn't have, and covers roles lolvvv didn't scrape.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const applySummonerSpells = vi.fn((..._a: unknown[]) => Promise.resolve(true));
const pushItemSet = vi.fn((..._a: unknown[]) => Promise.resolve(true));
const coherent = vi.fn((_c: unknown, _r: unknown, ids?: number[]) => ({ ids: ids ?? [4, 14], reason: "", overrode: false }));
let pro: unknown = null;

vi.mock("../services/lcuService", () => ({
  applyRunesResult: () => Promise.resolve({ ok: true }),
  applySummonerSpells: (...a: unknown[]) => applySummonerSpells(...a),
  pushItemSet: (...a: unknown[]) => pushItemSet(...a),
}));
vi.mock("../services/aggregateRepo", () => ({ loadAggregatedRunes: () => Promise.resolve(null) }));
vi.mock("../services/lolvvvBuilds", () => ({ fetchLolvvvBuild: () => Promise.resolve(pro) }));
vi.mock("../services/spellCoherence", () => ({
  pickCoherentSpells: (c: unknown, r: unknown, ids?: number[]) => coherent(c, r, ids),
}));
vi.mock("../services/opggBuilds", async (importActual) => {
  const actual = await importActual<typeof import("../services/opggBuilds")>();
  const path = (ids: number[]) => [{ ids, names: [], play: 100, win: 55, pickRate: 0.5 }];
  return {
    ...actual,
    fetchOpggBuild: () =>
      Promise.resolve({
        summonerSpells: [{ ids: [4, 14] }],
        starterItems: path([1055]),
        boots: path([3006]),
        coreItems: path([6672, 3031, 3094]),
        fourthItems: path([3031]), // duplicate of lolvvv core → dropped
        fifthItems: path([3036]),
        sixthItems: path([3026]),
        runes: [],
      }),
  };
});

import { useAutoActions } from "./autoActions";
import { useDraftStore } from "./draftStore";
import { usePrefsStore } from "./prefsStore";
import type { ChampionDb } from "../types/champion";

const db = { patch: "16.21.1", champions: { "222": { id: "Jinx", key: "222", name: "Jinx" } } } as unknown as ChampionDb;

function lockJinx() {
  act(() => useDraftStore.getState().setLocalSelection(0, null, "222"));
  act(() => {
    window.dispatchEvent(new CustomEvent("draft:champion-locked", { detail: { championKey: "222" } }));
  });
}

describe("auto spells + item set — lolvvv first", () => {
  beforeEach(() => {
    applySummonerSpells.mockClear();
    pushItemSet.mockClear();
    coherent.mockClear();
    act(() => {
      useDraftStore.getState().reset();
      useDraftStore.getState().setLocalSelection(null, null, null);
      useDraftStore.getState().setMyRole("BOTTOM");
    });
    usePrefsStore.setState({
      prefs: { ...usePrefsStore.getState().prefs, safeMode: false, autoApplyOnHover: false, autoApplyRunes: false, autoApplySpells: true, autoApplyItemSet: true },
    });
  });

  it("uses the pro spells, starter, boots and first items; op.gg only for the late items", async () => {
    pro = {
      role: "BOTTOM",
      spells: { ids: [4, 7], pickRate: 0.9 },
      starter: { ids: [1055, 2003], pickRate: 0.8 },
      items: [{ id: 3031, pickRate: 0.5 }, { id: 3085, pickRate: 0.4 }, { id: 3094, pickRate: 0.3 }],
      boots: { id: 3006, pickRate: 0.9 },
      runePage: null,
    };
    renderHook(() => useAutoActions({ db }));
    lockJinx();
    await waitFor(() => expect(pushItemSet).toHaveBeenCalledTimes(1));
    expect(coherent.mock.calls[0][2]).toEqual([4, 7]);
    const blocks = (pushItemSet.mock.calls[0][0] as { blocks: { type: string; items: { id: number }[] }[] }).blocks;
    const byType = Object.fromEntries(blocks.map((b) => [b.type, b.items.map((i) => i.id)]));
    expect(byType).toEqual({
      Inicio: [1055, 2003],
      Botas: [3006],
      Core: [3031, 3085, 3094],
      Finales: [3036, 3026],
    });
  });

  it("falls back to op.gg when lolvvv scraped another role", async () => {
    pro = { role: "MIDDLE", spells: { ids: [4, 12] }, items: [], starter: null, boots: null, runePage: null };
    renderHook(() => useAutoActions({ db }));
    lockJinx();
    await waitFor(() => expect(pushItemSet).toHaveBeenCalledTimes(1));
    expect(coherent.mock.calls[0][2]).toEqual([4, 14]);
    const blocks = (pushItemSet.mock.calls[0][0] as { blocks: { type: string; items: { id: number }[] }[] }).blocks;
    expect(blocks.find((b) => b.type === "Core")?.items.map((i) => i.id)).toEqual([6672, 3031, 3094]);
  });
});
