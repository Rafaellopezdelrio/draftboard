// "Mis campeones": filters (queue, season, search), the total row and the
// per-opponent breakdown.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ChampionStatsView } from "./ChampionStatsView";
import type { ChampionDb } from "../types/champion";
import { recentMatches, type MatchRow } from "../services/matchRepo";

vi.mock("../services/matchRepo", () => ({ recentMatches: vi.fn(async () => []) }));
vi.mock("../services/personalDataSync", () => ({ MATCHES_SYNCED_EVENT: "draftboard:matches-synced" }));

const db = {
  patch: "16.1.1",
  champions: {
    "59": { key: "59", id: "JarvanIV", name: "Jarvan IV", iconUrl: "icon/J4.png" },
    "64": { key: "64", id: "LeeSin", name: "Lee Sin", iconUrl: "icon/Lee.png" },
    "254": { key: "254", id: "Vi", name: "Vi", iconUrl: "icon/Vi.png" },
  },
} as unknown as ChampionDb;

const at = (y: number) => new Date(y, 5, 10, 20, 0).getTime();
const match = (over: Partial<MatchRow> = {}): MatchRow => ({
  matchId: `m${Math.random()}`,
  championId: 59,
  win: true,
  kills: 10,
  deaths: 5,
  assists: 10,
  cs: 180,
  durationSec: 30 * 60,
  gameEndTimestampMs: at(2026),
  queueId: 420,
  position: "JUNGLE",
  opponentChampionId: 64,
  visionScore: 30,
  goldEarned: 12000,
  ...over,
});

beforeEach(() => vi.mocked(recentMatches).mockReset().mockResolvedValue([]));

describe("ChampionStatsView", () => {
  it("lists champions with record, win rate and KDA, plus the total row", async () => {
    vi.mocked(recentMatches).mockResolvedValue([
      match(),
      match({ win: false, kills: 2, deaths: 7, assists: 4 }),
      match({ championId: 254 }),
      match({ queueId: 450, championId: 254 }), // ARAM: not in this table
    ]);
    render(<ChampionStatsView db={db} onClose={() => {}} />);
    expect(await screen.findByText("Jarvan IV")).toBeInTheDocument();
    expect(screen.getByText("Todos los campeones")).toBeInTheDocument();
    expect(screen.getByText("3 partidas")).toBeInTheDocument();
    const row = screen.getByText("Jarvan IV").closest("tr")!;
    expect(within(row).getByText("1 victorias, 1 derrotas")).toBeInTheDocument();
    expect(within(row).getByText("50%")).toBeInTheDocument();
    expect(within(row).getByText("2.17:1")).toBeInTheDocument();
    expect(within(row).getByText("6.0 / 6.0 / 7.0")).toBeInTheDocument();
    expect(within(row).getByText("6.0/min")).toBeInTheDocument(); // 180 CS in 30 min
  });

  it("queue filter: Clash only", async () => {
    vi.mocked(recentMatches).mockResolvedValue([match(), match({ championId: 254, queueId: 700 })]);
    render(<ChampionStatsView db={db} onClose={() => {}} />);
    await screen.findByText("Jarvan IV");
    fireEvent.change(screen.getByLabelText("Cola"), { target: { value: "clash" } });
    expect(screen.queryByText("Jarvan IV")).toBeNull();
    expect(screen.getByText("Vi")).toBeInTheDocument();
  });

  it("starts on the newest season and can show all of them", async () => {
    vi.mocked(recentMatches).mockResolvedValue([match(), match({ championId: 254, gameEndTimestampMs: at(2025) })]);
    render(<ChampionStatsView db={db} onClose={() => {}} />);
    await screen.findByText("Jarvan IV");
    expect(screen.queryByText("Vi")).toBeNull();
    fireEvent.change(screen.getByLabelText("Temporada"), { target: { value: "all" } });
    expect(screen.getByText("Vi")).toBeInTheDocument();
  });

  it("search finds a champion ignoring accents and case", async () => {
    vi.mocked(recentMatches).mockResolvedValue([match(), match({ championId: 254 })]);
    render(<ChampionStatsView db={db} onClose={() => {}} />);
    await screen.findByText("Jarvan IV");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "JÁRV" } });
    expect(screen.getByText("Jarvan IV")).toBeInTheDocument();
    expect(screen.queryByText("Vi")).toBeNull();
  });

  it("opening a champion shows it against each lane opponent", async () => {
    vi.mocked(recentMatches).mockResolvedValue([match(), match({ opponentChampionId: 254, win: false })]);
    render(<ChampionStatsView db={db} onClose={() => {}} />);
    await screen.findByText("Jarvan IV");
    expect(screen.queryByText("Lee Sin")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver Jarvan IV contra cada rival" }));
    expect(screen.getByText("Lee Sin")).toBeInTheDocument();
    expect(screen.getAllByText("vs")).toHaveLength(2);
  });

  it("no stored games in the queue: says so; Escape closes", async () => {
    const onClose = vi.fn();
    render(<ChampionStatsView db={db} onClose={onClose} />);
    expect(await screen.findByText(/No hay partidas guardadas de esta cola/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
