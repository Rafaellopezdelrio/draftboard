// HistoryView contract:
//   - Loads the last 200 matches once, defaults to the Ranked tab with the
//     "Solo PvP real" noise filter on (customs, remakes <5min, >90 days old).
//   - Queue tabs / role buttons / debounced champion search narrow the list.
//   - Summary stats (WR, KDA, CS/min), streak banner and the rolling-WR
//     sparkline are derived from the filtered set.
//   - Each row shows champ vs opponent, queue, duration, relative time, KDA.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { HistoryView } from "./HistoryView";
import type { MatchRow } from "../services/matchRepo";
import type { ChampionDb } from "../types/champion";

vi.mock("../services/matchRepo", () => ({
  recentMatches: vi.fn(),
}));

import { recentMatches } from "../services/matchRepo";

const NOW = new Date("2026-06-15T12:00:00Z").getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function champ(key: string, name: string) {
  return { key, id: name, name, iconUrl: `https://cdn.test/${key}.png`, roles: [], tags: [] };
}

const db = {
  patch: "16.10.1",
  champions: {
    "266": champ("266", "Aatrox"),
    "103": champ("103", "Ahri"),
    "64": champ("64", "Lee Sin"),
    "432": champ("432", "Bard"),
  },
  counters: [],
  meta: [],
  fetchedAt: 0,
} as unknown as ChampionDb;

let seq = 0;
function mk(over: Partial<MatchRow> = {}): MatchRow {
  seq++;
  return {
    matchId: `EUW1_${seq}`,
    championId: 266,
    queueId: 420,
    position: "TOP",
    win: true,
    kills: 5,
    deaths: 2,
    assists: 5,
    cs: 180,
    durationSec: 1800,
    opponentChampionId: 0,
    gameEndTimestampMs: NOW - 2 * HOUR,
    ...over,
  };
}

// Newest-first, like recentMatches() returns.
function fixture(): MatchRow[] {
  return [
    mk({ matchId: "m1", opponentChampionId: 103, gameEndTimestampMs: NOW - 30_000 }),
    mk({ matchId: "m2", championId: 103, queueId: 440, position: "MIDDLE", kills: 2, deaths: 0, assists: 4, cs: 240, gameEndTimestampMs: NOW - 45 * MIN }),
    mk({ matchId: "m3", championId: 64, position: "JUNGLE", win: false, kills: 1, deaths: 5, assists: 4, gameEndTimestampMs: NOW - 5 * HOUR }),
    mk({ matchId: "m4", queueId: 400, win: false, gameEndTimestampMs: NOW - 3 * DAY }),
    mk({ matchId: "m5", championId: 432, queueId: 450, position: "", win: false, gameEndTimestampMs: NOW - 10 * DAY }),
    // Noise: custom game, remake, >90 days old
    mk({ matchId: "m6", queueId: 0, gameEndTimestampMs: NOW - 6 * HOUR }),
    mk({ matchId: "m7", durationSec: 200, gameEndTimestampMs: NOW - 7 * HOUR }),
    mk({ matchId: "m8", gameEndTimestampMs: NOW - 100 * DAY }),
    // Ranked win on a champion missing from the db
    mk({ matchId: "m9", championId: 9999, position: "BOTTOM", gameEndTimestampMs: NOW - 2 * DAY }),
  ];
}

async function renderWith(matches: MatchRow[], onClose = vi.fn()) {
  vi.mocked(recentMatches).mockResolvedValue(matches);
  const utils = render(<HistoryView db={db} onClose={onClose} />);
  // Flush the recentMatches() promise.
  await act(async () => {});
  return { ...utils, onClose };
}

function matchList(count: number) {
  return screen.getByRole("list", { name: `Partidas (${count})` });
}

beforeEach(() => {
  // Only fake setTimeout (search debounce) + Date (90-day window, "time ago").
  // requestAnimationFrame stays real so CountUp never blocks.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(NOW);
  vi.mocked(recentMatches).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HistoryView — loading + empty states", () => {
  it("requests the last 200 matches and shows the no-matches empty state", async () => {
    await renderWith([]);
    expect(recentMatches).toHaveBeenCalledWith(200);
    expect(screen.getByText("Sin partidas aún")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /Partidas/ })).toBeNull();
    expect(screen.getByText("0%")).toHaveClass("text-bad");
    expect(screen.getByText("0.00")).toBeInTheDocument();
    expect(screen.getByText("0.0")).toBeInTheDocument();
  });

  it("shows the filter empty state when matches exist but none pass the filters", async () => {
    await renderWith(fixture());
    fireEvent.click(screen.getByRole("tab", { name: "Arena" }));
    expect(screen.getByText("Sin partidas con estos filtros")).toBeInTheDocument();
    expect(screen.queryByText("Sin partidas aún")).toBeNull();
  });
});

describe("HistoryView — default Ranked + noise filter", () => {
  it("shows only recent ranked SR games and counts the hidden noise", async () => {
    await renderWith(fixture());
    const items = within(matchList(4)).getAllByRole("listitem");
    // First text node of each row's title line = champion name.
    expect(items.map((li) => li.querySelector("p")!.childNodes[0].textContent)).toEqual([
      "Aatrox",
      "Ahri",
      "Lee Sin",
      "#9999",
    ]);
    expect(screen.getByText("(3 ocultas)")).toBeInTheDocument();
  });

  it("computes winrate, average KDA and CS/min over the filtered games", async () => {
    await renderWith(fixture());
    // 3W/1L; KDA (5 + 6 + 1 + 5) / 4; CS/min (6 + 8 + 6 + 6) / 4
    expect(screen.getByText("75%")).toHaveClass("text-good");
    expect(screen.getByText("4.25")).toBeInTheDocument();
    expect(screen.getByText("6.5")).toBeInTheDocument();
  });

  it("shows a win-streak banner when the newest games share a result", async () => {
    await renderWith(fixture());
    expect(screen.getByText("Racha victorias:")).toBeInTheDocument();
    expect(screen.getByText("Racha victorias:").parentElement).toHaveTextContent(
      "Racha victorias:2consecutivas"
    );
  });

  it("unchecking 'Solo PvP real' brings customs, remakes and old games back", async () => {
    await renderWith(fixture());
    fireEvent.click(screen.getByRole("tab", { name: "Todas" }));
    matchList(6);
    fireEvent.click(screen.getByRole("checkbox"));
    matchList(9);
    // Remake row: 200s -> 3min
    expect(screen.getByText(/SoloQ · 3min · 7h/)).toBeInTheDocument();
    expect(screen.getByText(/Custom · 30min · 6h/)).toBeInTheDocument();
  });
});

describe("HistoryView — match rows", () => {
  it("renders champion, opponent, queue, duration, relative time, KDA and result", async () => {
    await renderWith(fixture());
    fireEvent.click(screen.getByRole("tab", { name: "Todas" }));
    const items = within(matchList(6)).getAllByRole("listitem");

    expect(items[0]).toHaveTextContent("Aatrox");
    expect(items[0]).toHaveTextContent("vs Ahri");
    expect(items[0]).toHaveTextContent("TOP · SoloQ · 30min · ahora");
    expect(items[0]).toHaveTextContent("5/2/5 (5.00)");
    expect(items[0]).toHaveTextContent("6.0 cs/min · 180 CS");
    expect(items[0]).toHaveTextContent("Win");
    expect(within(items[0]).getByRole("img", { name: "Aatrox" })).toHaveAttribute(
      "src",
      "https://cdn.test/266.png"
    );

    // deaths 0 -> KDA divides by 1; 240 CS / 30 min = 8.0
    expect(items[1]).toHaveTextContent("MIDDLE · Flex · 30min · 45min");
    expect(items[1]).toHaveTextContent("2/0/4 (6.00)");
    expect(items[1]).toHaveTextContent("8.0 cs/min · 240 CS");
    expect(items[1]).not.toHaveTextContent("vs ");

    expect(items[2]).toHaveTextContent("JUNGLE · SoloQ · 30min · 5h");
    expect(items[2]).toHaveTextContent("Loss");

    expect(items[3]).toHaveTextContent("TOP · Normal Draft · 30min · 3d");

    // Empty position renders an em dash; >7 days falls back to a locale date.
    expect(items[4]).toHaveTextContent(
      `— · ARAM · 30min · ${new Date(NOW - 10 * DAY).toLocaleDateString()}`
    );
  });

  it("unknown champion renders '#id' without an icon", async () => {
    await renderWith(fixture());
    const items = within(matchList(4)).getAllByRole("listitem");
    expect(items[3]).toHaveTextContent("#9999");
    expect(items[3]).toHaveTextContent("BOTTOM · SoloQ · 30min · 2d");
    expect(within(items[3]).queryByRole("img")).toBeNull();
  });
});

describe("HistoryView — filters", () => {
  it.each([
    ["SoloQ", 3],
    ["Flex", 1],
    ["Normal", 1],
    ["ARAM", 1],
    ["Todas", 6],
  ])("queue tab %s keeps %i matches", async (tab, count) => {
    await renderWith(fixture());
    fireEvent.click(screen.getByRole("tab", { name: tab }));
    expect(screen.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    matchList(count);
  });

  it("rotation tab only accepts rotating-mode queues", async () => {
    await renderWith([...fixture(), mk({ matchId: "urf", queueId: 900 })]);
    fireEvent.click(screen.getByRole("tab", { name: "Rotación" }));
    const items = within(matchList(1)).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("URF");
  });

  it("role buttons filter by position and show the single-champion stats panel", async () => {
    await renderWith(fixture());
    const jungle = screen.getByRole("tab", { name: "Jungla" });
    fireEvent.click(jungle);
    expect(jungle).toHaveAttribute("aria-selected", "true");
    expect(within(matchList(1)).getByText("Lee Sin")).toBeInTheDocument();
    expect(screen.getByText(/1 partidas con los filtros actuales/)).toBeInTheDocument();
    // One game -> no streak banner.
    expect(screen.queryByText(/Racha/)).toBeNull();
  });

  it("no single-champion panel when results mix champions", async () => {
    await renderWith(fixture());
    expect(screen.queryByText(/partidas con los filtros actuales/)).toBeNull();
  });

  it("champion search is debounced 120ms, case-insensitive, and drops unknown champions", async () => {
    await renderWith(fixture());
    fireEvent.change(screen.getByPlaceholderText("Filtrar por campeón..."), {
      target: { value: "AHR" },
    });
    // Input updates immediately, filter does not.
    expect(screen.getByPlaceholderText("Filtrar por campeón...")).toHaveValue("AHR");
    matchList(4);
    act(() => {
      vi.advanceTimersByTime(119);
    });
    matchList(4);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const items = within(matchList(1)).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Ahri");
  });

  it("rapid typing coalesces into the last value", async () => {
    await renderWith(fixture());
    const input = screen.getByPlaceholderText("Filtrar por campeón...");
    fireEvent.change(input, { target: { value: "a" } });
    act(() => {
      vi.advanceTimersByTime(60);
    });
    fireEvent.change(input, { target: { value: "lee" } });
    act(() => {
      vi.advanceTimersByTime(60);
    });
    // First keystroke's timer was cleared -> still unfiltered.
    matchList(4);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(within(matchList(1)).getByText("Lee Sin")).toBeInTheDocument();
  });

  it("search with no hits shows the filters empty state", async () => {
    await renderWith(fixture());
    fireEvent.change(screen.getByPlaceholderText("Filtrar por campeón..."), {
      target: { value: "zzz" },
    });
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(screen.getByText("Sin partidas con estos filtros")).toBeInTheDocument();
  });
});

describe("HistoryView — streaks + winrate trend", () => {
  it("shows a lose-streak banner with bad styling", async () => {
    await renderWith([
      mk({ win: false, championId: 103, gameEndTimestampMs: NOW - HOUR }),
      mk({ win: false, gameEndTimestampMs: NOW - 2 * HOUR }),
      mk({ win: false, gameEndTimestampMs: NOW - 3 * HOUR }),
      mk({ win: true, gameEndTimestampMs: NOW - 4 * HOUR }),
    ]);
    const label = screen.getByText("Racha derrotas:");
    expect(label.parentElement).toHaveTextContent("Racha derrotas:3consecutivas");
    expect(label.parentElement).toHaveClass("text-bad");
    // 1W/3L = 25% -> bad colour
    expect(screen.getByText("25%")).toHaveClass("text-bad");
  });

  it("winrate between 45 and 55 uses the neutral colour and no streak when results alternate", async () => {
    await renderWith([
      mk({ win: true, championId: 103 }),
      mk({ win: false }),
    ]);
    expect(screen.getByText("50%")).toHaveClass("text-white");
    expect(screen.queryByText(/Racha/)).toBeNull();
  });

  it("shows the WR trend sparkline only from 10 games on", async () => {
    const games = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        mk({ championId: i % 2 === 0 ? 266 : 103, win: i % 2 === 0 })
      );
    const { unmount } = await renderWith(games(9));
    expect(screen.queryByText("Tendencia WR")).toBeNull();
    unmount();
    await renderWith(games(10));
    expect(screen.getByText("Tendencia WR")).toBeInTheDocument();
    expect(screen.getByText("10 partidas")).toBeInTheDocument();
  });

  it("plots a chronological rolling 10-game winrate (oldest left)", async () => {
    // Newest-first: 2 recent wins after 10 losses -> WR rises 0% -> 10% -> 20%.
    const matches = Array.from({ length: 12 }, (_, i) =>
      mk({
        championId: i % 2 === 0 ? 266 : 103,
        win: i < 2,
        gameEndTimestampMs: NOW - (i + 1) * HOUR,
      })
    );
    const { container } = await renderWith(matches);
    expect(screen.getByText("Tendencia WR")).toBeInTheDocument();
    expect(screen.getByText("12 partidas")).toBeInTheDocument();
    const points = container
      .querySelector("polyline")!
      .getAttribute("points")!
      .split(" ")
      .map((p) => Number(p.split(",")[1]));
    expect(points).toHaveLength(3);
    // SVG y grows downward: a rising WR means strictly decreasing y.
    expect(points[0]).toBeGreaterThan(points[1]);
    expect(points[1]).toBeGreaterThan(points[2]);
  });

  it("caps the trend series at the last 30 windows", async () => {
    const matches = Array.from({ length: 45 }, (_, i) =>
      mk({
        championId: i % 2 === 0 ? 266 : 103,
        win: i % 3 === 0,
        gameEndTimestampMs: NOW - (i + 1) * HOUR,
      })
    );
    const { container } = await renderWith(matches);
    const points = container.querySelector("polyline")!.getAttribute("points")!.split(" ");
    expect(points).toHaveLength(30);
  });
});

describe("HistoryView — dialog behaviour", () => {
  it("is a labelled modal dialog", async () => {
    await renderWith([]);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)).toHaveTextContent(
      "Historial"
    );
  });

  it("closes on Escape and backdrop click, not on clicks inside", async () => {
    const { onClose } = await renderWith(fixture());
    fireEvent.click(screen.getByText("Historial"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
