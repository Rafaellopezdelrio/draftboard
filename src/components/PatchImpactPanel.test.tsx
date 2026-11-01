// PatchImpactPanel contract:
//   - Renders nothing while loading, when there are no patch notes, or when
//     none of the user's top-15 mastery champions changed.
//   - Matches patch-note champion ids against the DB by id, name or
//     punctuation-insensitive id; unknown ids are skipped.
//   - Collapsed by default (header shows the year-based patch); opened, it
//     lists one card per affected main with type, "tu main" badge for the
//     #1 mastery and at most 2 detail bullets.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PatchImpactPanel } from "./PatchImpactPanel";
import type { ChampionDb } from "../types/champion";
import type { ChampionMasteryDto } from "../services/riotApi";
import type { PatchSummary } from "../services/patchNotes";

vi.mock("../services/patchNotes", () => ({ getLatestPatchSummary: vi.fn() }));
import { getLatestPatchSummary } from "../services/patchNotes";
const getSummary = vi.mocked(getLatestPatchSummary);

const db = {
  patch: "16.10.1",
  champions: {
    "64": { key: "64", id: "LeeSin", name: "Lee Sin", iconUrl: "lee.png" },
    "145": { key: "145", id: "Kaisa", name: "Kai'Sa", iconUrl: "kaisa.png" },
    "266": { key: "266", id: "Aatrox", name: "Aatrox", iconUrl: "aatrox.png" },
    "103": { key: "103", id: "Ahri", name: "Ahri", iconUrl: "ahri.png" },
    "62": { key: "62", id: "MonkeyKing", name: "Wukong", iconUrl: "wukong.png" },
  },
  counters: [],
  meta: [],
  fetchedAt: 0,
} as unknown as ChampionDb;

const m = (championId: number): ChampionMasteryDto => ({
  championId,
  championLevel: 7,
  championPoints: 100_000,
  lastPlayTime: 0,
});

function summary(changes: PatchSummary["changes"]): PatchSummary {
  return { patch: "16.10", changes, fetchedAt: 0 };
}

async function renderPanel(masteries: ChampionMasteryDto[]) {
  const utils = render(<PatchImpactPanel db={db} masteries={masteries} />);
  await act(async () => {});
  return utils;
}

beforeEach(() => {
  getSummary.mockReset();
  const store = new Map<string, string>();
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

describe("PatchImpactPanel", () => {
  it("renders nothing when there are no patch notes", async () => {
    getSummary.mockResolvedValue(null);
    const { container } = await renderPanel([m(64)]);
    expect(getSummary).toHaveBeenCalledWith("16.10.1");
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the notes have no changes", async () => {
    getSummary.mockResolvedValue(summary([]));
    const { container } = await renderPanel([m(64)]);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when no main was touched (or the id is unknown)", async () => {
    getSummary.mockResolvedValue(
      summary([
        { championId: "Ahri", type: "buff", details: [] },
        { championId: "Smolder", type: "nerf", details: [] },
      ])
    );
    const { container } = await renderPanel([m(64)]);
    expect(container).toBeEmptyDOMElement();
  });

  it("is collapsed by default, showing title and year-based patch", async () => {
    getSummary.mockResolvedValue(summary([{ championId: "LeeSin", type: "nerf", details: ["Q menos daño"] }]));
    await renderPanel([m(64)]);
    const header = screen.getByRole("button", { name: /Impacto de parche/ });
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("26.10")).toBeInTheDocument();
    expect(screen.queryByText("Lee Sin")).not.toBeInTheDocument();
  });

  it("lists affected mains with type, main badge and up to 2 details", async () => {
    getSummary.mockResolvedValue(
      summary([
        { championId: "leesin", type: "nerf", details: ["Q menos daño", "W más CD", "R más maná"] },
        // Neither id nor name match case-insensitively; only the
        // punctuation-insensitive id comparison ("kaisa") does.
        { championId: "Kai Sa", type: "buff", details: [] },
        { championId: "aatrox", type: "rework", details: ["Pasiva nueva"] },
      ])
    );
    await renderPanel([m(64), m(145), m(266)]);
    fireEvent.click(screen.getByRole("button", { name: /Impacto de parche/ }));

    const names = screen.getAllByRole("img").map((i) => i.getAttribute("alt"));
    expect(names).toEqual(["Lee Sin", "Kai'Sa", "Aatrox"]);
    expect(screen.getByAltText("Lee Sin")).toHaveAttribute("src", "lee.png");

    expect(screen.getByText("nerf")).toBeInTheDocument();
    expect(screen.getByText("buff")).toBeInTheDocument();
    expect(screen.getByText("rework")).toBeInTheDocument();

    // Only the #1 mastery champion gets the badge.
    expect(screen.getAllByText("tu main")).toHaveLength(1);
    expect(screen.getByText("tu main").previousElementSibling).toHaveTextContent("Lee Sin");

    expect(screen.getByText("• Q menos daño")).toBeInTheDocument();
    expect(screen.getByText("• W más CD")).toBeInTheDocument();
    expect(screen.queryByText("• R más maná")).not.toBeInTheDocument();
    expect(screen.getByText("• Pasiva nueva")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("matches by display name and renders the adjust type", async () => {
    // "Wukong" is only reachable via the name (id is MonkeyKing).
    getSummary.mockResolvedValue(summary([{ championId: "Wukong", type: "adjust", details: [] }]));
    await renderPanel([m(103), m(62)]);
    fireEvent.click(screen.getByRole("button", { name: /Impacto de parche/ }));
    expect(screen.getByText("Wukong")).toBeInTheDocument();
    expect(screen.getByText("adjust")).toBeInTheDocument();
    expect(screen.queryByText("tu main")).not.toBeInTheDocument();
  });

  it("only considers the top 15 mastery champions", async () => {
    getSummary.mockResolvedValue(summary([{ championId: "LeeSin", type: "buff", details: [] }]));
    const filler = Array.from({ length: 15 }, (_, i) => m(1000 + i));
    const { container } = await renderPanel([...filler, m(64)]);
    expect(container).toBeEmptyDOMElement();
  });
});
