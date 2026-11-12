// SimpleLiveView: the in-game simple screen. Locks the headline pick, the
// countdowns, the buy card and which enemies get a line.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { SimpleLiveView, goldValue, laneLeads, pickRivals } from "./SimpleLiveView";
import type { ChampionDb } from "../types/champion";
import type { LiveGamePlayer, LiveGameSnapshot } from "../services/liveClient";
import type { LiveGameState } from "../hooks/useLiveGame";
import { coachLiveGame } from "../engine/liveCoachEngine";
import { suggestInGameAdaptations } from "../engine/inGameAdapter";

const live = vi.hoisted(() => ({ state: { inGame: false, snapshot: null, reason: "loading" } as unknown }));
vi.mock("../hooks/useLiveGame", () => ({
  useLiveGame: () => live.state,
  useLiveGameTime: (s: LiveGameState) => s.snapshot?.gameData.gameTime ?? 0,
}));
vi.mock("../engine/liveCoachEngine", () => ({ coachLiveGame: vi.fn(() => []) }));
vi.mock("../engine/inGameAdapter", () => ({ suggestInGameAdaptations: vi.fn(() => []) }));
vi.mock("../engine/adaptiveBuildEngine", () => ({ suggestBuildAdaptations: vi.fn(() => []) }));
vi.mock("../services/liveTimers", async (actual) => ({
  ...(await actual<typeof import("../services/liveTimers")>()),
  deriveTimers: vi.fn(() => ({ nextDragonAt: 805, nextBaronAt: 1200 })),
}));
vi.mock("../services/overlay", () => ({ setOverlayVisible: vi.fn(async () => {}) }));
vi.mock("../data/powerSpikes", () => ({ getPowerSpikes: () => null }));
vi.mock("./LiveGamePanel", () => ({ LiveVoice: () => null }));
vi.mock("./build/MatchupBuildCard", () => ({
  MatchupBuildCard: (p: { championDdId: string; knownOpponentKey?: string | null }) => (
    <div data-testid="matchup-card">{`${p.championDdId}|${p.knownOpponentKey}`}</div>
  ),
}));
vi.mock("./build/icons", () => ({ ItemIcon: ({ id }: { id: number }) => <span>{`item-${id}`}</span> }));

const champ = (key: string, id: string, name = id) => ({ key, id, name, iconUrl: `icon/${id}.png`, tags: [] });
const db = {
  patch: "16.1.1",
  champions: {
    "64": champ("64", "LeeSin", "Lee Sin"),
    "238": champ("238", "Zed"),
    "121": champ("121", "Khazix", "Kha'Zix"),
    "350": champ("350", "Yuumi"),
    "222": champ("222", "Jinx"),
  },
} as unknown as ChampionDb;

const player = (
  id: string,
  team: "ORDER" | "CHAOS",
  position: string,
  kills = 0,
  deaths = 0
): LiveGamePlayer =>
  ({
    championName: id,
    rawChampionName: `game_character_displayname_${id}`,
    team,
    position,
    scores: { kills, deaths, assists: 0, creepScore: 0, wardScore: 0 },
    items: [],
    summonerName: id === "LeeSin" ? "me" : id,
    riotIdGameName: id === "LeeSin" ? "me" : id,
    level: 9,
    isDead: false,
    isBot: false,
  }) as unknown as LiveGamePlayer;

const snapshot = (gold = 400): LiveGameSnapshot =>
  ({
    activePlayer: { summonerName: "me", riotIdGameName: "me", currentGold: gold, level: 9 },
    allPlayers: [
      player("LeeSin", "ORDER", "JUNGLE", 2, 1),
      player("Zed", "CHAOS", "MIDDLE", 6, 1),
      player("Khazix", "CHAOS", "JUNGLE", 2, 2),
      player("Yuumi", "CHAOS", "UTILITY", 0, 5),
      player("Jinx", "CHAOS", "BOTTOM", 1, 1),
    ],
    events: [],
    gameData: { gameMode: "CLASSIC", gameTime: 760, mapNumber: 11 },
  }) as unknown as LiveGameSnapshot;

const base = {
  db,
  buildChampionKey: "64",
  buildRole: "JUNGLE" as const,
  enemyKeys: ["238", "121", "350", "222"],
  noLaneMode: false,
  onShowDetails: () => {},
};

beforeEach(() => {
  live.state = { inGame: true, snapshot: snapshot(), reason: "in-game" };
  vi.mocked(coachLiveGame).mockReset().mockReturnValue([]);
  vi.mocked(suggestInGameAdaptations).mockReset().mockReturnValue([]);
});

describe("laneLeads", () => {
  it("pairs each lane and compares items bought plus farm", () => {
    const me = { ...player("LeeSin", "ORDER", "JUNGLE"), items: [{ price: 1000, count: 1 }] } as unknown as LiveGamePlayer;
    const them = { ...player("Khazix", "CHAOS", "JUNGLE"), scores: { kills: 0, deaths: 0, assists: 0, creepScore: 10, wardScore: 0 } } as unknown as LiveGamePlayer;
    expect(goldValue(me)).toBe(1000);
    expect(goldValue(them)).toBe(200);
    const leads = laneLeads([me], [them, player("Zed", "CHAOS", "MIDDLE")]);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ lane: "JUNGLE", lead: 800 });
  });
});

describe("pickRivals", () => {
  it("fed enemies first, then their jungler, then the weakest; quiet ones are left out", () => {
    const r = pickRivals(snapshot().allPlayers.filter((p) => p.team === "CHAOS"));
    expect(r.map((x) => [x.player.championName, x.tone])).toEqual([
      ["Zed", "danger"],
      ["Khazix", "watch"],
      ["Yuumi", "weak"],
    ]);
  });
  it("a fed jungler is a danger, not listed twice", () => {
    const r = pickRivals([player("Khazix", "CHAOS", "JUNGLE", 7, 1)]);
    expect(r).toHaveLength(1);
    expect(r[0].tone).toBe("danger");
  });
});

describe("SimpleLiveView", () => {
  it("before the game data arrives: loading state with the way out", () => {
    live.state = { inGame: false, snapshot: null, reason: "loading" };
    const onShowDetails = vi.fn();
    render(<SimpleLiveView {...base} onShowDetails={onShowDetails} />);
    expect(screen.getByText("Cargando la partida…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ver más detalles/ }));
    expect(onShowDetails).toHaveBeenCalledTimes(1);
  });

  it("headline is the most urgent coach line in plain words; the next one sits under it", () => {
    vi.mocked(coachLiveGame).mockReturnValue([
      { key: "recall", severity: "info", textKey: "liveCoach.recall", params: { gold: 1500 } },
      { key: "obj", severity: "warn", textKey: "liveCoach.objDragon", params: { eta: 45 } },
      { key: "deaths", severity: "critical", textKey: "liveCoach.deathsCritical", params: { k: 0, d: 6, a: 1 } },
    ]);
    render(<SimpleLiveView {...base} />);
    const now = screen.getByRole("region", { name: "Ahora mismo" });
    expect(within(now).getByRole("heading").textContent).toBe(
      "Estás muriendo demasiado (0/6/1). Ahora lo primero es no morir."
    );
    expect(within(now).getByText("Dragón en 45 segundos. Empuja tu línea y pon visión en el río.")).toBeInTheDocument();
    expect(now.textContent).not.toMatch(/CS|recall|wardea/i);
  });

  it("nothing urgent: calm line, and both countdowns tick from the timers", () => {
    render(<SimpleLiveView {...base} />);
    const now = screen.getByRole("region", { name: "Ahora mismo" });
    expect(within(now).getByText("Todo en orden. Sigue sumando oro y mira el mapa.")).toBeInTheDocument();
    expect(within(now).getByText("0:45")).toBeInTheDocument();
    expect(within(now).getByText("7:20")).toBeInTheDocument();
    expect(within(now).getByText(/minuto 12:40/)).toBeInTheDocument();
  });

  it("buy card: item counters, the plan against the real lane opponent, and the gold line", () => {
    vi.mocked(suggestInGameAdaptations).mockReturnValue([
      { itemId: 3111, itemName: "Botas de mercurio", reason: "Tienen mucho control", priority: "core", key: "mr" },
    ]);
    live.state = { inGame: true, snapshot: snapshot(1250), reason: "in-game" };
    render(<SimpleLiveView {...base} />);
    const buy = screen.getByRole("region", { name: "Lo siguiente" });
    expect(within(buy).getByText("Botas de mercurio")).toBeInTheDocument();
    expect(within(buy).getByText("Tienen mucho control")).toBeInTheDocument();
    expect(within(buy).getByTestId("matchup-card")).toHaveTextContent("LeeSin|121");
    expect(within(buy).getByText("Tienes 1250 de oro: vuelve a base cuando puedas.")).toBeInTheDocument();
  });

  it("rivals card names who to fear, who to watch and who to attack", () => {
    render(<SimpleLiveView {...base} />);
    const rivals = screen.getByRole("region", { name: "Ojo con" });
    expect(within(rivals).getByText("Va 6/1. No pelees solo contra él.")).toBeInTheDocument();
    expect(within(rivals).getByText("Peligro")).toBeInTheDocument();
    expect(within(rivals).getByText("Kha'Zix")).toBeInTheDocument();
    expect(within(rivals).getByText("Atento")).toBeInTheDocument();
    expect(within(rivals).getByText("Va 0/5. Buen objetivo para atacar.")).toBeInTheDocument();
    expect(within(rivals).queryByText("Jinx")).toBeNull();
  });
});
