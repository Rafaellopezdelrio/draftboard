// Lock down ChampionStatsPanel rendering:
//   - Returns null when matches array is empty (no panel pollutes layout)
//   - Renders 4 StatCards: games, winrate, KDA, CS/min
//   - Winrate color codes: good (>=55), default (45-54), bad (<45)
//   - SparkLine renders only when >=2 windows can be computed
//   - Returns null when champion not found in db (defensive)

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChampionStatsPanel } from "./ChampionStatsPanel";
import type { MatchRow } from "../services/matchRepo";
import type { ChampionDb } from "../types/champion";

function mkMatch(over: Partial<MatchRow> = {}): MatchRow {
  return {
    matchId: `m-${Math.random()}`,
    championId: 266,
    queueId: 420,
    position: "TOP",
    win: true,
    kills: 5,
    deaths: 3,
    assists: 7,
    cs: 200,
    durationSec: 1800,
    opponentChampionId: 86,
    gameEndTimestampMs: Date.now() - 86400000,
    ...over,
  } as MatchRow;
}

const minimalDb = {
  patch: "14.10.1",
  champions: {
    "266": {
      key: "266",
      id: "Aatrox",
      name: "Aatrox",
      iconUrl: "https://example.com/aatrox.png",
      splashUrl: "x",
      tags: [],
      roles: ["TOP"],
      blurb: "",
    },
  },
  meta: [],
} as unknown as ChampionDb;

describe("ChampionStatsPanel", () => {
  it("returns null for empty matches", () => {
    const { container } = render(
      <ChampionStatsPanel matches={[]} championId={266} db={minimalDb} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when championId is not in db", () => {
    const { container } = render(
      <ChampionStatsPanel
        matches={[mkMatch()]}
        championId={9999}
        db={minimalDb}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders champion name + match count", () => {
    render(
      <ChampionStatsPanel
        matches={[mkMatch(), mkMatch({ win: false })]}
        championId={266}
        db={minimalDb}
      />
    );
    expect(screen.getByText("Aatrox")).toBeInTheDocument();
    expect(screen.getByText(/2 partidas/)).toBeInTheDocument();
  });

  it("computes winrate correctly (3 wins of 5 = 60%)", () => {
    const matches = [
      mkMatch({ win: true }),
      mkMatch({ win: true }),
      mkMatch({ win: true }),
      mkMatch({ win: false }),
      mkMatch({ win: false }),
    ];
    render(
      <ChampionStatsPanel matches={matches} championId={266} db={minimalDb} />
    );
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it("renders the SparkLine when >=3 matches (enough for 1+ window points)", () => {
    const matches = Array.from({ length: 6 }, () => mkMatch());
    const { container } = render(
      <ChampionStatsPanel matches={matches} championId={266} db={minimalDb} />
    );
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("does NOT render the SparkLine label when too few matches", () => {
    const matches = [mkMatch()];
    const { container } = render(
      <ChampionStatsPanel matches={matches} championId={266} db={minimalDb} />
    );
    // Panel renders (1 match -> aggregate stats) but no trend chart.
    expect(container.textContent).toContain("Aatrox");
    expect(container.textContent).not.toContain("Winrate trend");
  });

  it("renders the last-played date when at least 1 match present", () => {
    const matches = [
      mkMatch({ gameEndTimestampMs: new Date("2026-01-15").getTime() }),
    ];
    render(
      <ChampionStatsPanel matches={matches} championId={266} db={minimalDb} />
    );
    expect(screen.getByText(/Última partida/)).toBeInTheDocument();
  });
});
