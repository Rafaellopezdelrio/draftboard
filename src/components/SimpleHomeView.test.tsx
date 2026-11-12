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
  rankTier: "GOLD",
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
    expect(screen.getByText("Últimas 4 partidas")).toBeInTheDocument();
    expect(screen.getByText("2 – 2")).toBeInTheDocument();
    expect(screen.getByText("gold")).toBeInTheDocument();
    expect(screen.getByText("Tu mejor campeón reciente: Lee Sin (2 de 3 ganadas).")).toBeInTheDocument();
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
