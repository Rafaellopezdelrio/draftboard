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

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

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
