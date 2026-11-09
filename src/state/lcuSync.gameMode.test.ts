// Champ-select payloads carry no queue info; lcuSync reads the game mode from
// the gameflow session so ARAM/Arena drafts don't get SR lane/ban advice.

import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import { __testOnly_applySession as applySession } from "./lcuSync";
import { useDraftStore } from "./draftStore";

const player = (cellId: number, championId: number) => ({
  cellId,
  championId,
  championPickIntent: 0,
  assignedPosition: "",
  summonerId: 1000 + cellId,
});

const frame = {
  localPlayerCellId: 0,
  myTeam: [player(0, 121)],
  theirTeam: [player(5, 23)],
} as unknown as Parameters<typeof applySession>[0];
const empty = { localPlayerCellId: -1, myTeam: [], theirTeam: [] } as unknown as Parameters<
  typeof applySession
>[0];

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("lcuSync game mode", () => {
  beforeEach(() => {
    invoke.mockReset();
    applySession(empty); // leave → clean per-session state
    useDraftStore.getState().setGameMode(null);
  });

  it("stores the gameflow queue mode once per champ select and clears it on leave", async () => {
    invoke.mockResolvedValue({ gameData: { queue: { gameMode: "ARAM" } } });
    applySession(frame);
    applySession(frame);
    await flush();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("lcu_get_json", { path: "/lol-gameflow/v1/session" });
    expect(useDraftStore.getState().gameMode).toBe("ARAM");

    applySession(empty);
    expect(useDraftStore.getState().gameMode).toBeNull();
  });

  it("drops a gameflow reply that lands after leaving champ select", async () => {
    let resolve!: (v: unknown) => void;
    invoke.mockReturnValue(new Promise((r) => (resolve = r)));
    applySession(frame);
    applySession(empty);
    resolve({ gameData: { queue: { gameMode: "ARAM" } } });
    await flush();
    expect(useDraftStore.getState().gameMode).toBeNull();
  });
});
