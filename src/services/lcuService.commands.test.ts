// LCU command wrappers: argument shapes, never-throw contracts, and the
// browser (non-Tauri) short-circuits. subscribeStatus' Tauri path lives in
// lcuService.test.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const tauri = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: tauri.listen }));

import {
  getCurrentSummoner,
  getSummonerById,
  applyRunesResult,
  applyRunes,
  pushItemSet,
  applySummonerSpells,
  subscribeChampSelect,
  fetchCurrentChampSelect,
  subscribeStatus,
  lcuPositionToRole,
  type RunePageInput,
  type LcuChampSelectSession,
} from "./lcuService";

const PAGE: RunePageInput = {
  name: "Draftboard",
  primaryStyleId: 8000,
  subStyleId: 8100,
  selectedPerkIds: [8005, 9111, 9104, 8014, 8139, 8135, 5005, 5008, 5002],
};

function setTauri(on: boolean) {
  if (on) {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      value: {},
      writable: true,
      configurable: true,
    });
  } else {
    delete (globalThis as Record<string, unknown>).__TAURI_INTERNALS__;
  }
}

beforeEach(() => {
  tauri.invoke.mockReset();
  tauri.listen.mockReset();
  setTauri(true);
});

afterEach(() => setTauri(true));

describe("outside the desktop app", () => {
  beforeEach(() => setTauri(false));

  it("every command short-circuits without touching invoke/listen", async () => {
    expect(await getCurrentSummoner()).toBeNull();
    expect(await getSummonerById(1)).toBeNull();
    expect(await applyRunesResult(PAGE)).toEqual({
      ok: false,
      reason: "error",
      detail: "not running in the desktop app",
    });
    expect(await pushItemSet({ championId: 1, title: "t", blocks: [] })).toBe(false);
    expect(await applySummonerSpells(4, 14)).toBe(false);
    expect(await fetchCurrentChampSelect()).toBeNull();
    const unsub = await subscribeChampSelect(vi.fn());
    expect(() => unsub()).not.toThrow();
    expect(tauri.invoke).not.toHaveBeenCalled();
    expect(tauri.listen).not.toHaveBeenCalled();
  });

  it("subscribeStatus reports disconnected immediately", async () => {
    const cb = vi.fn();
    await subscribeStatus(cb);
    expect(cb).toHaveBeenCalledWith({ connected: false, reason: "running in browser" });
    expect(tauri.listen).not.toHaveBeenCalled();
  });
});

describe("summoner lookups", () => {
  it("getCurrentSummoner returns the LCU payload", async () => {
    tauri.invoke.mockResolvedValue({ puuid: "p1", gameName: "Me", tagLine: "EUW" });
    expect(await getCurrentSummoner()).toEqual({ puuid: "p1", gameName: "Me", tagLine: "EUW" });
    expect(tauri.invoke).toHaveBeenCalledWith("lcu_current_summoner");
  });

  it("getCurrentSummoner returns null when the client is closed", async () => {
    tauri.invoke.mockRejectedValue("LCU not connected");
    expect(await getCurrentSummoner()).toBeNull();
  });

  it("getSummonerById passes the id and maps errors to null", async () => {
    tauri.invoke.mockResolvedValueOnce({ puuid: "p2", summonerId: 77 });
    expect(await getSummonerById(77)).toEqual({ puuid: "p2", summonerId: 77 });
    expect(tauri.invoke).toHaveBeenCalledWith("lcu_summoner_by_id", { summonerId: 77 });
    tauri.invoke.mockRejectedValueOnce(new Error("404"));
    expect(await getSummonerById(78)).toBeNull();
  });
});

describe("applyRunesResult / applyRunes", () => {
  it("returns ok and sends the page", async () => {
    tauri.invoke.mockResolvedValue(undefined);
    expect(await applyRunesResult(PAGE)).toEqual({ ok: true });
    expect(tauri.invoke).toHaveBeenCalledWith("lcu_apply_runes", { page: PAGE });
  });

  it("classifies a full rune-page roster as page-limit", async () => {
    tauri.invoke.mockRejectedValue("PAGE_LIMIT: all 2 pages are user pages");
    expect(await applyRunesResult(PAGE)).toEqual({
      ok: false,
      reason: "page-limit",
      detail: "PAGE_LIMIT: all 2 pages are user pages",
    });
  });

  it("classifies any other failure as error with the stringified detail", async () => {
    tauri.invoke.mockRejectedValue(new Error("HTTP 500"));
    expect(await applyRunesResult(PAGE)).toEqual({
      ok: false,
      reason: "error",
      detail: "Error: HTTP 500",
    });
  });

  it("applyRunes collapses the result to a boolean", async () => {
    tauri.invoke.mockResolvedValueOnce(undefined);
    expect(await applyRunes(PAGE)).toBe(true);
    tauri.invoke.mockRejectedValueOnce("PAGE_LIMIT");
    expect(await applyRunes(PAGE)).toBe(false);
  });
});

describe("pushItemSet / applySummonerSpells", () => {
  const SET = {
    championId: 266,
    title: "Draftboard Aatrox",
    blocks: [{ type: "Core", items: [{ id: 6692 }, { id: 3071, count: 1 }] }],
  };

  it("pushItemSet forwards the LCU verdict and the set payload", async () => {
    tauri.invoke.mockResolvedValueOnce(true);
    expect(await pushItemSet(SET)).toBe(true);
    expect(tauri.invoke).toHaveBeenCalledWith("lcu_push_item_set", { set: SET });
    tauri.invoke.mockResolvedValueOnce(false);
    expect(await pushItemSet(SET)).toBe(false);
  });

  it("pushItemSet never throws", async () => {
    tauri.invoke.mockRejectedValue(new Error("login screen"));
    expect(await pushItemSet(SET)).toBe(false);
  });

  it("applySummonerSpells sends both spell ids and maps errors to false", async () => {
    tauri.invoke.mockResolvedValueOnce(true);
    expect(await applySummonerSpells(4, 12)).toBe(true);
    expect(tauri.invoke).toHaveBeenCalledWith("lcu_apply_summoner_spells", {
      spell1: 4,
      spell2: 12,
    });
    tauri.invoke.mockRejectedValueOnce(new Error("404 not in champ select"));
    expect(await applySummonerSpells(4, 12)).toBe(false);
  });
});

describe("champ select", () => {
  const SESSION = {
    myTeam: [{ cellId: 0, championId: 266 }],
    theirTeam: [],
    bans: { myTeamBans: [], theirTeamBans: [] },
    localPlayerCellId: 0,
  } as LcuChampSelectSession;

  it("subscribeChampSelect forwards event payloads to the callback and returns unlisten", async () => {
    const unlisten = vi.fn();
    let handler: ((e: { payload: LcuChampSelectSession }) => void) | undefined;
    tauri.listen.mockImplementation(async (name: string, h: typeof handler) => {
      expect(name).toBe("lcu:champ-select");
      handler = h;
      return unlisten;
    });
    const cb = vi.fn();
    const ret = await subscribeChampSelect(cb);
    handler!({ payload: SESSION });
    expect(cb).toHaveBeenCalledWith(SESSION);
    ret();
    expect(unlisten).toHaveBeenCalled();
  });

  it("subscribeStatus forwards later lcu:status events too", async () => {
    let handler: ((e: { payload: unknown }) => void) | undefined;
    tauri.listen.mockImplementation(async (_n: string, h: typeof handler) => {
      handler = h;
      return () => {};
    });
    tauri.invoke.mockResolvedValue({ connected: false });
    const cb = vi.fn();
    await subscribeStatus(cb);
    handler!({ payload: { connected: true, reason: null } });
    expect(cb).toHaveBeenLastCalledWith({ connected: true, reason: null });
  });

  it("fetchCurrentChampSelect reads the session path", async () => {
    tauri.invoke.mockResolvedValue(SESSION);
    expect(await fetchCurrentChampSelect()).toEqual(SESSION);
    expect(tauri.invoke).toHaveBeenCalledWith("lcu_get_json", {
      path: "/lol-champ-select/v1/session",
    });
  });

  it("fetchCurrentChampSelect returns null for an empty body or a 404", async () => {
    tauri.invoke.mockResolvedValueOnce(undefined);
    expect(await fetchCurrentChampSelect()).toBeNull();
    tauri.invoke.mockRejectedValueOnce(new Error("404"));
    expect(await fetchCurrentChampSelect()).toBeNull();
  });
});

describe("lcuPositionToRole", () => {
  it.each([
    ["top", "TOP"],
    ["JUNGLE", "JUNGLE"],
    ["middle", "MIDDLE"],
    ["MID", "MIDDLE"],
    ["bottom", "BOTTOM"],
    ["BOT", "BOTTOM"],
    ["adc", "BOTTOM"],
    ["UTILITY", "UTILITY"],
    ["support", "UTILITY"],
    ["SUP", "UTILITY"],
  ])("%s -> %s", (input, role) => {
    expect(lcuPositionToRole(input)).toBe(role);
  });

  it("returns null for empty, missing or unknown positions", () => {
    expect(lcuPositionToRole(undefined)).toBeNull();
    expect(lcuPositionToRole("")).toBeNull();
    expect(lcuPositionToRole("NONE")).toBeNull();
  });
});
