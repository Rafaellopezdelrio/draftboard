// LiveGamePanel: useLiveGame is mocked at the module boundary (no LoL client),
// overlay IPC is mocked, voiceCoach is spied. Timers, objective attribution,
// live coach and item-counter engines are real.
//   - Hidden out of game; overlay visibility follows inGame && pref
//   - Header: mode label + clock; kill score split by MY team (not ORDER)
//   - Gold / level of the active player
//   - Dragon / Baron ETA rows, "spawn" when due
//   - Live coach rows by severity; criticals spoken once, session reset on unmount
//   - Item counters resolved from the live champion (rawChampionName -> db)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ChampionDb } from "../types/champion";
import type {
  LiveGameActivePlayer,
  LiveGameEvent,
  LiveGamePlayer,
  LiveGameScores,
  LiveGameSnapshot,
} from "../services/liveClient";

const live = vi.hoisted(() => ({
  state: { inGame: false, snapshot: null as LiveGameSnapshot | null },
}));
vi.mock("../hooks/useLiveGame", () => ({
  useLiveGame: () => live.state,
  useLiveGameTime: () => live.state.snapshot?.gameData.gameTime ?? 0,
}));

const setOverlayVisible = vi.hoisted(() => vi.fn());
vi.mock("../services/overlay", () => ({ setOverlayVisible }));

import { LiveGamePanel } from "./LiveGamePanel";
import { usePrefsStore, DEFAULT_PREFS } from "../state/prefsStore";
import { voiceCoach } from "../services/voiceCoach";

const speak = vi.spyOn(voiceCoach, "speak").mockImplementation(() => {});
const resetSession = vi.spyOn(voiceCoach, "resetSession").mockImplementation(() => {});

function champ(key: string, id: string, tags: string[]) {
  return {
    key,
    id,
    name: id,
    title: "",
    iconUrl: "",
    splashUrl: "",
    tags,
    roles: [],
    archetypes: [],
  };
}

const db = {
  patch: "14.10.1",
  champions: {
    "222": champ("222", "Jinx", ["Marksman"]),
    "122": champ("122", "Darius", ["Fighter", "Tank"]),
  },
  counters: [],
  meta: [],
  fetchedAt: 0,
} as unknown as ChampionDb;

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

function rowOf(label: string): HTMLElement {
  return screen.getByText(label).closest(".justify-between") as HTMLElement;
}

describe("LiveGamePanel", () => {
  beforeEach(() => {
    live.state = { inGame: false, snapshot: null };
    usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, showInGameOverlay: false } });
    setOverlayVisible.mockClear();
    speak.mockClear();
    resetSession.mockClear();
  });

  it("renders nothing out of game and keeps the overlay hidden", () => {
    usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, showInGameOverlay: true } });
    const { container } = render(<LiveGamePanel db={db} />);
    expect(container).toBeEmptyDOMElement();
    expect(setOverlayVisible).toHaveBeenLastCalledWith(false);
  });

  it("shows the overlay in game only when the pref is on", () => {
    setGame({ gameTime: 600, players: [mkPlayer({ summonerName: "Me#EUW" })] });
    const { unmount } = render(<LiveGamePanel db={db} />);
    expect(setOverlayVisible).toHaveBeenLastCalledWith(false);
    unmount();

    usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, showInGameOverlay: true } });
    render(<LiveGamePanel db={db} />);
    expect(setOverlayVisible).toHaveBeenLastCalledWith(true);
  });

  it("renders mode, clock, my stats and the kill score from my team's side", () => {
    setGame({
      gameTime: 725,
      active: mkActive({ currentGold: 1234.6, level: 11 }),
      players: [
        mkPlayer({ summonerName: "Me#EUW", team: "CHAOS", scores: { kills: 3 } }),
        mkPlayer({ summonerName: "Ally", team: "CHAOS", position: "JUNGLE", scores: { kills: 4 } }),
        mkPlayer({ summonerName: "Opp", team: "ORDER", scores: { kills: 2 } }),
        mkPlayer({ summonerName: "Opp2", team: "ORDER", position: "MIDDLE", scores: { kills: 6 } }),
      ],
    });
    render(<LiveGamePanel />);

    expect(screen.getByText("Live · Grieta")).toBeInTheDocument();
    expect(screen.getByText("12:05")).toBeInTheDocument();
    // I'm on CHAOS, so "my team" = CHAOS kills (3 + 4), enemy = ORDER (2 + 6).
    expect(screen.getByTitle("Tu equipo")).toHaveTextContent("7");
    expect(screen.getByTitle("Equipo enemigo")).toHaveTextContent("8");
    expect(within(screen.getByText("Gold").parentElement!).getByText("1235")).toBeInTheDocument();
    expect(within(screen.getByText("Lvl").parentElement!).getByText("11")).toBeInTheDocument();

    // Past 5:00 with no kill events -> no objective rows; quiet game -> no coach.
    expect(screen.queryByText("Dragón")).toBeNull();
    expect(screen.queryByText("Barón")).toBeNull();
    expect(screen.queryByText("Coach en vivo")).toBeNull();
    expect(screen.queryByText("Counters según items enemigos")).toBeNull();
  });

  it("defaults to ORDER as my team and hides stats without an active player", () => {
    setGame({
      gameTime: 120,
      active: null,
      gameMode: "KIWI",
      players: [
        mkPlayer({ summonerName: "A", team: "ORDER", scores: { kills: 5 } }),
        mkPlayer({ summonerName: "B", team: "CHAOS", scores: { kills: 2 } }),
      ],
    });
    render(<LiveGamePanel db={db} />);
    expect(screen.getByText("Live · Brawl")).toBeInTheDocument();
    expect(screen.getByTitle("Tu equipo")).toHaveTextContent("5");
    expect(screen.getByTitle("Equipo enemigo")).toHaveTextContent("2");
    expect(screen.queryByText("Gold")).toBeNull();
  });

  it("counts down to the first dragon before 5:00", () => {
    setGame({ gameTime: 200, players: [mkPlayer({ summonerName: "Me#EUW" })] });
    render(<LiveGamePanel />);
    expect(within(rowOf("Dragón")).getByText("1:40")).toBeInTheDocument();
    expect(screen.queryByText("Barón")).toBeNull();
  });

  it("projects respawns from kill events and flags a due Baron as spawn", () => {
    setGame({
      gameTime: 1900,
      players: [mkPlayer({ summonerName: "Me#EUW" })],
      events: [
        { EventID: 1, EventName: "BaronKill", EventTime: 1500 },
        { EventID: 2, EventName: "DragonKill", EventTime: 1700 },
      ],
    });
    render(<LiveGamePanel />);
    // Dragon 1700 + 300 = 2000 -> 100s left. Baron 1500 + 360 = 1860 <= 1900.
    expect(within(rowOf("Dragón")).getByText("1:40")).toBeInTheDocument();
    expect(within(rowOf("Barón")).getByText("spawn")).toBeInTheDocument();
  });

  it("lists live coach prompts by severity and speaks only the critical one, once", () => {
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
    const { rerender, unmount } = render(<LiveGamePanel />);

    expect(screen.getByText("Coach en vivo")).toBeInTheDocument();
    const critical = screen.getByText(
      "Mueres demasiado (1/8/2). Prioriza NO morir sobre conseguir kills."
    );
    const warn = screen.getByText("HP al 10%: retírate o recall, evita trades.");
    const good = screen.getByText("Vas +30 CS vs Darius. Transfiere la ventaja: roam u objetivo.");
    expect(critical).toHaveClass("text-bad");
    expect(warn).toHaveClass("text-meh");
    expect(good).toHaveClass("text-good");
    // Highest severity first.
    expect(critical.compareDocumentPosition(warn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(warn.compareDocumentPosition(good) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith(
      "Mueres demasiado (1/8/2). Prioriza NO morir sobre conseguir kills.",
      "live-deaths-critical"
    );

    // Same criticals on the next poll -> not re-spoken.
    rerender(<LiveGamePanel />);
    expect(speak).toHaveBeenCalledTimes(1);

    expect(resetSession).not.toHaveBeenCalled();
    unmount();
    expect(resetSession).toHaveBeenCalledTimes(1);
  });

  it("renders info-level prompts with the neutral style", () => {
    setGame({
      gameTime: 900,
      active: mkActive({ currentGold: 2500 }),
      players: [mkPlayer({ summonerName: "Me#EUW", position: "UTILITY" })],
    });
    render(<LiveGamePanel />);
    const row = screen.getByText("Tienes 2500 de oro sin gastar. Recall en la próxima ventana de oleada.");
    expect(row).toHaveClass("text-white/80");
    expect(speak).not.toHaveBeenCalled();
  });

  it("suggests item counters for the champion actually being played", () => {
    const healer = (name: string) =>
      mkPlayer({
        summonerName: name,
        team: "CHAOS",
        position: "JUNGLE",
        items: [{ itemID: 3072, count: 1, slot: 0, price: 0, canUse: false, displayName: "", consumable: false }],
      });
    setGame({
      gameTime: 900,
      players: [
        mkPlayer({
          summonerName: "Me#EUW",
          championName: "Jinx",
          rawChampionName: "game_character_displayname_Jinx",
          position: "BOTTOM",
          level: 12,
        }),
        healer("E1"),
        healer("E2"),
      ],
    });
    render(<LiveGamePanel db={db} />);

    expect(screen.getByText("Counters según items enemigos")).toBeInTheDocument();
    const item = screen.getByText("Mortal Reminder");
    const card = item.closest("[title]") as HTMLElement;
    expect(card).toHaveAttribute("title", "2 enemigos curándose — Grievous Wounds AD");
    expect(card).toHaveClass("bg-bad/10");
    const img = card.querySelector("img") as HTMLImageElement;
    expect(img).toHaveAttribute(
      "src",
      "https://ddragon.leagueoflegends.com/cdn/14.10.1/img/item/3033.png"
    );
    fireEvent.error(img);
    expect(img.style.display).toBe("none");

    // Jinx at level 12 (two items) is on a power spike.
    expect(
      screen.getByText("Pico de poder (9/10): fuerza peleas y objetivos ahora.")
    ).toBeInTheDocument();
  });

  it("marks fallback counters as situational and skips them without a champion db", () => {
    const healer = (name: string) =>
      mkPlayer({
        summonerName: name,
        team: "CHAOS",
        items: [{ itemID: 3072, count: 1, slot: 0, price: 0, canUse: false, displayName: "", consumable: false }],
      });
    const owned = { itemID: 3033, count: 1, slot: 0, price: 0, canUse: false, displayName: "", consumable: false };
    setGame({
      gameTime: 900,
      players: [
        mkPlayer({
          summonerName: "Me#EUW",
          rawChampionName: "game_character_displayname_Jinx",
          items: [owned],
        }),
        healer("E1"),
        healer("E2"),
      ],
    });
    const { unmount } = render(<LiveGamePanel db={db} />);
    // Already owns Mortal Reminder -> cheap anti-heal fallback.
    expect(screen.queryByText("Mortal Reminder")).toBeNull();
    expect(screen.getByText("Bramble Vest").closest("[title]")).toHaveClass("bg-meh/10");
    unmount();

    render(<LiveGamePanel db={null} />);
    expect(screen.queryByText("Counters según items enemigos")).toBeNull();
  });
});
