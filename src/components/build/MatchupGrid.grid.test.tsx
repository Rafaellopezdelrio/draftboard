// MatchupGrid — loading/empty states and the collapsible Ganas/Pierdes grid
// (the lane-opponent callout lives in MatchupGrid.test.tsx):
//   - Loading copy until the op.gg fetch resolves; empty list -> nothing.
//   - Only matchups with >= 50 games count. Wins sorted best-first, losses
//     worst-first, 4 per side; > 8 total enables "Ver todos" (cap 20).
//   - Threat tier from |WR - 50|: >=7 S, >=4 A, >=2 B, else C.
//   - Changing champion/role refetches and ignores the stale response.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { MatchupGrid } from "./MatchupGrid";
import * as opgg from "../../services/opggMatchups";
import type { OpggMatchup } from "../../services/opggMatchups";

vi.mock("../../services/opggMatchups", async (importActual) => {
  const actual = await importActual<typeof import("../../services/opggMatchups")>();
  return { ...actual, fetchOpggMatchups: vi.fn() };
});

const mk = (championKey: string, championName: string, winRate: number, play = 500): OpggMatchup =>
  ({
    championKey,
    championName,
    winRate,
    play,
    win: Math.round((play * winRate) / 100),
  }) as OpggMatchup;

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function column(title: string): HTMLElement {
  return screen.getByText(title).parentElement as HTMLElement;
}

function names(col: HTMLElement): string[] {
  return within(col)
    .queryAllByRole("listitem")
    .map((li) => li.querySelector("span")!.textContent!);
}

async function openGrid() {
  const header = await screen.findByRole("button", { name: /Matchups/ });
  fireEvent.click(header);
}

describe("MatchupGrid — states", () => {
  it("shows the loading copy until matchups arrive", async () => {
    let resolve!: (m: OpggMatchup[]) => void;
    vi.mocked(opgg.fetchOpggMatchups).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<MatchupGrid championDdId="Aatrox" role="TOP" />);

    expect(screen.getByText("Cargando matchups…")).toBeInTheDocument();
    expect(opgg.fetchOpggMatchups).toHaveBeenCalledWith("Aatrox", "TOP");

    await act(async () => resolve([mk("garen", "Garen", 55)]));
    expect(screen.queryByText("Cargando matchups…")).toBeNull();
    expect(screen.getByText("Matchups")).toBeInTheDocument();
  });

  it("renders nothing when op.gg has no matchups", async () => {
    vi.mocked(opgg.fetchOpggMatchups).mockResolvedValue([]);
    const { container } = render(<MatchupGrid championDdId="Aatrox" role="TOP" />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("refetches on champion change and ignores the stale response", async () => {
    const pending: Array<(m: OpggMatchup[]) => void> = [];
    vi.mocked(opgg.fetchOpggMatchups).mockImplementation(
      () => new Promise((r) => pending.push(r))
    );
    const { rerender } = render(<MatchupGrid championDdId="Aatrox" role="TOP" />);
    rerender(<MatchupGrid championDdId="Darius" role="TOP" />);
    expect(opgg.fetchOpggMatchups).toHaveBeenLastCalledWith("Darius", "TOP");

    // Old (Aatrox) response lands late -> discarded, still loading.
    await act(async () => pending[0]([mk("old", "Viejo", 60)]));
    expect(screen.getByText("Cargando matchups…")).toBeInTheDocument();

    await act(async () => pending[1]([mk("new", "Nuevo", 60)]));
    await openGrid();
    expect(screen.getByText("Nuevo")).toBeInTheDocument();
    expect(screen.queryByText("Viejo")).toBeNull();
  });
});

describe("MatchupGrid — Ganas/Pierdes grid", () => {
  const DATA = [
    mk("a", "Win51", 51),
    mk("b", "Win57", 57),
    mk("c", "Lose42", 42),
    mk("d", "Win54", 54),
    mk("e", "Lose49", 49),
    mk("f", "Win52", 52),
    mk("g", "Even50", 50),
    mk("h", "Lose47", 47),
    mk("i", "TinySample", 70, 30),
  ];

  it("is collapsed by default with the significant-matchup count as summary", async () => {
    vi.mocked(opgg.fetchOpggMatchups).mockResolvedValue(DATA);
    render(<MatchupGrid championDdId="Aatrox" role="TOP" />);
    const header = await screen.findByRole("button", { name: /Matchups/ });
    expect(header).toHaveAttribute("aria-expanded", "false");
    // 9 rows, one below the 50-game threshold.
    expect(within(header).getByText("8")).toBeInTheDocument();
    expect(screen.queryByText("Ganas vs")).toBeNull();
  });

  it("sorts wins best-first and losses worst-first, 4 per side, dropping low samples", async () => {
    vi.mocked(opgg.fetchOpggMatchups).mockResolvedValue(DATA);
    render(<MatchupGrid championDdId="Aatrox" role="TOP" />);
    await openGrid();

    expect(names(column("Ganas vs"))).toEqual(["Win57", "Win54", "Win52", "Win51"]);
    expect(names(column("Pierdes vs"))).toEqual(["Lose42", "Lose47", "Lose49"]);
    expect(screen.queryByText("TinySample")).toBeNull();
    // 8 significant matchups is not "> 8" -> no expand toggle.
    expect(screen.queryByText(/Ver todos/)).toBeNull();
  });

  // Win57 (delta exactly 7) and Win52 (delta exactly 2) pin the >= boundaries.
  it("labels threat tiers and colors them by side and severity", async () => {
    vi.mocked(opgg.fetchOpggMatchups).mockResolvedValue(DATA);
    render(<MatchupGrid championDdId="Aatrox" role="TOP" />);
    await openGrid();

    const row = (name: string) => screen.getByText(name).closest("li") as HTMLElement;
    const tier = (name: string) => within(row(name)).getByTitle(/^Tier amenaza/);

    expect(tier("Win57")).toHaveTextContent("S");
    expect(tier("Win57").className).toContain("bg-good/30");
    expect(tier("Win54")).toHaveTextContent("A");
    expect(tier("Win54").className).toContain("bg-good/15");
    expect(tier("Win52")).toHaveTextContent("B");
    expect(tier("Win51")).toHaveTextContent("C");
    expect(tier("Win51")).toHaveAttribute("title", "Tier amenaza C");
    expect(tier("Lose42")).toHaveTextContent("S");
    expect(tier("Lose42").className).toContain("bg-bad/30");
    expect(tier("Lose47")).toHaveTextContent("B");
    expect(tier("Lose47").className).toContain("bg-bad/15");

    expect(row("Win57")).toHaveAttribute("title", "500 partidas");
    expect(within(row("Win57")).getByText("57%").className).toContain("text-good");
    expect(within(row("Lose42")).getByText("42%").className).toContain("text-bad");
  });

  it("shows 'Sin datos' for a side with no matchups", async () => {
    vi.mocked(opgg.fetchOpggMatchups).mockResolvedValue([mk("a", "Win55", 55)]);
    render(<MatchupGrid championDdId="Aatrox" role="TOP" />);
    await openGrid();
    expect(names(column("Ganas vs"))).toEqual(["Win55"]);
    expect(within(column("Pierdes vs")).getByText("Sin datos")).toBeInTheDocument();
  });

  it("expands to every matchup and collapses back", async () => {
    const many = [
      ...Array.from({ length: 6 }, (_, i) => mk(`w${i}`, `W${i}`, 60 - i)),
      ...Array.from({ length: 5 }, (_, i) => mk(`l${i}`, `L${i}`, 40 + i)),
    ];
    vi.mocked(opgg.fetchOpggMatchups).mockResolvedValue(many);
    render(<MatchupGrid championDdId="Aatrox" role="TOP" />);
    await openGrid();

    expect(names(column("Ganas vs"))).toHaveLength(4);
    expect(names(column("Pierdes vs"))).toEqual(["L0", "L1", "L2", "L3"]);

    fireEvent.click(screen.getByRole("button", { name: "Ver todos (11) ▼" }));
    expect(names(column("Ganas vs"))).toEqual(["W0", "W1", "W2", "W3", "W4", "W5"]);
    expect(names(column("Pierdes vs"))).toEqual(["L0", "L1", "L2", "L3", "L4"]);

    fireEvent.click(screen.getByRole("button", { name: "Mostrar menos ▲" }));
    expect(names(column("Ganas vs"))).toHaveLength(4);
  });

  it("caps the expanded list at 20 per side", async () => {
    const many = Array.from({ length: 25 }, (_, i) => mk(`w${i}`, `W${i}`, 75 - i));
    vi.mocked(opgg.fetchOpggMatchups).mockResolvedValue(many);
    render(<MatchupGrid championDdId="Aatrox" role="TOP" />);
    await openGrid();
    fireEvent.click(screen.getByRole("button", { name: "Ver todos (25) ▼" }));
    const shown = names(column("Ganas vs"));
    expect(shown).toHaveLength(20);
    expect(shown[19]).toBe("W19");
  });
});

describe("MatchupGrid — lane-opponent callout details", () => {
  it("colors each resolved enemy by WR and shows the sample size", async () => {
    vi.mocked(opgg.fetchOpggMatchups).mockResolvedValue([
      mk("jarvaniv", "Jarvan IV", 47, 600),
      mk("garen", "Garen", 55, 800),
    ]);
    render(
      <MatchupGrid championDdId="LeeSin" role="JUNGLE" enemyDdIds={["JarvanIV", "Garen", "Jinx"]} />
    );
    const callout = (await screen.findByText("Contra tu línea")).parentElement as HTMLElement;
    const items = within(callout).getAllByRole("listitem");
    expect(items).toHaveLength(2); // Jinx has no entry in this role
    expect(items[0]).toHaveTextContent("Jarvan IV47%");
    expect(items[0]).toHaveAttribute("title", "600 partidas");
    expect(within(items[0]).getByText("47%").className).toContain("text-bad");
    expect(within(items[1]).getByText("55%").className).toContain("text-good");
  });
});
