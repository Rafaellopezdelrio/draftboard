// OverlayApp: useLiveGame is mocked at the module boundary (no LoL client) and
// the overlay window IPC wrappers are spies. Timers, objective attribution,
// player lookup and the live coach engine are real.
//   - Out of game: transparent placeholder, window hidden, no topmost/size IPC
//   - In game: mode, clock, kill score from MY team's side, personal stats,
//     objective ETAs, coach rows by severity, ally/enemy lists
//   - Topmost re-asserted every 1s while in game; chip size pushed to the window
//   - Close button hides the window

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type {
  LiveGameActivePlayer,
  LiveGameEvent,
  LiveGamePlayer,
  LiveGameScores,
  LiveGameSnapshot,
} from "./services/liveClient";

const live = vi.hoisted(() => ({
  state: { inGame: false, snapshot: null as LiveGameSnapshot | null },
}));
vi.mock("./hooks/useLiveGame", () => ({
  useLiveGame: () => live.state,
  useLiveGameTime: () => live.state.snapshot?.gameData.gameTime ?? 0,
}));

const ov = vi.hoisted(() => ({
  assertOverlayTopmost: vi.fn(),
  setOverlayClickthrough: vi.fn(),
  setOverlaySize: vi.fn(),
  setOverlayVisible: vi.fn(),
}));
vi.mock("./services/overlay", () => ov);

import { OverlayApp } from "./OverlayApp";

const spells = {
  summonerSpellOne: { displayName: "Flash", rawDescription: "" },
  summonerSpellTwo: { displayName: "Ignite", rawDescription: "" },
};

type PlayerOver = Omit<Partial<LiveGamePlayer>, "scores"> & {
  summonerName: string;
  scores?: Partial<LiveGameScores>;
};

function mkPlayer(over: PlayerOver): LiveGamePlayer {
  return {
    championName: "Darius",
    rawChampionName: "game_character_displayname_Darius",
    isBot: false,
    isDead: false,
    level: 10,
    position: "TOP",
    skinID: 0,
    summonerSpells: spells,
    team: "ORDER",
    items: [],
    ...over,
    scores: { kills: 0, deaths: 0, assists: 0, creepScore: 100, wardScore: 0, ...over.scores },
  };
}

function mkActive(over: Partial<LiveGameActivePlayer> = {}): LiveGameActivePlayer {
  return { summonerName: "Me#EUW", currentGold: 500, level: 10, ...over };
}

function setGame(opts: {
  gameTime: number;
  players: LiveGamePlayer[];
  active?: LiveGameActivePlayer | null;
  events?: LiveGameEvent[];
  gameMode?: string;
}) {
  live.state = {
    inGame: true,
    snapshot: {
      activePlayer: opts.active === undefined ? mkActive() : opts.active,
      allPlayers: opts.players,
      events: opts.events ?? [],
      gameData: { gameMode: opts.gameMode ?? "CLASSIC", gameTime: opts.gameTime, mapNumber: 11 },
    },
  };
}

function statValue(label: string): string | null {
  return screen.getByText(label, { selector: "span" }).nextElementSibling?.textContent ?? null;
}

function rowOf(label: string): HTMLElement {
  return screen.getByText(label).closest(".justify-between") as HTMLElement;
}

const ro = vi.hoisted(() => ({
  instances: [] as { cb: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[],
}));

class FakeResizeObserver {
  cb: () => void;
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(cb: () => void) {
    this.cb = cb;
    ro.instances.push(this);
  }
}

describe("OverlayApp", () => {
  beforeEach(() => {
    live.state = { inGame: false, snapshot: null };
    for (const fn of Object.values(ov)) fn.mockClear();
    ro.instances = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("out of game renders an invisible placeholder and hides the window", () => {
    const { container } = render(<OverlayApp />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toBeEmptyDOMElement();
    expect(root).toHaveClass("pointer-events-none");
    expect(ov.setOverlayClickthrough).toHaveBeenCalledWith(false);
    expect(ov.setOverlayVisible).toHaveBeenCalledWith(false);
    expect(ov.assertOverlayTopmost).not.toHaveBeenCalled();
    expect(ov.setOverlaySize).not.toHaveBeenCalled();
    expect(ro.instances).toHaveLength(0);
  });

  it("treats inGame without a snapshot as out of game", () => {
    live.state = { inGame: true, snapshot: null };
    const { container } = render(<OverlayApp />);
    expect(container.firstElementChild).toBeEmptyDOMElement();
    expect(screen.queryByLabelText("Cerrar overlay")).toBeNull();
  });

  it("renders mode, clock, kill score from my team and personal stats", () => {
    setGame({
      gameTime: 600,
      active: mkActive({
        currentGold: 812.6,
        level: 11,
        championStats: { currentHealth: 450.4, maxHealth: 1000, resourceMax: 0, resourceValue: 0 },
      }),
      players: [
        mkPlayer({
          summonerName: "Me#EUW",
          championName: "Ahri",
          team: "CHAOS",
          position: "MIDDLE",
          scores: { kills: 3, deaths: 1, assists: 4, creepScore: 90, wardScore: 7 },
        }),
        mkPlayer({ summonerName: "Ally", championName: "Vi", team: "CHAOS", position: "JUNGLE", scores: { kills: 5 } }),
        mkPlayer({ summonerName: "Opp", championName: "Zed", team: "ORDER", position: "MIDDLE", scores: { kills: 2 } }),
        mkPlayer({ summonerName: "Opp2", championName: "Garen", team: "ORDER", scores: { kills: 1 } }),
      ],
    });
    render(<OverlayApp />);

    expect(screen.getByText("Grieta")).toBeInTheDocument();
    expect(screen.getByText("10:00")).toBeInTheDocument();
    // I'm on CHAOS: my side = 3 + 5, enemy side = 2 + 1.
    expect(screen.getByTitle("Tu equipo")).toHaveTextContent("8");
    expect(screen.getByTitle("Equipo enemigo")).toHaveTextContent("3");

    expect(statValue("KDA")).toBe("3/1/4");
    expect(statValue("CS")).toBe("90 (9.0)");
    expect(statValue("Lvl")).toBe("11");
    expect(statValue("Gold")).toBe("813");
    expect(statValue("Ward")).toBe("7");
    expect(statValue("HP")).toBe("450/1000");

    // Allies = CHAOS (my team), enemies = ORDER.
    const allies = screen.getByText("Aliados").parentElement!;
    const enemies = screen.getByText("Enemigos").parentElement!;
    expect(within(allies).getByText("Ahri")).toBeInTheDocument();
    expect(within(allies).getByText("Vi")).toBeInTheDocument();
    expect(within(enemies).getByText("Zed")).toBeInTheDocument();
    expect(within(enemies).getByText("Garen")).toBeInTheDocument();
    expect(within(allies).queryByText("Zed")).toBeNull();
    expect(within(rowOf("Zed")).getByText("2/0/0")).toBeInTheDocument();

    // Carry marker (sword) only for the 5-kill player.
    expect(rowOf("Vi").querySelector("svg")).not.toBeNull();
    expect(rowOf("Ahri").querySelector("svg")).toBeNull();
  });

  it("defaults to ORDER, hides stats without an active player and HP without champion stats", () => {
    setGame({
      gameTime: 400,
      active: null,
      gameMode: "KIWI",
      players: [
        mkPlayer({ summonerName: "A", championName: "Ashe", team: "ORDER", scores: { kills: 4 } }),
        mkPlayer({ summonerName: "B", championName: "Brand", team: "CHAOS", scores: { kills: 1 } }),
      ],
    });
    const { unmount } = render(<OverlayApp />);
    expect(screen.getByText("Brawl")).toBeInTheDocument();
    expect(screen.getByTitle("Tu equipo")).toHaveTextContent("4");
    expect(screen.getByTitle("Equipo enemigo")).toHaveTextContent("1");
    expect(screen.queryByText("KDA")).toBeNull();
    expect(within(screen.getByText("Aliados").parentElement!).getByText("Ashe")).toBeInTheDocument();
    unmount();

    // Active player present but no matching record and no championStats.
    setGame({
      gameTime: 0,
      active: mkActive({ summonerName: "Ghost" }),
      players: [],
    });
    render(<OverlayApp />);
    expect(statValue("KDA")).toBe("0/0/0");
    expect(statValue("CS")).toBe("0 (0.0)");
    expect(screen.queryByText("HP")).toBeNull();
    expect(screen.queryByText("Aliados")).toBeNull();
    expect(screen.queryByText("Enemigos")).toBeNull();
  });

  it("shows objective countdowns and flags a due Baron as spawn", () => {
    setGame({
      gameTime: 1900,
      players: [mkPlayer({ summonerName: "Me#EUW" })],
      events: [
        { EventID: 1, EventName: "BaronKill", EventTime: 1500 },
        { EventID: 2, EventName: "DragonKill", EventTime: 1700 },
      ],
    });
    render(<OverlayApp />);
    // Dragon 1700 + 300 = 2000 -> 100s left. Baron 1500 + 360 = 1860 <= 1900.
    expect(within(rowOf("Dragón")).getByText("1:40")).toBeInTheDocument();
    expect(within(rowOf("Barón")).getByText("spawn")).toBeInTheDocument();
  });

  it("hides the objective block when no timer is pending", () => {
    setGame({ gameTime: 725, players: [mkPlayer({ summonerName: "Me#EUW" })] });
    render(<OverlayApp />);
    expect(screen.queryByText("Dragón")).toBeNull();
    expect(screen.queryByText("Barón")).toBeNull();
  });

  it("lists live coach prompts colored by severity", () => {
    setGame({
      gameTime: 900,
      active: mkActive({
        championStats: { currentHealth: 100, maxHealth: 1000, resourceMax: 0, resourceValue: 0 },
      }),
      players: [
        mkPlayer({
          summonerName: "Me#EUW",
          scores: { kills: 1, deaths: 8, assists: 2, creepScore: 150 },
        }),
        mkPlayer({ summonerName: "Opp", team: "CHAOS", scores: { creepScore: 120 } }),
      ],
    });
    render(<OverlayApp />);
    expect(
      screen.getByText("• Mueres demasiado (1/8/2). Prioriza NO morir sobre conseguir kills.")
    ).toHaveClass("text-bad");
    expect(screen.getByText("• HP al 10%: retírate o recall, evita trades.")).toHaveClass("text-meh");
    expect(
      screen.getByText("• Vas +30 CS vs Darius. Transfiere la ventaja: roam u objetivo.")
    ).toHaveClass("text-good");
  });

  it("renders info-level coach prompts with the neutral style", () => {
    setGame({
      gameTime: 900,
      active: mkActive({ currentGold: 2500 }),
      players: [mkPlayer({ summonerName: "Me#EUW", position: "UTILITY" })],
    });
    render(<OverlayApp />);
    expect(
      screen.getByText("• Tienes 2500 de oro sin gastar. Recall en la próxima ventana de oleada.")
    ).toHaveClass("text-white/70");
  });

  it("close button hides the overlay window", () => {
    setGame({ gameTime: 600, players: [mkPlayer({ summonerName: "Me#EUW" })] });
    render(<OverlayApp />);
    ov.setOverlayVisible.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar overlay" }));
    expect(ov.setOverlayVisible).toHaveBeenCalledTimes(1);
    expect(ov.setOverlayVisible).toHaveBeenCalledWith(false);
  });

  it("re-asserts topmost every second while in game and stops when the game ends", () => {
    vi.useFakeTimers();
    setGame({ gameTime: 600, players: [mkPlayer({ summonerName: "Me#EUW" })] });
    const { rerender } = render(<OverlayApp />);
    expect(ov.assertOverlayTopmost).toHaveBeenCalledTimes(1);
    expect(ov.setOverlayVisible).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(ov.assertOverlayTopmost).toHaveBeenCalledTimes(4);

    live.state = { inGame: false, snapshot: null };
    rerender(<OverlayApp />);
    expect(ov.setOverlayVisible).toHaveBeenCalledWith(false);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(ov.assertOverlayTopmost).toHaveBeenCalledTimes(4);
  });

  it("shrink-wraps the window to the chip and re-measures on resize", () => {
    let rect = { width: 200.2, height: 99.5 };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ ...rect }) as DOMRect
    );
    setGame({ gameTime: 600, players: [mkPlayer({ summonerName: "Me#EUW" })] });
    const { unmount } = render(<OverlayApp />);

    // ceil + 6px padding on each side.
    expect(ov.setOverlaySize).toHaveBeenLastCalledWith(213, 112);
    expect(ro.instances).toHaveLength(1);
    const obs = ro.instances[0];
    expect(obs.observe).toHaveBeenCalledTimes(1);
    expect(obs.observe.mock.calls[0][0]).toHaveClass("ring-1");

    rect = { width: 300, height: 150 };
    obs.cb();
    expect(ov.setOverlaySize).toHaveBeenLastCalledWith(312, 162);

    unmount();
    expect(obs.disconnect).toHaveBeenCalledTimes(1);
  });
});
