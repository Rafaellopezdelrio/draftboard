// useGamePhase: LCU IPC (invoke) and getCurrentSummoner are mocked;
// rosterFromGameflow is real, applyGameflowRoster is spied so the draft store
// is never touched.
//   - Phase + gameId from /lol-gameflow/v1/session, null outside Tauri / on error
//   - 5s cadence, 30s back-off after 12 consecutive nulls, reset on a hit
//   - GameStart/InProgress bridge: identity resolved once per mount, roster applied
//   - Unmount stops polling and drops in-flight results

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const getCurrentSummoner = vi.hoisted(() => vi.fn());
vi.mock("../services/lcuService", () => ({ getCurrentSummoner }));

const applyGameflowRoster = vi.hoisted(() => vi.fn());
vi.mock("./gameflowRoster", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./gameflowRoster")>()),
  applyGameflowRoster,
}));

const scoutTargets = vi.hoisted(() => ({
  refreshEnemyScoutTargets: vi.fn(),
  resetEnemyScoutTargets: vi.fn(),
}));
vi.mock("./enemyScoutTargets", () => scoutTargets);

import { useGamePhase } from "./inGameDetection";

const SESSION_PATH = { path: "/lol-gameflow/v1/session" };

const teams = {
  teamOne: [
    { puuid: "me-puuid", championId: 222 },
    { puuid: "ally", championId: 64 },
  ],
  teamTwo: [
    { puuid: "opp", championId: 122 },
    { puuid: "opp2", championId: 0 },
  ],
};

function setTauri(on: boolean) {
  for (const target of [globalThis, window] as unknown as Record<string, unknown>[]) {
    if (on) {
      Object.defineProperty(target, "__TAURI_INTERNALS__", {
        value: {},
        writable: true,
        configurable: true,
      });
    } else {
      delete target.__TAURI_INTERNALS__;
    }
  }
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** invoke mock answering the gameflow session from a queue (last one sticks). */
function sessions(...queue: unknown[]) {
  mockInvoke.mockImplementation(async (cmd: string) => {
    if (cmd !== "lcu_get_json") throw new Error(`unexpected ${cmd}`);
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return next;
  });
}

describe("useGamePhase", () => {
  let log: ReturnType<typeof vi.spyOn>;
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockInvoke.mockReset();
    getCurrentSummoner.mockReset().mockResolvedValue({ puuid: "me-puuid" });
    applyGameflowRoster.mockReset().mockReturnValue(false);
    scoutTargets.refreshEnemyScoutTargets.mockReset().mockResolvedValue(undefined);
    scoutTargets.resetEnemyScoutTargets.mockReset();
    setTauri(true);
    log = vi.spyOn(console, "log").mockImplementation(() => {});
    info = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    log.mockRestore();
    info.mockRestore();
  });

  it("outside Tauri stays null and never calls the LCU", async () => {
    setTauri(false);
    const { result } = renderHook(() => useGamePhase());
    await advance(0);
    await advance(5000);
    expect(result.current).toEqual({ phase: null, gameId: undefined });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("reads phase and gameId from the gameflow session and logs only transitions", async () => {
    sessions(
      { phase: "ChampSelect", gameData: { gameId: 42 } },
      { phase: "ChampSelect", gameData: { gameId: 42 } },
      { phase: "Lobby" }
    );
    const { result } = renderHook(() => useGamePhase());
    expect(result.current).toEqual({ phase: null });

    await advance(0);
    expect(mockInvoke).toHaveBeenCalledWith("lcu_get_json", SESSION_PATH);
    expect(result.current).toEqual({ phase: "ChampSelect", gameId: 42 });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("[useGamePhase] transition null → ChampSelect");

    await advance(5000); // same phase -> no new log
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(1);

    await advance(5000);
    expect(result.current).toEqual({ phase: "Lobby", gameId: undefined });
    expect(log).toHaveBeenLastCalledWith("[useGamePhase] transition ChampSelect → Lobby");
  });

  it("maps an LCU error to a null phase", async () => {
    sessions({ phase: "Lobby" }, new Error("lockfile missing"));
    const { result } = renderHook(() => useGamePhase());
    await advance(0);
    expect(result.current.phase).toBe("Lobby");
    await advance(5000);
    expect(result.current).toEqual({ phase: null, gameId: undefined });
    expect(log).toHaveBeenLastCalledWith("[useGamePhase] transition Lobby → null");
  });

  it("backs off to 30s after 12 consecutive nulls and returns to 5s on a hit", async () => {
    const queue: unknown[] = Array.from({ length: 12 }, () => null);
    queue.push({ phase: "Lobby" }, null);
    sessions(...queue);
    const { result } = renderHook(() => useGamePhase());

    await advance(0); // null #1
    await advance(5000 * 11); // nulls #2..#12
    expect(mockInvoke).toHaveBeenCalledTimes(12);

    await advance(29_999);
    expect(mockInvoke).toHaveBeenCalledTimes(12);
    await advance(1); // Lobby -> resets the null streak
    expect(mockInvoke).toHaveBeenCalledTimes(13);
    expect(result.current.phase).toBe("Lobby");

    await advance(5000);
    expect(mockInvoke).toHaveBeenCalledTimes(14);
  });

  it("fills the board from the gameflow roster once the game starts, resolving identity once", async () => {
    applyGameflowRoster.mockReturnValue(true);
    sessions({ phase: "InProgress", gameData: { gameId: 7, ...teams } });
    const { result, unmount } = renderHook(() => useGamePhase());

    await advance(0);
    expect(result.current).toEqual({ phase: "InProgress", gameId: 7 });
    expect(getCurrentSummoner).toHaveBeenCalledTimes(1);
    // Real rosterFromGameflow: my side is teamOne, championId 0 is skipped.
    expect(applyGameflowRoster).toHaveBeenCalledWith({ allyIds: [222, 64], enemyIds: [122] });
    expect(info).toHaveBeenCalledWith(
      "[useGamePhase] board filled from gameflow roster (anonymized-select bridge)"
    );

    await advance(5000);
    expect(applyGameflowRoster).toHaveBeenCalledTimes(2);
    expect(getCurrentSummoner).toHaveBeenCalledTimes(1); // cached for this mount

    // Unmount clears the cached identity -> a remount re-resolves it.
    unmount();
    renderHook(() => useGamePhase());
    await advance(0);
    expect(getCurrentSummoner).toHaveBeenCalledTimes(2);
  });

  it("applies on GameStart too and stays quiet when nothing was written", async () => {
    sessions({ phase: "GameStart", gameData: { gameId: 8, ...teams } });
    renderHook(() => useGamePhase());
    await advance(0);
    expect(applyGameflowRoster).toHaveBeenCalledTimes(1);
    expect(info).not.toHaveBeenCalled();
  });

  it("skips the bridge until the local identity is known", async () => {
    getCurrentSummoner.mockResolvedValueOnce(null).mockResolvedValueOnce({ puuid: "" });
    sessions({ phase: "InProgress", gameData: { gameId: 9, ...teams } });
    renderHook(() => useGamePhase());

    await advance(0); // no summoner
    await advance(5000); // summoner without puuid
    expect(applyGameflowRoster).not.toHaveBeenCalled();
    expect(getCurrentSummoner).toHaveBeenCalledTimes(2);

    await advance(5000); // identity resolved -> bridge runs
    expect(getCurrentSummoner).toHaveBeenCalledTimes(3);
    expect(applyGameflowRoster).toHaveBeenCalledTimes(1);
  });

  it("does not touch the roster outside GameStart/InProgress or without gameData", async () => {
    sessions({ phase: "ChampSelect", gameData: { gameId: 1, ...teams } }, { phase: "InProgress" });
    renderHook(() => useGamePhase());
    await advance(0);
    await advance(5000);
    expect(getCurrentSummoner).not.toHaveBeenCalled();
    expect(applyGameflowRoster).not.toHaveBeenCalled();
  });

  it("stops polling on unmount", async () => {
    sessions({ phase: "Lobby" });
    const { unmount } = renderHook(() => useGamePhase());
    await advance(0);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    unmount();
    await advance(60_000);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("drops a session that resolves after unmount and never reschedules", async () => {
    let resolve!: (v: unknown) => void;
    mockInvoke.mockImplementation(() => new Promise((r) => (resolve = r)));
    const { unmount } = renderHook(() => useGamePhase());
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => resolve({ phase: "InProgress", gameData: { gameId: 3, ...teams } }));
    await advance(60_000);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
    expect(getCurrentSummoner).not.toHaveBeenCalled();
  });

  it("drops the bridge when unmounted while resolving identity", async () => {
    let resolveMe!: (v: unknown) => void;
    getCurrentSummoner.mockImplementation(() => new Promise((r) => (resolveMe = r)));
    sessions({ phase: "InProgress", gameData: { gameId: 4, ...teams } });
    const { unmount } = renderHook(() => useGamePhase());
    await advance(0);
    expect(getCurrentSummoner).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => resolveMe({ puuid: "me-puuid" }));
    await advance(60_000);
    expect(applyGameflowRoster).not.toHaveBeenCalled();
    expect(scoutTargets.refreshEnemyScoutTargets).not.toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  describe("enemy scout targets", () => {
    it("feeds refreshEnemyScoutTargets(gameId, gameMode) on every InProgress tick", async () => {
      const gameData = { gameId: 7, queue: { id: 420, description: "Ranked", gameMode: "CLASSIC" }, ...teams };
      sessions({ phase: "InProgress", gameData });
      renderHook(() => useGamePhase());

      await advance(0);
      expect(scoutTargets.refreshEnemyScoutTargets).toHaveBeenCalledTimes(1);
      expect(scoutTargets.refreshEnemyScoutTargets).toHaveBeenCalledWith(7, "CLASSIC");
      expect(scoutTargets.resetEnemyScoutTargets).not.toHaveBeenCalled();

      // The refresher owns the per-game retry budget; the hook calls it each tick.
      await advance(5000);
      expect(scoutTargets.refreshEnemyScoutTargets).toHaveBeenCalledTimes(2);
    });

    it("feeds the refresher on GameStart too, even when the board was not written", async () => {
      const gameData = { gameId: 8, queue: { id: 1700, description: "Arena", gameMode: "CHERRY" }, ...teams };
      sessions({ phase: "GameStart", gameData });
      renderHook(() => useGamePhase());
      await advance(0);
      expect(applyGameflowRoster).toHaveReturnedWith(false);
      expect(scoutTargets.refreshEnemyScoutTargets).toHaveBeenCalledWith(8, "CHERRY");
    });

    it("passes undefined gameId / gameMode through when gameData lacks them", async () => {
      sessions(
        { phase: "InProgress", gameData: { ...teams } },
        { phase: "InProgress", gameData: { gameId: 3, queue: { id: 0, description: "Custom" }, ...teams } }
      );
      renderHook(() => useGamePhase());
      await advance(0);
      expect(scoutTargets.refreshEnemyScoutTargets).toHaveBeenLastCalledWith(undefined, undefined);
      await advance(5000);
      expect(scoutTargets.refreshEnemyScoutTargets).toHaveBeenLastCalledWith(3, undefined);
    });

    it("does not refresh without gameData", async () => {
      sessions({ phase: "InProgress" }, { phase: "GameStart" });
      renderHook(() => useGamePhase());
      await advance(0);
      await advance(5000);
      expect(scoutTargets.refreshEnemyScoutTargets).not.toHaveBeenCalled();
    });

    it("refreshes even when the LCU identity is unknown", async () => {
      // The scout uses the encrypted PUUID from settings, not the LCU one.
      getCurrentSummoner.mockResolvedValue(null);
      sessions({ phase: "InProgress", gameData: { gameId: 9, ...teams } });
      renderHook(() => useGamePhase());

      await advance(0);
      expect(getCurrentSummoner).toHaveBeenCalledTimes(1);
      expect(applyGameflowRoster).not.toHaveBeenCalled();
      expect(scoutTargets.refreshEnemyScoutTargets).toHaveBeenCalledTimes(1);
      expect(scoutTargets.refreshEnemyScoutTargets).toHaveBeenCalledWith(9, undefined);

      await advance(5000);
      expect(scoutTargets.refreshEnemyScoutTargets).toHaveBeenCalledTimes(2);
    });

    it("resets the targets at ChampSelect and never refreshes there", async () => {
      sessions(
        { phase: "InProgress", gameData: { gameId: 5, ...teams } },
        { phase: "EndOfGame", gameData: { gameId: 5, ...teams } },
        { phase: "ChampSelect", gameData: { gameId: 6, ...teams } }
      );
      renderHook(() => useGamePhase());

      await advance(0);
      expect(scoutTargets.refreshEnemyScoutTargets).toHaveBeenCalledTimes(1);

      await advance(5000); // EndOfGame: neither refresh nor reset
      expect(scoutTargets.refreshEnemyScoutTargets).toHaveBeenCalledTimes(1);
      expect(scoutTargets.resetEnemyScoutTargets).not.toHaveBeenCalled();

      await advance(5000); // next champ select
      expect(scoutTargets.resetEnemyScoutTargets).toHaveBeenCalledTimes(1);
      expect(scoutTargets.refreshEnemyScoutTargets).toHaveBeenCalledTimes(1);
    });

    it("does not reset outside ChampSelect", async () => {
      sessions({ phase: "Lobby" }, null, { phase: "Matchmaking" });
      renderHook(() => useGamePhase());
      await advance(0);
      await advance(5000);
      await advance(5000);
      expect(scoutTargets.resetEnemyScoutTargets).not.toHaveBeenCalled();
      expect(scoutTargets.refreshEnemyScoutTargets).not.toHaveBeenCalled();
    });
  });
});
