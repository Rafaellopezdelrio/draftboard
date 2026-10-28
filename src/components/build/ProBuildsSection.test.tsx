// ProBuildsSection: loading line → empty state (null payload or no variants)
// → collapsible panel with variant tabs, the active variant's deduped build
// (max 6 items), pros + WR colour, and up to 3 recent pro matches. A stale
// fetch for a previous champion must not overwrite the current one.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ProBuildsSection } from "./ProBuildsSection";
import * as pro from "../../services/proBuilds";
import type { ProBuildsResponse, ProBuildVariant, ProMatchRecent } from "../../services/proBuilds";

vi.mock("../../services/proBuilds", () => ({ fetchProBuilds: vi.fn() }));
// ItemIcon would lazily fetch DDragon items.json — keep it offline.
vi.mock("../../services/itemMeta", () => ({
  getItemMeta: () => null,
  subscribeToItemMeta: () => () => {},
}));

const PATCH = "16.21.1";

const variant = (over: Partial<ProBuildVariant>): ProBuildVariant => ({
  key: "6610-6699",
  corePair: [6610, 6699],
  representativeBuild: [],
  games: 10,
  wins: 6,
  winRate: 0.6,
  proNames: [],
  ...over,
});

const match = (over: Partial<ProMatchRecent>): ProMatchRecent => ({
  proName: "Faker",
  team: null,
  league: null,
  win: true,
  kda: "5/1/7",
  opponentChampionId: 1,
  finalBuild: [],
  summonerSpells: [4, 14],
  timestamp: 0,
  ...over,
});

const RESPONSE: ProBuildsResponse = {
  championId: 266,
  role: "top",
  totalMatches: 42,
  variants: [
    variant({
      key: "a",
      // dup 6610 + 7 unique → 6 shown after dedup + slice
      representativeBuild: [6610, 6610, 6699, 3047, 3071, 3053, 3065, 3075],
      games: 12,
      winRate: 0.5833,
      proNames: ["Zeus", "Kiin"],
    }),
    variant({
      key: "b",
      representativeBuild: [3078, 3074],
      games: 5,
      winRate: 0.4,
      proNames: ["Bin"],
    }),
  ],
  recent: [
    match({ proName: "Zeus", team: "T1", league: "LCK", win: true, kda: "7/2/5" }),
    match({ proName: "Bin", team: null, league: "LPL", win: false, kda: "1/4/2" }),
    match({ proName: "Kiin", team: "GEN", league: null, kda: "3/3/3" }),
    match({ proName: "Hidden", kda: "0/0/0" }),
  ],
};

function itemIdsShown(): string[] {
  return Array.from(document.querySelectorAll("img[src*='/img/item/']")).map(
    (img) => img.getAttribute("src")!.match(/item\/(\d+)\.png$/)![1]
  );
}

async function renderOpen(data: ProBuildsResponse = RESPONSE) {
  vi.mocked(pro.fetchProBuilds).mockResolvedValue(data);
  render(<ProBuildsSection championId={266} role="TOP" patch={PATCH} />);
  const header = await screen.findByRole("button", { name: /Pro builds/ });
  fireEvent.click(header);
  return header;
}

// Fresh in-memory localStorage per test so Panel's remembered open/closed
// state never leaks between tests (Node may not expose a usable one).
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("ProBuildsSection — states", () => {
  it("shows a loading line until the fetch settles", async () => {
    let resolve!: (v: ProBuildsResponse | null) => void;
    vi.mocked(pro.fetchProBuilds).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    render(<ProBuildsSection championId={266} role="TOP" patch={PATCH} />);
    expect(screen.getByText("Cargando pro builds…")).toBeInTheDocument();
    expect(pro.fetchProBuilds).toHaveBeenCalledWith(266, "TOP");

    await act(async () => resolve(null));
    expect(screen.queryByText("Cargando pro builds…")).toBeNull();
  });

  it("shows the empty state with the role when the proxy returns nothing", async () => {
    vi.mocked(pro.fetchProBuilds).mockResolvedValue(null);
    render(<ProBuildsSection championId={83} role="JUNGLE" patch={PATCH} />);
    expect(
      await screen.findByText("Sin partidas pro recientes para este campeón en JUNGLE.")
    ).toBeInTheDocument();
    expect(screen.getByText("Pro builds")).toBeInTheDocument();
  });

  it("treats a payload with zero variants as empty", async () => {
    vi.mocked(pro.fetchProBuilds).mockResolvedValue({ ...RESPONSE, variants: [] });
    render(<ProBuildsSection championId={266} role="TOP" patch={PATCH} />);
    expect(
      await screen.findByText("Sin partidas pro recientes para este campeón en TOP.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("ProBuildsSection — data", () => {
  it("starts collapsed with the total match count as summary", async () => {
    vi.mocked(pro.fetchProBuilds).mockResolvedValue(RESPONSE);
    render(<ProBuildsSection championId={266} role="TOP" patch={PATCH} />);
    const header = await screen.findByRole("button", { name: /Pro builds/ });
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(header).toHaveTextContent("42 partidas");
    expect(screen.queryByText(/#1 ·/)).toBeNull();
  });

  it("renders the first variant: deduped 6-item build, pros and green WR", async () => {
    await renderOpen();
    expect(screen.getByRole("button", { name: "#1 · 12 pros" }).className).toContain(
      "text-accent"
    );
    expect(screen.getByRole("button", { name: "#2 · 5 pros" }).className).not.toContain(
      "text-accent"
    );
    expect(screen.getByRole("button", { name: "#1 · 12 pros" })).toHaveAttribute(
      "title",
      "12 partidas · 58% WR"
    );

    expect(itemIdsShown()).toEqual(["6610", "6699", "3047", "3071", "3053", "3065"]);
    expect(screen.getByText("Pros:")).toHaveTextContent("Pros: Zeus, Kiin");
    const wr = screen.getByText("58% WR · 12g");
    expect(wr.className).toContain("text-good");
  });

  it("switches the active variant when another tab is clicked", async () => {
    await renderOpen();
    fireEvent.click(screen.getByRole("button", { name: "#2 · 5 pros" }));

    expect(screen.getByRole("button", { name: "#2 · 5 pros" }).className).toContain(
      "text-accent"
    );
    expect(itemIdsShown()).toEqual(["3078", "3074"]);
    expect(screen.getByText("Pros:")).toHaveTextContent("Pros: Bin");
    expect(screen.getByText("40% WR · 5g").className).toContain("text-bad/80");
  });

  it("lists at most 3 recent pro matches with team / league / KDA", async () => {
    await renderOpen();
    expect(screen.getByText("Últimas partidas pro")).toBeInTheDocument();

    const zeus = screen.getByText("7/2/5");
    expect(zeus.className).toContain("text-good");
    expect(zeus.parentElement).toHaveTextContent("Zeus · T1 · LCK7/2/5");

    const bin = screen.getByText("1/4/2");
    expect(bin.className).toContain("text-bad/80");
    expect(bin.parentElement).toHaveTextContent("Bin · LPL1/4/2");

    expect(screen.getByText("3/3/3").parentElement).toHaveTextContent("Kiin · GEN3/3/3");
    expect(screen.queryByText("Hidden")).toBeNull();
  });

  it("omits the recent block when there are no recent matches", async () => {
    await renderOpen({ ...RESPONSE, recent: [] });
    expect(screen.queryByText("Últimas partidas pro")).toBeNull();
    expect(screen.getByText("Zeus, Kiin")).toBeInTheDocument();
  });

  it("ignores a stale response after the champion changes", async () => {
    let resolveOld!: (v: ProBuildsResponse | null) => void;
    vi.mocked(pro.fetchProBuilds)
      .mockReturnValueOnce(
        new Promise((r) => {
          resolveOld = r;
        })
      )
      .mockResolvedValueOnce({
        ...RESPONSE,
        totalMatches: 7,
        variants: [variant({ key: "new", representativeBuild: [3089], games: 7, proNames: ["Chovy"] })],
        recent: [],
      });

    const { rerender } = render(<ProBuildsSection championId={266} role="TOP" patch={PATCH} />);
    rerender(<ProBuildsSection championId={4} role="MIDDLE" patch={PATCH} />);
    expect(pro.fetchProBuilds).toHaveBeenLastCalledWith(4, "MIDDLE");

    const header = await screen.findByRole("button", { name: /Pro builds/ });
    expect(header).toHaveTextContent("7 partidas");

    // Old fetch resolves late — must not clobber the new champion's data.
    await act(async () => resolveOld(RESPONSE));
    fireEvent.click(header);
    expect(screen.getByText("Chovy")).toBeInTheDocument();
    expect(screen.queryByText("Zeus, Kiin")).toBeNull();
    expect(itemIdsShown()).toEqual(["3089"]);
  });

  it("goes back to the first variant tab when the champion changes", async () => {
    vi.mocked(pro.fetchProBuilds).mockResolvedValue(RESPONSE);
    const { rerender } = render(<ProBuildsSection championId={266} role="TOP" patch={PATCH} />);
    fireEvent.click(await screen.findByRole("button", { name: /Pro builds/ }));
    fireEvent.click(screen.getByRole("button", { name: "#2 · 5 pros" }));
    expect(screen.getByText("Pros:")).toHaveTextContent("Pros: Bin");

    vi.mocked(pro.fetchProBuilds).mockResolvedValue({
      ...RESPONSE,
      variants: [
        variant({ key: "c", representativeBuild: [3089], games: 9, proNames: ["Chovy"] }),
        variant({ key: "d", representativeBuild: [3135], games: 3, proNames: ["Faker"] }),
      ],
    });
    rerender(<ProBuildsSection championId={4} role="MIDDLE" patch={PATCH} />);

    // Panel stays open (remembered), and the new champion starts on tab #1.
    expect(await screen.findByRole("button", { name: "#1 · 9 pros" })).toHaveClass("text-accent");
    expect(screen.getByRole("button", { name: "#2 · 3 pros" })).not.toHaveClass("text-accent");
    expect(screen.getByText("Pros:")).toHaveTextContent("Pros: Chovy");
    expect(itemIdsShown()).toEqual(["3089"]);
  });
});
