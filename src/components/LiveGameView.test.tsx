// LiveGameView contract:
//   - On mount loads settings and queries Spectator V5 by PUUID; re-polls every 30s.
//   - Missing PUUID -> "needRiotId" error; missing API key without proxy ->
//     "needApiKey" error; with a proxy URL the API key is not required.
//   - null game -> "not in game" notice; thrown error -> shown verbatim.
//   - Game found -> elapsed minutes, blue/red team rows (champion resolved
//     by numeric key, fallback "#id"; riotId or first 8 chars of PUUID;
//     summoner spell ids), and the queue/map/mode footer.
//   - Refresh button re-queries; Escape / backdrop close.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { LiveGameView } from "./LiveGameView";
import type { ChampionDb } from "../types/champion";
import type { CurrentGameInfo } from "../services/riotApi";

vi.mock("../services/settingsRepo", () => ({ loadSettings: vi.fn() }));
vi.mock("../services/riotApi", () => ({
  getCurrentGameByPuuid: vi.fn(),
  getRiotProxyUrl: vi.fn(),
}));

import { loadSettings } from "../services/settingsRepo";
import { getCurrentGameByPuuid, getRiotProxyUrl } from "../services/riotApi";

const db = {
  patch: "16.10.1",
  champions: {
    "266": { key: "266", id: "Aatrox", name: "Aatrox", iconUrl: "aatrox.png", roles: [], tags: [] },
    "64": { key: "64", id: "LeeSin", name: "Lee Sin", iconUrl: "lee.png", roles: [], tags: [] },
  },
  counters: [],
  meta: [],
  fetchedAt: 0,
} as unknown as ChampionDb;

const CFG = { apiKey: "RGAPI-test", region: "euw1", riotIdName: "Me", riotIdTag: "EUW", puuid: "my-puuid" };

const GAME: CurrentGameInfo = {
  gameId: 1,
  gameStartTime: 0,
  gameLength: 754, // 12.5 min -> 12
  gameMode: "CLASSIC",
  gameType: "MATCHED",
  gameQueueConfigId: 420,
  mapId: 11,
  participants: [
    { puuid: "aaaaaaaa-blue-1", championId: 266, teamId: 100, riotId: "Rafa#EUW", spell1Id: 4, spell2Id: 12 },
    { puuid: "bbbbbbbb-blue-2", championId: 9999, teamId: 100, spell1Id: 6, spell2Id: 11 },
    { puuid: "cccccccc-red-1", championId: 64, teamId: 200, riotId: "Enemy#KR", spell1Id: 14, spell2Id: 4 },
  ],
};

async function renderView(onClose = vi.fn()) {
  const utils = render(<LiveGameView db={db} onClose={onClose} />);
  await act(async () => {});
  return { ...utils, onClose };
}

function teamPanel(title: string): HTMLElement {
  return screen.getByText(title).closest(".rounded-lg") as HTMLElement;
}

beforeEach(() => {
  vi.mocked(loadSettings).mockReset();
  vi.mocked(getCurrentGameByPuuid).mockReset();
  vi.mocked(getRiotProxyUrl).mockReset().mockReturnValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LiveGameView — configuration errors", () => {
  it("asks for a Riot ID when settings have no PUUID", async () => {
    vi.mocked(loadSettings).mockResolvedValue(null);
    await renderView();
    expect(screen.getByText(/Necesitas configurar tu Riot ID/)).toBeInTheDocument();
    expect(getCurrentGameByPuuid).not.toHaveBeenCalled();
    expect(screen.queryByText(/No estás en partida/)).not.toBeInTheDocument();
  });

  it("asks for an API key in direct mode when apiKey is missing", async () => {
    vi.mocked(loadSettings).mockResolvedValue({ ...CFG, apiKey: "" } as never);
    await renderView();
    expect(screen.getByText(/Necesitas configurar tu Riot API Key/)).toBeInTheDocument();
    expect(getCurrentGameByPuuid).not.toHaveBeenCalled();
  });

  it("does not require an API key when a proxy is configured", async () => {
    vi.mocked(getRiotProxyUrl).mockReturnValue("https://proxy.example");
    const cfg = { ...CFG, apiKey: "" };
    vi.mocked(loadSettings).mockResolvedValue(cfg as never);
    vi.mocked(getCurrentGameByPuuid).mockResolvedValue(null);
    await renderView();
    expect(getCurrentGameByPuuid).toHaveBeenCalledWith(cfg, "my-puuid");
    expect(screen.queryByText(/Riot API Key/)).not.toBeInTheDocument();
  });
});

describe("LiveGameView — states", () => {
  it("shows the searching text while the first load is pending", async () => {
    vi.mocked(loadSettings).mockReturnValue(new Promise(() => {}));
    await renderView();
    expect(screen.getByText("Buscando partida en curso...")).toBeInTheDocument();
    expect(screen.getByTitle("Refrescar")).toBeDisabled();
  });

  it("shows the not-in-game notice when Spectator returns null", async () => {
    vi.mocked(loadSettings).mockResolvedValue(CFG as never);
    vi.mocked(getCurrentGameByPuuid).mockResolvedValue(null);
    await renderView();
    expect(screen.getByText(/No estás en partida ahora mismo/)).toBeInTheDocument();
    expect(screen.queryByText("Buscando partida en curso...")).not.toBeInTheDocument();
    expect(screen.queryByText(/min$/)).not.toBeInTheDocument();
  });

  it("renders the thrown error and no not-in-game notice", async () => {
    vi.mocked(loadSettings).mockResolvedValue(CFG as never);
    vi.mocked(getCurrentGameByPuuid).mockRejectedValue(new Error("Riot 503"));
    await renderView();
    expect(screen.getByText("Error: Riot 503")).toBeInTheDocument();
    expect(screen.queryByText(/No estás en partida/)).not.toBeInTheDocument();
    expect(screen.getByTitle("Refrescar")).toBeEnabled();
  });
});

describe("LiveGameView — game found", () => {
  it("renders elapsed time, both teams and the footer", async () => {
    vi.mocked(loadSettings).mockResolvedValue(CFG as never);
    vi.mocked(getCurrentGameByPuuid).mockResolvedValue(GAME);
    await renderView();

    expect(getCurrentGameByPuuid).toHaveBeenCalledWith(CFG, "my-puuid");
    expect(screen.getByText(/12 min/)).toBeInTheDocument();
    expect(screen.getByText("Queue 420 · Map 11 · CLASSIC")).toBeInTheDocument();
    expect(screen.getByTitle("Refrescar")).toHaveTextContent(/actualizado \d+s/);

    const blue = teamPanel("Equipo azul");
    expect(within(blue).getByText("2")).toBeInTheDocument();
    expect(within(blue).getByRole("img", { name: "Aatrox" })).toHaveAttribute("src", "aatrox.png");
    expect(within(blue).getByText("Rafa#EUW")).toBeInTheDocument();
    expect(within(blue).getByText("D4")).toBeInTheDocument();
    expect(within(blue).getByText("F12")).toBeInTheDocument();
    // Unknown champion -> "#id" and PUUID prefix when no riotId.
    expect(within(blue).getByText("#9999")).toBeInTheDocument();
    expect(within(blue).getByText("bbbbbbbb")).toBeInTheDocument();
    expect(within(blue).getAllByRole("img")).toHaveLength(1);

    const red = teamPanel("Equipo rojo");
    expect(within(red).getByText("1")).toBeInTheDocument();
    expect(within(red).getByText("Lee Sin")).toBeInTheDocument();
    expect(within(red).getByText("Enemy#KR")).toBeInTheDocument();
    expect(within(red).getByText("D14")).toBeInTheDocument();
    expect(within(red).queryByText("Aatrox")).not.toBeInTheDocument();
  });

  it("clamps negative game length (loading screen) to 0 min", async () => {
    vi.mocked(loadSettings).mockResolvedValue(CFG as never);
    vi.mocked(getCurrentGameByPuuid).mockResolvedValue({ ...GAME, gameLength: -30 });
    await renderView();
    expect(screen.getByText(/^\s*0 min$/)).toBeInTheDocument();
  });
});

describe("LiveGameView — refresh", () => {
  it("re-queries when the refresh button is clicked", async () => {
    vi.mocked(loadSettings).mockResolvedValue(CFG as never);
    vi.mocked(getCurrentGameByPuuid).mockResolvedValueOnce(null).mockResolvedValueOnce(GAME);
    await renderView();
    expect(screen.getByText(/No estás en partida/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTitle("Refrescar"));
    });
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Equipo azul")).toBeInTheDocument();
    expect(screen.queryByText(/No estás en partida/)).not.toBeInTheDocument();
  });

  it("keeps the current game visible (no searching text) while a refresh is pending", async () => {
    vi.mocked(loadSettings).mockResolvedValueOnce(CFG as never).mockReturnValueOnce(new Promise(() => {}));
    vi.mocked(getCurrentGameByPuuid).mockResolvedValue(GAME);
    await renderView();
    expect(screen.getByText("Equipo azul")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTitle("Refrescar"));
    });
    expect(screen.getByTitle("Refrescar")).toBeDisabled();
    expect(screen.getByText("Equipo azul")).toBeInTheDocument();
    expect(screen.queryByText("Buscando partida en curso...")).not.toBeInTheDocument();
  });

  it("clears a previous error when a refresh succeeds", async () => {
    vi.mocked(loadSettings).mockResolvedValue(CFG as never);
    vi.mocked(getCurrentGameByPuuid).mockRejectedValueOnce(new Error("Riot 503")).mockResolvedValueOnce(GAME);
    await renderView();
    expect(screen.getByText("Error: Riot 503")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTitle("Refrescar"));
    });
    expect(screen.queryByText("Error: Riot 503")).not.toBeInTheDocument();
    expect(screen.getByText("Equipo azul")).toBeInTheDocument();
  });

  it("auto-refreshes every 30s and stops after unmount", async () => {
    vi.useFakeTimers();
    vi.mocked(loadSettings).mockResolvedValue(CFG as never);
    vi.mocked(getCurrentGameByPuuid).mockResolvedValue(null);
    const { unmount } = await renderView();
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(2);

    unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(2);
  });

  it("closes on Escape and backdrop click, not on inner click", async () => {
    vi.mocked(loadSettings).mockResolvedValue(CFG as never);
    vi.mocked(getCurrentGameByPuuid).mockResolvedValue(null);
    const { onClose, container } = await renderView();

    fireEvent.click(screen.getByText("Partida en directo"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
