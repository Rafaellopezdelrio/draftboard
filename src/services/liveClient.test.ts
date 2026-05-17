import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { fetchLiveGameSnapshot } from "./liveClient";

describe("liveClient.fetchLiveGameSnapshot", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    // Force isTauri() === true so the function actually invokes.
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      value: {},
      writable: true,
      configurable: true,
    });
  });

  it("returns null when the invoke command throws (not in game)", async () => {
    mockInvoke.mockRejectedValue(new Error("connection refused"));
    const snap = await fetchLiveGameSnapshot();
    expect(snap).toBeNull();
  });

  it("returns null when the response is not an object", async () => {
    mockInvoke.mockResolvedValue("garbage");
    const snap = await fetchLiveGameSnapshot();
    expect(snap).toBeNull();
  });

  it("flattens events.Events[] into a top-level events array", async () => {
    mockInvoke.mockResolvedValue({
      activePlayer: { currentGold: 500, level: 6, summonerName: "MeBoi" },
      allPlayers: [],
      events: {
        Events: [
          { EventID: 1, EventName: "GameStart", EventTime: 0 },
          { EventID: 7, EventName: "DragonKill", EventTime: 305 },
        ],
      },
      gameData: { gameMode: "CLASSIC", gameTime: 312, mapNumber: 11 },
    });
    const snap = await fetchLiveGameSnapshot();
    expect(snap).not.toBeNull();
    expect(snap?.events).toHaveLength(2);
    expect(snap?.events[1].EventName).toBe("DragonKill");
    expect(snap?.gameData.gameTime).toBe(312);
  });

  it("provides sensible defaults when fields are missing", async () => {
    mockInvoke.mockResolvedValue({}); // empty object — game just starting?
    const snap = await fetchLiveGameSnapshot();
    expect(snap).not.toBeNull();
    expect(snap?.allPlayers).toEqual([]);
    expect(snap?.events).toEqual([]);
    expect(snap?.activePlayer).toBeNull();
    expect(snap?.gameData.gameMode).toBe("");
  });

  it("preserves activePlayer fields verbatim", async () => {
    mockInvoke.mockResolvedValue({
      activePlayer: {
        currentGold: 1234.5,
        level: 11,
        summonerName: "Yo",
        championStats: { currentHealth: 800, maxHealth: 1000, resourceMax: 400, resourceValue: 200 },
      },
      allPlayers: [],
      events: { Events: [] },
      gameData: { gameMode: "CLASSIC", gameTime: 0, mapNumber: 11 },
    });
    const snap = await fetchLiveGameSnapshot();
    expect(snap?.activePlayer?.currentGold).toBe(1234.5);
    expect(snap?.activePlayer?.championStats?.maxHealth).toBe(1000);
  });
});
