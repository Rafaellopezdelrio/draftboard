// CompAnalysis contract (real suggestion/winConditions engines):
//   - Lists engage/frontline/peel/burst: present (good), missing per the
//     engine's goal set (bad), or neutral (burst is not an engine goal).
//   - Collapsed header shows the "<present>/4" score; open state persists
//     under panel-open:comp.
//   - Damage section: AD/AP split per team (+ true-damage count); a team with
//     no damage-tagged champions, or no picks, renders no bar.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompAnalysis } from "./CompAnalysis";
import type { ChampionDb } from "../types/champion";

function champ(key: string, name: string, tags: string[], archetypes: string[] = []) {
  return { key, id: name, name, title: "", iconUrl: "", splashUrl: "", tags, roles: [], archetypes };
}

const db = {
  patch: "16.1.1",
  champions: {
    "1": champ("1", "Leona", ["Tank", "Support"], ["engage", "frontline"]),
    "2": champ("2", "Darius", ["Fighter"], ["frontline"]),
    "3": champ("3", "Lux", ["Mage"], ["burst", "peel"]),
    "4": champ("4", "Vayne", ["Marksman"]),
    "5": champ("5", "Fiora", ["Fighter"]),
    "6": champ("6", "Akali", ["Assassin"]),
    "7": champ("7", "Zed", ["Assassin"]),
    "8": champ("8", "Malphite", ["Tank"], ["engage"]),
  },
  counters: [],
  meta: [],
  fetchedAt: 0,
} as unknown as ChampionDb;

let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function item(label: string): HTMLElement {
  return screen.getByText(label).closest("li") as HTMLElement;
}

describe("CompAnalysis — archetype checklist", () => {
  it("marks present, missing and neutral archetypes", () => {
    // Darius = frontline. Unknown key "999" is ignored.
    render(<CompAnalysis db={db} allyKeys={["2", "999"]} />);
    expect(screen.getByText("Composición")).toBeInTheDocument();
    expect(item("Frontline").className).toContain("text-good");
    expect(item("Engage").className).toContain("text-bad");
    expect(item("Peel").className).toContain("text-bad");
    // Burst isn't an engine goal -> neutral, never "missing".
    expect(item("Burst").className).toContain("text-white/60");
    expect(item("Frontline").querySelector(".lucide-check")).not.toBeNull();
    expect(item("Engage").querySelector(".lucide-x")).not.toBeNull();
    expect(item("Burst").querySelector(".lucide-minus")).not.toBeNull();
  });

  it("all four green for a complete comp", () => {
    render(<CompAnalysis db={db} allyKeys={["1", "3"]} />);
    for (const l of ["Engage", "Frontline", "Peel", "Burst"]) {
      expect(item(l).className).toContain("text-good");
    }
  });

  it("shows the score in the header when collapsed and remembers the choice", () => {
    render(<CompAnalysis db={db} allyKeys={["1"]} />);
    const header = screen.getByRole("button", { name: /Composición/ });
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("2/4")).toBeNull();

    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("2/4")).toBeInTheDocument();
    expect(screen.queryByText("Engage")).toBeNull();
    expect(store.get("panel-open:comp")).toBe("0");
  });

  it("starts collapsed when the stored state says so", () => {
    store.set("panel-open:comp", "0");
    render(<CompAnalysis db={db} allyKeys={[]} />);
    expect(screen.getByText("0/4")).toBeInTheDocument();
  });
});

describe("CompAnalysis — damage profile", () => {
  it("renders no damage section without picks", () => {
    render(<CompAnalysis db={db} allyKeys={[]} />);
    expect(screen.queryByText("Tu equipo")).toBeNull();
    expect(screen.queryByText("Enemigos")).toBeNull();
  });

  it("splits the ally team's damage into AD/AP percentages", () => {
    // Darius (AD) + Lux (AP) + Leona (Support -> AP) = 33% AD / 67% AP.
    render(<CompAnalysis db={db} allyKeys={["2", "3", "1"]} />);
    expect(screen.getByText("Tu equipo")).toBeInTheDocument();
    expect(screen.getByText("AD 33%")).toBeInTheDocument();
    expect(screen.getByText("AP 67%")).toBeInTheDocument();
    expect(screen.getByTitle("AD 33% · AP 67%")).toBeInTheDocument();
    expect(screen.queryByText("Enemigos")).toBeNull();
    expect(screen.queryByText(/daño verdadero/)).toBeNull();
  });

  it("counts true-damage champions and splits assassins by name", () => {
    // Enemy: Vayne (AD, true), Fiora (AD, true), Akali (AP assassin), Zed (AD assassin).
    render(<CompAnalysis db={db} allyKeys={[]} enemyKeys={["4", "5", "6", "7"]} />);
    expect(screen.getByText("Enemigos")).toBeInTheDocument();
    expect(screen.queryByText("Tu equipo")).toBeNull();
    expect(screen.getByText("AD 75%")).toBeInTheDocument();
    expect(screen.getByText("AP 25%")).toBeInTheDocument();
    const trueBadge = screen.getByText("⚔ 2 con daño verdadero");
    expect(trueBadge).toHaveAttribute(
      "title",
      "Campeones con daño verdadero significativo — resistencias no lo mitigan"
    );
  });

  it("skips a team whose champions carry no damage tags", () => {
    // Malphite is Tank-only -> 0 AD + 0 AP -> no bar for allies.
    render(<CompAnalysis db={db} allyKeys={["8"]} enemyKeys={["3"]} />);
    expect(screen.queryByText("Tu equipo")).toBeNull();
    expect(screen.getByText("Enemigos")).toBeInTheDocument();
    expect(screen.getByText("AD 0%")).toBeInTheDocument();
    expect(screen.getByText("AP 100%")).toBeInTheDocument();
  });
});
