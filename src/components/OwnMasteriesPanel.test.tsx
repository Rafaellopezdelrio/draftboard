// OwnMasteriesPanel contract:
//   - Renders nothing without masteries.
//   - Collapsible panel (closed by default, state persisted under
//     "panel-open:masteries") whose summary is the mastery count.
//   - Body takes the first 5 masteries, drops unknown champions: icon, Mx badge,
//     points in k, and personal WR only when >= 3 games (colour by band).
//   - Top-1 champion at mastery >= 7 gets the accent ring.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { OwnMasteriesPanel } from "./OwnMasteriesPanel";
import type { ChampionDb } from "../types/champion";
import type { ChampionMasteryDto } from "../services/riotApi";
import type { ChampionPersonalStat } from "../services/matchRepo";

const champ = (key: string, name: string) => ({ key, id: name, name, iconUrl: `${name}.png`, roles: [], tags: [] });

const db = {
  patch: "16.10.1",
  champions: {
    "1": champ("1", "Annie"),
    "2": champ("2", "Olaf"),
    "3": champ("3", "Galio"),
    "4": champ("4", "TwistedFate"),
    "5": champ("5", "XinZhao"),
    "6": champ("6", "Urgot"),
  },
  counters: [],
  meta: [],
  fetchedAt: 0,
} as unknown as ChampionDb;

const m = (championId: number, championLevel: number, championPoints: number): ChampionMasteryDto => ({
  championId,
  championLevel,
  championPoints,
  lastPlayTime: 0,
});

const ps = (championId: number, games: number, winRate: number): ChampionPersonalStat => ({
  championId,
  games,
  wins: Math.round(games * winRate),
  winRate,
});

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function open() {
  fireEvent.click(screen.getByRole("button", { name: /Tus mejores campeones/ }));
  return screen.getByRole("region");
}

function rowOf(name: string): HTMLElement {
  return screen.getByText(name, { selector: "p" }).closest(".rounded") as HTMLElement;
}

describe("OwnMasteriesPanel", () => {
  it("renders nothing when there are no masteries", () => {
    const { container } = render(<OwnMasteriesPanel db={db} masteries={[]} personalStats={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("starts collapsed with the count summary and persists the toggle", () => {
    render(<OwnMasteriesPanel db={db} masteries={[m(1, 5, 1000), m(2, 4, 2000)]} personalStats={[]} />);
    const toggle = screen.getByRole("button", { name: /Tus mejores campeones/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(toggle).getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("Annie")).not.toBeInTheDocument();

    open();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(store.get("panel-open:masteries")).toBe("1");
  });

  it("opens by default when the stored state says so", () => {
    store.set("panel-open:masteries", "1");
    render(<OwnMasteriesPanel db={db} masteries={[m(1, 5, 1000)]} personalStats={[]} />);
    expect(screen.getByRole("region")).toHaveTextContent("Annie");
  });

  it("lists only the first 5 masteries, skipping unknown champions", () => {
    // 250_600 -> "251k" pins rounding (floor would give 250k).
    const masteries = [m(1, 7, 250_600), m(999, 9, 1), m(2, 6, 1499), m(3, 5, 3000), m(4, 4, 0), m(5, 3, 10_000), m(6, 2, 1)];
    render(<OwnMasteriesPanel db={db} masteries={masteries} personalStats={[]} />);
    const region = open();

    // slice(0,5) happens before filtering unknown ids -> 4 visible rows.
    expect(within(region).getAllByRole("img").map((i) => i.getAttribute("alt"))).toEqual([
      "Annie",
      "Olaf",
      "Galio",
      "TwistedFate",
    ]);
    expect(within(region).queryByText("XinZhao")).not.toBeInTheDocument();
    expect(within(region).getByText("251k pts")).toBeInTheDocument();
    expect(within(region).getByText("1k pts")).toBeInTheDocument();
    expect(within(region).getByText("0k pts")).toBeInTheDocument();
    expect(within(region).getByText("M7")).toBeInTheDocument();
    expect(within(region).getByText("M6")).toBeInTheDocument();
  });

  it("styles badges by mastery level and rings the top-1 main at M7+", () => {
    render(<OwnMasteriesPanel db={db} masteries={[m(1, 10, 1000), m(2, 7, 1000), m(3, 6, 1000)]} personalStats={[]} />);
    open();
    expect(screen.getByText("M10").className).toContain("bg-accent text-black");
    expect(screen.getByText("M7").className).toContain("text-accent ring-1 ring-accent/60");
    expect(screen.getByText("M6").className).toContain("text-white/60");

    expect(screen.getByRole("img", { name: "Annie" }).className).toContain("ring-2 ring-accent/60");
    // Olaf is M7 but not the top entry -> regular ring.
    expect(screen.getByRole("img", { name: "Olaf" }).className).toContain("ring-1 ring-border-subtle");
  });

  it("does not ring the top entry below M7", () => {
    render(<OwnMasteriesPanel db={db} masteries={[m(1, 6, 1000)]} personalStats={[]} />);
    open();
    expect(screen.getByRole("img", { name: "Annie" }).className).not.toContain("ring-2");
  });

  it("shows personal WR only with >= 3 games, coloured by band", () => {
    render(
      <OwnMasteriesPanel
        db={db}
        masteries={[m(1, 5, 1000), m(2, 5, 1000), m(3, 5, 1000), m(4, 5, 1000)]}
        // Olaf at exactly 3 games pins the ">= 3" threshold; TF at 2 is hidden.
        personalStats={[ps(1, 10, 0.6), ps(2, 3, 0.5), ps(3, 5, 0.4), ps(4, 2, 1)]}
      />
    );
    open();
    expect(within(rowOf("Annie")).getByText("60%").className).toContain("text-good");
    expect(within(rowOf("Olaf")).getByText("50%").className).toContain("text-meh");
    expect(within(rowOf("Galio")).getByText("40%").className).toContain("text-bad");
    expect(within(rowOf("TwistedFate")).queryByText(/%$/)).not.toBeInTheDocument();
  });
});
