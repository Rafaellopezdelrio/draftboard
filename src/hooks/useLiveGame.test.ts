// Regression test for the "panels active during loading screen" bug.
//
// Riot's Live Client API responds DURING the loading screen with players +
// champions populated but `gameTime` set to a NEGATIVE countdown
// (e.g. -55.4s = "55 seconds until minions spawn"). Previously useLiveGame
// flipped `inGame: true` as soon as gameTime was defined, so InGameTimers,
// LiveGamePanel, and the overlay all activated before the user's champion
// actually spawned. Annoying + visually wrong.
//
// The fix: require `gameTime > 0` before reporting `inGame: true`. We
// don't render-test the hook here (the polling loop needs a full React
// tree + tauri); we exercise the boolean predicate directly through
// fetchLiveGameSnapshot mocks to lock the contract.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const ev = vi.hoisted(() => ({
  emit: vi.fn(),
  listen: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ev);

import { fetchLiveGameSnapshot } from "../services/liveClient";

/** Predicate from useLiveGame's tick(): the single source of truth. */
function shouldReportInGame(snap: unknown): boolean {
  const s = snap as { gameData?: { gameTime?: number } } | null;
  return !!s && s.gameData?.gameTime !== undefined && s.gameData.gameTime > 0;
}

describe("useLiveGame — loading-screen vs in-game gate", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      value: {},
      writable: true,
      configurable: true,
    });
  });

  it("LoL not running → no snapshot → inGame false", async () => {
    mockInvoke.mockRejectedValue(new Error("ECONNREFUSED"));
    const snap = await fetchLiveGameSnapshot();
    expect(shouldReportInGame(snap)).toBe(false);
  });

  it("loading screen (gameTime = -55) → inGame FALSE (the bug)", async () => {
    mockInvoke.mockResolvedValue({
      activePlayer: { currentGold: 500, level: 1, summonerName: "Me" },
      allPlayers: [{ team: "ORDER" }],
      events: { Events: [] },
      gameData: { gameMode: "ARAM", gameTime: -55.4, mapNumber: 12 },
    });
    const snap = await fetchLiveGameSnapshot();
    expect(snap).not.toBeNull();
    expect(snap?.gameData.gameTime).toBeLessThan(0);
    expect(shouldReportInGame(snap)).toBe(false);
  });

  it("loading screen (gameTime = 0 exactly) → still false (no minions yet)", async () => {
    mockInvoke.mockResolvedValue({
      gameData: { gameMode: "CLASSIC", gameTime: 0, mapNumber: 11 },
      allPlayers: [],
      events: { Events: [] },
      activePlayer: null,
    });
    const snap = await fetchLiveGameSnapshot();
    expect(shouldReportInGame(snap)).toBe(false);
  });

  it("minion spawn moment (gameTime = 0.1) → true", async () => {
    mockInvoke.mockResolvedValue({
      gameData: { gameMode: "CLASSIC", gameTime: 0.1, mapNumber: 11 },
      allPlayers: [],
      events: { Events: [] },
      activePlayer: null,
    });
    const snap = await fetchLiveGameSnapshot();
    expect(shouldReportInGame(snap)).toBe(true);
  });

  it("mid-game (gameTime = 600) → true", async () => {
    mockInvoke.mockResolvedValue({
      gameData: { gameMode: "CLASSIC", gameTime: 600, mapNumber: 11 },
      allPlayers: [],
      events: { Events: [] },
      activePlayer: null,
    });
    const snap = await fetchLiveGameSnapshot();
    expect(shouldReportInGame(snap)).toBe(true);
  });
});

// ── Hook behaviour ──────────────────────────────────────────────────────
// The main-window poller is a module-level singleton, so every test loads a
// fresh copy of the module (vi.resetModules) to start from a clean slate.

type LiveGameModule = typeof import("./useLiveGame");
type LiveGameState = import("./useLiveGame").LiveGameState;

async function loadModule(): Promise<LiveGameModule> {
  vi.resetModules();
  return import("./useLiveGame");
}

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

function rawSnapshot(gameTime: number, gameMode = "CLASSIC") {
  return {
    activePlayer: null,
    allPlayers: [],
    events: { Events: [] },
    gameData: { gameMode, gameTime, mapNumber: 11 },
  };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const T0 = 1_700_000_000_000;

describe("useLiveGame — main window singleton poller", () => {
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    mockInvoke.mockReset();
    ev.emit.mockReset().mockResolvedValue(undefined);
    ev.listen.mockReset();
    setTauri(true);
    window.history.replaceState(null, "", "/");
    log = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    // Let any in-flight tick settle onto a fake timer, then drop the clock so
    // the abandoned singleton never fires into the next test.
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    log.mockRestore();
    delete (document as unknown as Record<string, unknown>).hidden;
  });

  it("starts in loading, then reports a live game from a single shared poll", async () => {
    mockInvoke.mockResolvedValue(rawSnapshot(600));
    const { useLiveGame } = await loadModule();
    const a = renderHook(() => useLiveGame());
    const b = renderHook(() => useLiveGame());
    expect(a.result.current).toEqual({ inGame: false, snapshot: null, reason: "loading" });

    await advance(0);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("live_client_all_game_data");
    for (const r of [a.result, b.result]) {
      expect(r.current.inGame).toBe(true);
      expect(r.current.reason).toBe("in-game");
      expect(r.current.snapshotAt).toBe(T0);
      expect(r.current.snapshot?.gameData.gameTime).toBe(600);
    }
    expect(log).toHaveBeenCalledWith("[useLiveGame] transition inGame=true mode=CLASSIC t=600s");

    // Fast cadence while in game: next poll 2s later, still one fetch per tick.
    await advance(1999);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it("forwards every tick to the overlay window through a Tauri event", async () => {
    mockInvoke.mockResolvedValue(rawSnapshot(600));
    const { useLiveGame } = await loadModule();
    renderHook(() => useLiveGame());
    await advance(0);
    await advance(2000);
    expect(ev.emit).toHaveBeenCalledWith(
      "live-game:update",
      expect.objectContaining({ inGame: true, reason: "in-game", snapshotAt: T0 + 2000 })
    );
  });

  it("swallows a failing event emit and keeps polling", async () => {
    ev.emit.mockRejectedValue(new Error("no overlay window"));
    mockInvoke.mockResolvedValue(rawSnapshot(600));
    const { useLiveGame } = await loadModule();
    const { result } = renderHook(() => useLiveGame());
    await advance(0);
    await advance(2000);
    expect(ev.emit).toHaveBeenCalled();
    await advance(2000);
    expect(mockInvoke).toHaveBeenCalledTimes(3);
    expect(result.current.inGame).toBe(true);
  });

  it("debounces the end of a game over 3 misses, then backs off to 10s polling", async () => {
    mockInvoke.mockResolvedValueOnce(rawSnapshot(600)).mockRejectedValue(new Error("ECONNREFUSED"));
    const { useLiveGame } = await loadModule();
    const { result } = renderHook(() => useLiveGame());
    await advance(0);
    expect(result.current.inGame).toBe(true);

    await advance(2000); // miss 1
    await advance(2000); // miss 2
    expect(mockInvoke).toHaveBeenCalledTimes(3);
    expect(result.current.inGame).toBe(true);
    expect(result.current.snapshot?.gameData.gameTime).toBe(600);

    await advance(2000); // miss 3 -> accepted as "game ended"
    expect(result.current).toEqual({ inGame: false, snapshot: null, reason: "not-running" });
    expect(log).toHaveBeenLastCalledWith("[useLiveGame] transition inGame=false");

    // Slow cadence after 3 misses.
    expect(mockInvoke).toHaveBeenCalledTimes(4);
    await advance(9999);
    expect(mockInvoke).toHaveBeenCalledTimes(4);
    await advance(1);
    expect(mockInvoke).toHaveBeenCalledTimes(5);
  });

  it("treats the loading screen (negative gameTime) as not running", async () => {
    mockInvoke.mockResolvedValue(rawSnapshot(-30));
    const { useLiveGame } = await loadModule();
    const { result } = renderHook(() => useLiveGame());
    await advance(0);
    expect(result.current).toEqual({ inGame: false, snapshot: null, reason: "not-running" });
    expect(log).not.toHaveBeenCalled();
  });

  it("skips fetching while the webview is hidden and retries every 10s", async () => {
    let hidden = true;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    mockInvoke.mockResolvedValue(rawSnapshot(600));
    const { useLiveGame } = await loadModule();
    const { result } = renderHook(() => useLiveGame());
    await advance(0);
    await advance(10000);
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.current.reason).toBe("loading");

    hidden = false;
    await advance(10000);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(result.current.inGame).toBe(true);
  });

  it("replays the current state to a late subscriber without a new fetch", async () => {
    mockInvoke.mockResolvedValue(rawSnapshot(600));
    const { useLiveGame } = await loadModule();
    const first = renderHook(() => useLiveGame());
    await advance(0);
    first.unmount();

    const late = renderHook(() => useLiveGame());
    expect(late.result.current.inGame).toBe(true);
    expect(late.result.current.snapshot?.gameData.gameTime).toBe(600);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled", async () => {
    mockInvoke.mockResolvedValue(rawSnapshot(600));
    const { useLiveGame } = await loadModule();
    const { result } = renderHook(() => useLiveGame(false));
    await advance(5000);
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(ev.listen).not.toHaveBeenCalled();
    expect(result.current.reason).toBe("loading");
  });

  it("outside Tauri reports not-running and never emits", async () => {
    setTauri(false);
    const { useLiveGame } = await loadModule();
    const { result } = renderHook(() => useLiveGame());
    await advance(0);
    await advance(2000);
    expect(result.current).toEqual({ inGame: false, snapshot: null, reason: "not-running" });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(ev.emit).not.toHaveBeenCalled();
  });
});

describe("useLiveGame — overlay window", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    ev.listen.mockReset();
    window.history.replaceState(null, "", "/?overlay=1");
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("subscribes to the main window's event instead of polling", async () => {
    setTauri(true);
    let handler: ((e: { payload: LiveGameState }) => void) | null = null;
    const unlisten = vi.fn();
    ev.listen.mockImplementation(async (_name: string, cb: typeof handler) => {
      handler = cb;
      return unlisten;
    });
    const { useLiveGame } = await loadModule();
    const { result, unmount } = renderHook(() => useLiveGame());
    await act(async () => {});

    expect(ev.listen).toHaveBeenCalledWith("live-game:update", expect.any(Function));
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.current.reason).toBe("loading");

    const payload: LiveGameState = {
      inGame: true,
      snapshot: {
        activePlayer: null,
        allPlayers: [],
        events: [],
        gameData: { gameMode: "ARAM", gameTime: 321, mapNumber: 12 },
      },
      reason: "in-game",
      snapshotAt: 42,
    };
    act(() => handler!({ payload }));
    expect(result.current).toEqual(payload);

    unmount();
    expect(unlisten).toHaveBeenCalledTimes(1);
    // A late event after unmount is ignored (cancelled guard).
    expect(() => handler!({ payload })).not.toThrow();
  });

  // Regression: if the hook unmounts before listen() resolves (fast remount,
  // React StrictMode double-mount), cleanup runs with unlisten === null; the
  // listener that resolves afterwards must still be removed.
  it("unlistens a subscription that resolves after unmount", async () => {
    setTauri(true);
    const unlisten = vi.fn();
    let resolveListen!: (fn: () => void) => void;
    ev.listen.mockImplementation(() => new Promise((r) => (resolveListen = r)));
    const { useLiveGame } = await loadModule();
    const { unmount } = renderHook(() => useLiveGame());
    await act(async () => {});
    expect(ev.listen).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => resolveListen(unlisten));
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("outside Tauri neither listens nor polls", async () => {
    setTauri(false);
    const { useLiveGame } = await loadModule();
    const { result } = renderHook(() => useLiveGame());
    await act(async () => {});
    expect(ev.listen).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.current.reason).toBe("loading");
  });
});

describe("useLiveGameTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function snapAt(gameTime: number) {
    return {
      activePlayer: null,
      allPlayers: [],
      events: [],
      gameData: { gameMode: "CLASSIC", gameTime, mapNumber: 11 },
    };
  }

  it("returns the raw gameTime without a receive timestamp, 0 without a snapshot", async () => {
    const { useLiveGameTime } = await loadModule();
    const { result, rerender } = renderHook(({ s }) => useLiveGameTime(s), {
      initialProps: { s: { inGame: true, snapshot: snapAt(250), reason: "in-game" } as LiveGameState },
    });
    expect(result.current).toBe(250);
    rerender({ s: { inGame: false, snapshot: null, reason: "not-running" } });
    expect(result.current).toBe(0);
  });

  it("interpolates the clock every second between polls and stops ticking out of game", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const { useLiveGameTime } = await loadModule();
    const state: LiveGameState = {
      inGame: true,
      snapshot: snapAt(100),
      reason: "in-game",
      snapshotAt: T0,
    };
    const { result, rerender } = renderHook(({ s }) => useLiveGameTime(s), {
      initialProps: { s: state },
    });
    expect(result.current).toBe(100);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(103);

    rerender({ s: { ...state, inGame: false } });
    const frozen = result.current;
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // No ticker out of game -> no re-render, value stays put.
    expect(result.current).toBe(frozen);
  });
});
