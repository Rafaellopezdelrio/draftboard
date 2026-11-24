import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ChampionDb } from "../types/champion";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
const summonerMock = vi.fn();
vi.mock("../services/lcuService", () => ({ getSummonerById: (id: number) => summonerMock(id) }));
const masteriesMock = vi.fn();
vi.mock("../services/riotApi", () => ({
  getRiotProxyUrl: () => "https://proxy.test",
  getTopMasteries: (_cfg: unknown, puuid: string) => masteriesMock(puuid),
}));
vi.mock("../services/accountResolve", () => ({ settingsOrDefault: async () => ({ apiKey: "", region: "euw1" }) }));
const trackMock = vi.fn();
vi.mock("../services/reports", () => ({ trackFeature: (n: string) => trackMock(n) }));

import { readParty, useTeamMode, useTeamStyleStore, __testOnly_resetTeamMode } from "./useTeamMode";

const db = {
  champions: {
    "1": { key: "1", archetypes: ["engage"] },
    "2": { key: "2", archetypes: ["poke"] },
    "3": { key: "3", archetypes: ["peel"] },
  },
} as unknown as ChampionDb;

const lobby = (n: number, gameMode = "CLASSIC") => ({
  members: Array.from({ length: n }, (_, i) => ({ summonerId: i + 1 })),
  gameConfig: { gameMode },
});

beforeEach(() => {
  invokeMock.mockReset();
  summonerMock.mockReset().mockImplementation(async (id: number) => ({ puuid: `p${id}` }));
  // Players 1-4 main a poke champion, player 5 an engage one.
  masteriesMock.mockReset().mockImplementation(async (puuid: string) => [{ championId: puuid === "p5" ? 1 : 2 }]);
  trackMock.mockReset();
  __testOnly_resetTeamMode();
});

describe("readParty", () => {
  it("reads size, mode and members from the client lobby", async () => {
    invokeMock.mockResolvedValue(lobby(3, "ARAM"));
    expect(await readParty()).toEqual({ size: 3, gameMode: "ARAM", summonerIds: [1, 2, 3] });
    expect(invokeMock).toHaveBeenCalledWith("lcu_get_json", { path: "/lol-lobby/v2/lobby" });
  });
  it("no lobby: null", async () => {
    invokeMock.mockResolvedValue(null);
    expect(await readParty()).toBeNull();
  });
});

describe("useTeamMode", () => {
  it("five in the lobby: team mode, with the style most of them play", async () => {
    invokeMock.mockResolvedValue(lobby(5));
    const { result } = renderHook(() => useTeamMode("Lobby", db));
    await waitFor(() => expect(result.current.active).toBe(true));
    await waitFor(() => expect(result.current.suggested).toBe("poke"));
    expect(trackMock).toHaveBeenCalledWith("team-mode");
  });

  it("solo, duo or a trio: no team mode and no Riot calls", async () => {
    invokeMock.mockResolvedValue(lobby(2));
    const { result } = renderHook(() => useTeamMode("Lobby", db));
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(result.current.active).toBe(false);
    expect(masteriesMock).not.toHaveBeenCalled();
  });

  it("keeps the party in champ select when the lobby can't be read there", async () => {
    invokeMock.mockResolvedValue(lobby(5));
    const { result, rerender } = renderHook(({ phase }) => useTeamMode(phase, db), {
      initialProps: { phase: "Lobby" },
    });
    await waitFor(() => expect(result.current.active).toBe(true));
    invokeMock.mockRejectedValue(new Error("404"));
    rerender({ phase: "ChampSelect" });
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(result.current.active).toBe(true);
  });

  it("not read outside the lobby and champ select", async () => {
    renderHook(() => useTeamMode("InProgress", db));
    await act(async () => {});
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("useTeamStyleStore", () => {
  it("counts a picked style, not a cleared one", () => {
    act(() => useTeamStyleStore.getState().setStyle("engage"));
    expect(useTeamStyleStore.getState().style).toBe("engage");
    act(() => useTeamStyleStore.getState().setStyle(null));
    expect(trackMock.mock.calls.filter(([n]) => n === "team-style")).toHaveLength(1);
  });
});
