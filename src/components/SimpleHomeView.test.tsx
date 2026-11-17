// SimpleHomeView: the home screen between games. Locks the last-game summary,
// the one plain tip, the recent record and the empty state.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SimpleHomeView, nextTip, bestChampion } from "./SimpleHomeView";
import type { ChampionDb } from "../types/champion";
import { recentMatches, type MatchRow } from "../services/matchRepo";

vi.mock("../services/matchRepo", () => ({ recentMatches: vi.fn(async () => []) }));
vi.mock("../services/personalDataSync", () => ({ MATCHES_SYNCED_EVENT: "draftboard:matches-synced" }));

const db = {
  patch: "16.1.1",
  champions: {
    "64": { key: "64", id: "LeeSin", name: "Lee Sin", iconUrl: "icon/LeeSin.png" },
    "238": { key: "238", id: "Zed", name: "Zed", iconUrl: "icon/Zed.png" },
  },
} as unknown as ChampionDb;

const match = (over: Partial<MatchRow> = {}): MatchRow => ({
  matchId: `m${Math.random()}`,
  championId: 64,
  win: true,
  kills: 7,
  deaths: 3,
  assists: 11,
  cs: 180,
  durationSec: 31 * 60,
  gameEndTimestampMs: Date.now() - 20 * 60_000,
  queueId: 420,
  position: "JUNGLE",
  opponentChampionId: 0,
  visionScore: 40,
  goldEarned: 12000,
  ...over,
});

const base = {
  db,
  rank: { tier: "GOLD", division: "II", lp: 45, wins: 26, losses: 27 },
  refreshKey: null,
  onOpenReview: () => {},
  onOpenChat: () => {},
  onShowDetails: () => {},
};

beforeEach(() => vi.mocked(recentMatches).mockReset().mockResolvedValue([]));

describe("nextTip", () => {
  it("many deaths come first", () => {
    expect(nextTip(match({ deaths: 9 }))).toEqual({ key: "deaths", params: { deaths: 9 } });
    expect(nextTip(match({ kills: 1, deaths: 5, assists: 2 })).key).toBe("deaths");
  });
  it("low farm only counts for laners in a long enough game", () => {
    expect(nextTip(match({ position: "MIDDLE", cs: 120 }))).toEqual({ key: "farm", params: { perMin: "3.9" } });
    expect(nextTip(match({ position: "JUNGLE", cs: 120 })).key).toBe("win");
    expect(nextTip(match({ position: "MIDDLE", cs: 40, durationSec: 10 * 60 })).key).toBe("win");
  });
  it("then low vision, else a line that matches the result", () => {
    expect(nextTip(match({ visionScore: 8 })).key).toBe("vision");
    expect(nextTip(match({ visionScore: null, win: false })).key).toBe("loss");
  });
});

describe("bestChampion", () => {
  it("most wins, needs two games and at least one win", () => {
    const ms = [match(), match(), match({ win: false }), match({ championId: 238 }), match({ championId: 238, win: false })];
    expect(bestChampion(ms)).toEqual({ championId: 64, wins: 2, games: 3 });
    expect(bestChampion([match()])).toBeNull();
    expect(bestChampion([match({ win: false }), match({ win: false })])).toBeNull();
  });
});

describe("SimpleHomeView", () => {
  it("no stored games: plain empty state, no review button, still offers the coach", async () => {
    render(<SimpleHomeView {...base} />);
    expect(await screen.findByText(/Todavía no hay partidas guardadas/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver el repaso completo" })).toBeNull();
    expect(screen.getByRole("button", { name: "Preguntar al coach" })).toBeInTheDocument();
    expect(screen.getByText("Yo me encargo")).toBeInTheDocument();
  });

  it("shows the last game, one tip, the record and the best champion", async () => {
    vi.mocked(recentMatches).mockResolvedValue([
      match({ deaths: 9 }),
      match(),
      match({ win: false }),
      match({ championId: 238, win: false }),
    ]);
    render(<SimpleHomeView {...base} />);
    expect(await screen.findByText("Victoria con Lee Sin")).toBeInTheDocument();
    expect(screen.getByText("7 / 9 / 11")).toBeInTheDocument();
    expect(screen.getByText(/31 minutos · hace 20 min/)).toBeInTheDocument();
    expect(screen.getByText(/Moriste 9 veces/)).toBeInTheDocument();
    expect(screen.getByText("Últimas 4 clasificatorias")).toBeInTheDocument();
    expect(screen.getByText("Oro II")).toBeInTheDocument();
    expect(screen.getByText("45 LP")).toBeInTheDocument();
    // Below the squares: the whole Solo/Duo season, not the last ten again.
    expect(screen.getByText("26V 27D")).toBeInTheDocument();
    expect(screen.getByText("53 partidas en Solo/Dúo · 49% victorias")).toBeInTheDocument();
    expect(screen.queryByText("2 – 2")).toBeNull();
    expect(screen.getByText("Tu mejor campeón reciente: Lee Sin (2 de 3 ganadas).")).toBeInTheDocument();
  });

  it("the record counts Ranked Solo/Duo only and shows one square per game, newest first", async () => {
    vi.mocked(recentMatches).mockResolvedValue([
      match({ win: false, championId: 238 }),
      match({ position: "", queueId: 1750 }), // Arena from match history: not counted
      match({ position: "UTILITY", queueId: 1750 }), // Arena read from the client still has a position
      match({ queueId: 400 }), // normal draft: not ranked
      match(),
    ]);
    render(<SimpleHomeView {...base} />);
    expect(await screen.findByText("Últimas 2 clasificatorias")).toBeInTheDocument();
    const row = screen.getByRole("list", { name: "Más reciente a la izquierda" });
    expect(Array.from(row.querySelectorAll("li"), (li) => li.textContent)).toEqual(["D", "V"]);
    expect(screen.getByLabelText("Zed · derrota")).toBeInTheDocument();
  });

  it("Master and above show no division", async () => {
    vi.mocked(recentMatches).mockResolvedValue([match()]);
    render(<SimpleHomeView {...base} rank={{ tier: "MASTER", division: "I", lp: 120, wins: 1, losses: 0 }} />);
    expect(await screen.findByText("Maestro")).toBeInTheDocument();
    expect(screen.getByText("120 LP")).toBeInTheDocument();
    expect(screen.getByText("1 partida en Solo/Dúo · 100% victorias")).toBeInTheDocument();
  });

  it("rank known but no season totals yet: falls back to the last ten record", async () => {
    vi.mocked(recentMatches).mockResolvedValue([match(), match({ win: false })]);
    render(<SimpleHomeView {...base} rank={{ tier: "GOLD", division: "II", lp: 0, wins: 0, losses: 0 }} />);
    expect(await screen.findByText("1 – 1")).toBeInTheDocument();
    expect(screen.queryByText(/partidas en Solo\/Dúo/)).toBeNull();
  });

  it("ranked but no ranked games stored: shows the rank and says so", async () => {
    vi.mocked(recentMatches).mockResolvedValue([match({ queueId: 450, position: "" })]);
    render(<SimpleHomeView {...base} />);
    expect(await screen.findByText("Oro II")).toBeInTheDocument();
    expect(screen.getByText("Todavía no hay clasificatorias guardadas.")).toBeInTheDocument();
    expect(screen.queryByText("Victorias – derrotas")).toBeNull();
  });

  it("no rank and no ranked games: no rank card", async () => {
    vi.mocked(recentMatches).mockResolvedValue([match({ position: "", queueId: 1750 })]);
    render(<SimpleHomeView {...base} rank={null} />);
    expect(await screen.findByText("Victoria con Lee Sin")).toBeInTheDocument();
    expect(screen.queryByText("Tu ELO")).toBeNull();
  });

  it("known unranked player with ranked games: says so instead of a tier", async () => {
    vi.mocked(recentMatches).mockResolvedValue([match()]);
    render(<SimpleHomeView {...base} rank="unranked" />);
    expect(await screen.findByText("Sin clasificar")).toBeInTheDocument();
    expect(screen.getByText("Última clasificatoria")).toBeInTheDocument();
    expect(screen.queryByText(/LP$/)).toBeNull();
  });

  it("rank not known yet (client closed, never seen): asks to open the client, never claims unranked", async () => {
    vi.mocked(recentMatches).mockResolvedValue([match()]);
    render(<SimpleHomeView {...base} rank={null} />);
    expect(await screen.findByText(/Abre el cliente de LoL una vez/)).toBeInTheDocument();
    expect(screen.queryByText("Sin clasificar")).toBeNull();
    expect(screen.getByText("1 – 0")).toBeInTheDocument();
  });

  it("a loss says so, and the buttons call back", async () => {
    vi.mocked(recentMatches).mockResolvedValue([match({ win: false, championId: 238 })]);
    const onOpenReview = vi.fn();
    const onOpenChat = vi.fn();
    const onShowDetails = vi.fn();
    render(<SimpleHomeView {...base} onOpenReview={onOpenReview} onOpenChat={onOpenChat} onShowDetails={onShowDetails} />);
    expect(await screen.findByText("Derrota con Zed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver el repaso completo" }));
    fireEvent.click(screen.getByRole("button", { name: "Preguntar al coach" }));
    fireEvent.click(screen.getByRole("button", { name: /Ver más detalles/ }));
    expect(onOpenReview).toHaveBeenCalledTimes(1);
    expect(onOpenChat).toHaveBeenCalledTimes(1);
    expect(onShowDetails).toHaveBeenCalledTimes(1);
  });

  it("shows the games as soon as a sync stores them (was stuck on 'no games yet')", async () => {
    render(<SimpleHomeView {...base} />);
    await screen.findByText(/Todavía no hay partidas guardadas/);
    vi.mocked(recentMatches).mockResolvedValue([match()]);
    window.dispatchEvent(new CustomEvent("draftboard:matches-synced"));
    expect(await screen.findByText("Victoria con Lee Sin")).toBeInTheDocument();
  });

  it("reads the stored games again when a game ends", async () => {
    const { rerender } = render(<SimpleHomeView {...base} refreshKey="EndOfGame" />);
    await screen.findByText(/Todavía no hay partidas guardadas/);
    rerender(<SimpleHomeView {...base} refreshKey="None" />);
    expect(vi.mocked(recentMatches)).toHaveBeenCalledTimes(2);
  });
});
