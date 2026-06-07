// MatchupGrid surfaces the WR against the CURRENT draft's lane opponent(s),
// not just the generic best/worst grid. These tests lock that callout: the
// enemy passed via enemyDdIds must resolve through ddIdToOpggKey + findMatchup
// (kept real) over the fetched list, and only show when a same-lane enemy
// actually has data.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MatchupGrid } from "./MatchupGrid";
import * as opgg from "../../services/opggMatchups";

vi.mock("../../services/opggMatchups", async (importActual) => {
  const actual = await importActual<typeof import("../../services/opggMatchups")>();
  return { ...actual, fetchOpggMatchups: vi.fn() };
});

afterEach(() => vi.clearAllMocks());

const mk = (championKey: string, championName: string, winRate: number, play = 500) => ({
  championKey,
  championName,
  winRate,
  play,
  win: Math.round((play * winRate) / 100),
});

describe("MatchupGrid — lane-opponent callout", () => {
  it("highlights our WR vs the actual enemy laner (resolved from enemyDdIds)", async () => {
    vi.mocked(opgg.fetchOpggMatchups).mockResolvedValue([
      mk("jarvaniv", "Jarvan IV", 47), // the enemy we're laning into
      mk("garen", "Garen", 55),
      mk("darius", "Darius", 44),
    ]);

    render(<MatchupGrid championDdId="LeeSin" role="JUNGLE" enemyDdIds={["JarvanIV"]} />);

    // The callout header is unique — its presence proves the enemy resolved.
    expect(await screen.findByText("Contra tu línea")).toBeTruthy();
    // Jarvan appears (callout + grid loss column); just assert it's there.
    expect(screen.getAllByText("Jarvan IV").length).toBeGreaterThan(0);
    expect(screen.getAllByText("47%").length).toBeGreaterThan(0);
  });

  it("shows no callout when no enemy is played in our role (self-filters)", async () => {
    vi.mocked(opgg.fetchOpggMatchups).mockResolvedValue([
      mk("garen", "Garen", 55),
      mk("darius", "Darius", 44),
    ]);

    render(<MatchupGrid championDdId="LeeSin" role="JUNGLE" enemyDdIds={["JarvanIV"]} />);

    // Wait on the always-visible "Matchups" section title (the Ganas/Pierdes
    // grid itself is collapsed by default now). The point of these tests is the
    // lane-opponent callout, which must be ABSENT here.
    expect(await screen.findByText("Matchups")).toBeTruthy();
    expect(screen.queryByText("Contra tu línea")).toBeNull();
  });

  it("renders nothing extra when there are no enemies", async () => {
    vi.mocked(opgg.fetchOpggMatchups).mockResolvedValue([mk("garen", "Garen", 55)]);

    render(<MatchupGrid championDdId="LeeSin" role="JUNGLE" />);

    // Wait on the always-visible "Matchups" section title (the Ganas/Pierdes
    // grid itself is collapsed by default now). The point of these tests is the
    // lane-opponent callout, which must be ABSENT here.
    expect(await screen.findByText("Matchups")).toBeTruthy();
    expect(screen.queryByText("Contra tu línea")).toBeNull();
  });
});
