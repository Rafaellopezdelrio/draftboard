// PatchNewBanner contract:
//   - Shown only when the live MINOR patch differs from prefs.lastSeenPatch
//     (hotfix builds within the same X.Y never re-show it).
//   - Summarises buffs / nerfs / reworks for the top-5 mastery mains
//     (adjust changes and non-mains are ignored), or explains that mains
//     didn't change / notes aren't indexed yet.
//   - "Ver cambios" only when notes exist and a handler is given; dismiss
//     stores the live patch into lastSeenPatch.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PatchNewBanner } from "./PatchNewBanner";
import { usePrefsStore, DEFAULT_PREFS } from "../state/prefsStore";
import type { ChampionDb } from "../types/champion";
import type { ChampionMasteryDto } from "../services/riotApi";
import type { PatchSummary } from "../services/patchNotes";

vi.mock("../services/patchNotes", () => ({ getLatestPatchSummary: vi.fn() }));
import { getLatestPatchSummary } from "../services/patchNotes";
const getSummary = vi.mocked(getLatestPatchSummary);

const db = {
  patch: "16.11.1",
  champions: {
    "64": { key: "64", id: "LeeSin", name: "Lee Sin" },
    "145": { key: "145", id: "Kaisa", name: "Kai'Sa" },
    "266": { key: "266", id: "Aatrox", name: "Aatrox" },
    "103": { key: "103", id: "Ahri", name: "Ahri" },
  },
  counters: [],
  meta: [],
  fetchedAt: 0,
} as unknown as ChampionDb;

const m = (championId: number): ChampionMasteryDto => ({
  championId,
  championLevel: 7,
  championPoints: 1,
  lastPlayTime: 0,
});
const MAINS = [m(64), m(145), m(266), m(103)];

function summary(changes: PatchSummary["changes"]): PatchSummary {
  return { patch: "16.11", changes, fetchedAt: 0 };
}

const setPref = vi.fn();

function setLastSeen(lastSeenPatch: string) {
  usePrefsStore.setState({
    prefs: { ...DEFAULT_PREFS, lastSeenPatch },
    set: setPref as never,
  });
}

async function renderBanner(props: Partial<Parameters<typeof PatchNewBanner>[0]> = {}) {
  const utils = render(<PatchNewBanner db={db} masteries={MAINS} {...props} />);
  await act(async () => {});
  return utils;
}

beforeEach(() => {
  setPref.mockReset().mockResolvedValue(undefined);
  getSummary.mockReset().mockResolvedValue(null);
  setLastSeen("16.10.1");
});

describe("PatchNewBanner", () => {
  it("stays hidden within the same minor patch and does not fetch notes", async () => {
    setLastSeen("16.11.0");
    const { container } = await renderBanner();
    expect(container).toBeEmptyDOMElement();
    expect(getSummary).not.toHaveBeenCalled();
  });

  it("announces the new patch (year-based) with the previous one, notes not indexed", async () => {
    await renderBanner({ onOpenDetail: vi.fn() });
    expect(getSummary).toHaveBeenCalledWith("16.11.1");
    expect(screen.getByText("Parche nuevo:", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("26.11")).toBeInTheDocument();
    expect(screen.getByText("(anterior 26.10)", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/aún no se han indexado/)).toBeInTheDocument();
    // No notes → no "Ver cambios" even with a handler.
    expect(screen.queryByRole("button", { name: /Ver cambios/ })).not.toBeInTheDocument();
  });

  it("treats empty change lists as not indexed", async () => {
    getSummary.mockResolvedValue(summary([]));
    await renderBanner({ onOpenDetail: vi.fn() });
    expect(screen.getByText(/aún no se han indexado/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ver cambios/ })).not.toBeInTheDocument();
  });

  it("omits the previous-patch hint on first run (empty lastSeenPatch)", async () => {
    setLastSeen("");
    await renderBanner();
    expect(screen.getByText("26.11")).toBeInTheDocument();
    expect(screen.queryByText(/anterior/)).not.toBeInTheDocument();
  });

  it("says mains didn't change when notes exist but none hit a top-5 main", async () => {
    getSummary.mockResolvedValue(
      summary([
        { championId: "Smolder", type: "buff", details: [] }, // not in DB
        { championId: "LeeSin", type: "adjust", details: [] }, // adjust ignored
      ])
    );
    const onOpenDetail = vi.fn();
    await renderBanner({ onOpenDetail });
    expect(screen.getByText("Tus mains no han cambiado este parche.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ver cambios/ }));
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });

  it("hides 'Ver cambios' without a handler", async () => {
    getSummary.mockResolvedValue(summary([{ championId: "LeeSin", type: "buff", details: [] }]));
    await renderBanner();
    // Buffs alone: no trailing separator.
    expect(screen.getByText(/Buffs:/).parentElement?.textContent).toBe("Buffs: Lee Sin");
    expect(screen.queryByRole("button", { name: /Ver cambios/ })).not.toBeInTheDocument();
  });

  it("separates buffs from reworks when there are no nerfs", async () => {
    getSummary.mockResolvedValue(
      summary([
        { championId: "LeeSin", type: "buff", details: [] },
        { championId: "Aatrox", type: "rework", details: [] },
      ])
    );
    await renderBanner();
    expect(screen.getByText(/Buffs:/).parentElement?.textContent).toBe(
      "Buffs: Lee Sin · Rework: Aatrox"
    );
  });

  it("lists buffs, nerfs and reworks for mains separated by dots", async () => {
    getSummary.mockResolvedValue(
      summary([
        { championId: "lee sin", type: "buff", details: [] },
        { championId: "Ahri", type: "buff", details: [] },
        { championId: "Kai'Sa", type: "nerf", details: [] },
        { championId: "aatrox", type: "rework", details: [] },
      ])
    );
    await renderBanner();
    const buffs = screen.getByText(/Buffs:/);
    expect(buffs).toHaveTextContent("Buffs: Lee Sin, Ahri");
    expect(buffs.parentElement).toHaveTextContent(
      "Buffs: Lee Sin, Ahri · Nerfs: Kai'Sa · Rework: Aatrox"
    );
  });

  it("joins nerfs and reworks without a leading separator when there are no buffs", async () => {
    getSummary.mockResolvedValue(
      summary([
        { championId: "Kaisa", type: "nerf", details: [] },
        { championId: "Aatrox", type: "rework", details: [] },
      ])
    );
    await renderBanner();
    expect(screen.getByText(/Nerfs:/).parentElement?.textContent).toBe(
      "Nerfs: Kai'Sa · Rework: Aatrox"
    );
  });

  it("shows only reworks with no separators", async () => {
    getSummary.mockResolvedValue(summary([{ championId: "Aatrox", type: "rework", details: [] }]));
    await renderBanner();
    expect(screen.getByText(/Rework:/).parentElement?.textContent).toBe("Rework: Aatrox");
  });

  it("only counts the top 5 mastery champions", async () => {
    getSummary.mockResolvedValue(summary([{ championId: "LeeSin", type: "nerf", details: [] }]));
    const filler = Array.from({ length: 5 }, (_, i) => m(1000 + i));
    await renderBanner({ masteries: [...filler, m(64)] });
    expect(screen.getByText("Tus mains no han cambiado este parche.")).toBeInTheDocument();
  });

  it("dismiss stores the live patch as last seen", async () => {
    await renderBanner();
    fireEvent.click(screen.getByRole("button", { name: "No mostrar más" }));
    expect(setPref).toHaveBeenCalledWith("lastSeenPatch", "16.11.1");
  });

  it("ignores a stale notes response after the live patch changes", async () => {
    const pending: Array<(v: PatchSummary | null) => void> = [];
    getSummary.mockImplementation(() => new Promise((r) => pending.push(r)));
    const { rerender } = render(<PatchNewBanner db={db} masteries={MAINS} />);
    const nextDb = { ...db, patch: "16.12.1" } as ChampionDb;
    rerender(<PatchNewBanner db={nextDb} masteries={MAINS} />);
    expect(getSummary).toHaveBeenLastCalledWith("16.12.1");
    expect(pending).toHaveLength(2);

    await act(async () => {
      pending[1](null);
    });
    await act(async () => {
      pending[0](summary([{ championId: "LeeSin", type: "buff", details: [] }]));
    });
    expect(screen.getByText("26.12")).toBeInTheDocument();
    expect(screen.getByText(/aún no se han indexado/)).toBeInTheDocument();
    expect(screen.queryByText(/Buffs:/)).not.toBeInTheDocument();
  });

  it("disappears once lastSeenPatch catches up", async () => {
    let resolve!: (v: PatchSummary | null) => void;
    getSummary.mockImplementation(() => new Promise((r) => (resolve = r)));
    const { container } = render(<PatchNewBanner db={db} masteries={MAINS} />);
    expect(screen.getByText("26.11")).toBeInTheDocument();

    act(() => setLastSeen("16.11.1"));
    expect(container).toBeEmptyDOMElement();

    await act(async () => {
      resolve(summary([{ championId: "LeeSin", type: "buff", details: [] }]));
    });
    expect(container).toBeEmptyDOMElement();
  });
});
