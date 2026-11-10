// ProPlayersView contract:
//   - Without a Riot API key: shows the "needs API key" notice, hides the
//     player list and disables "Cargar todos".
//   - Region tabs filter the curated PRO_PLAYERS list (footer count follows).
//   - "Cargar" on a player resolves account -> 3 match ids -> each match, and
//     renders one chip per match (KDA, win/loss tint, champion icon).
//   - Errors are shown truncated to 80 chars; while loading a skeleton row
//     and "cargando..." are visible.
//   - "Cargar todos" loads the visible players sequentially.
//   - Escape / backdrop click close; clicks inside the dialog don't.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { ProPlayersView } from "./ProPlayersView";
import type { ChampionDb } from "../types/champion";
import type { MatchFull } from "../services/riotApi";
import { PRO_PLAYERS } from "../data/proPlayers";
import i18n from "i18next";

// Labels come from i18n; resolve them the same way the component does so the
// tests don't depend on the wording.
const L = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts) as string;

vi.mock("../services/settingsRepo", () => ({ loadSettings: vi.fn() }));
vi.mock("../services/riotApi", () => ({
  getAccountByRiotId: vi.fn(),
  getRecentMatchIds: vi.fn(),
  getMatchFull: vi.fn(),
  getRiotProxyUrl: vi.fn(),
}));

import { loadSettings } from "../services/settingsRepo";
import { getAccountByRiotId, getRecentMatchIds, getMatchFull, getRiotProxyUrl } from "../services/riotApi";

const db = {
  patch: "16.10.1",
  champions: {
    "266": { key: "266", id: "Aatrox", name: "Aatrox", iconUrl: "aatrox.png", roles: [], tags: [] },
    "64": { key: "64", id: "LeeSin", name: "Lee Sin", iconUrl: "lee.png", roles: [], tags: [] },
  },
  counters: [],
  meta: [],
  fetchedAt: 0,
} as unknown as ChampionDb;

const CFG = { apiKey: "RGAPI-test", region: "euw1", riotIdName: "Me", riotIdTag: "EUW" };

const countBy = (r: string) => PRO_PLAYERS.filter((p) => p.region === r).length;

function match(id: string, me: Record<string, unknown> | null, over: Partial<MatchFull> = {}): MatchFull {
  const participants = [
    { puuid: "other", championId: 1, win: false, kills: 0, deaths: 0, assists: 0 },
  ];
  if (me) participants.push({ puuid: "pro-puuid", ...me } as never);
  return { matchId: id, durationSec: 1800, endTsMs: 0, queueId: 420, participants, teams: [], ...over } as unknown as MatchFull;
}

async function renderView(cfg: unknown = CFG, onClose = vi.fn()) {
  vi.mocked(loadSettings).mockResolvedValue(cfg as never);
  const utils = render(<ProPlayersView db={db} onClose={onClose} />);
  await act(async () => {});
  return { ...utils, onClose };
}

function panelOf(name: string): HTMLElement {
  // Player name <p> -> nearest Panel container (rounded-lg wrapper).
  const el = screen.getByText(name, { selector: "p" });
  return el.closest(".rounded-lg") as HTMLElement;
}

beforeEach(() => {
  vi.mocked(loadSettings).mockReset();
  vi.mocked(getAccountByRiotId).mockReset();
  vi.mocked(getRecentMatchIds).mockReset();
  vi.mocked(getMatchFull).mockReset();
  vi.mocked(getRiotProxyUrl).mockReset().mockReturnValue(null);
});

describe("ProPlayersView — no API key", () => {
  it("shows the API key notice, no players, and disables 'Cargar todos'", async () => {
    await renderView(null);
    expect(screen.getByText(L("proPlayers.needAccess"))).toBeInTheDocument();
    expect(screen.queryByText("Faker")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: L("proPlayers.loadAll") })).toBeDisabled();
    expect(screen.getByText(L("proPlayers.footer", { count: PRO_PLAYERS.length }))).toBeInTheDocument();
  });

  it("treats settings without apiKey as unconfigured", async () => {
    await renderView({ ...CFG, apiKey: "" });
    expect(screen.getByText(L("proPlayers.needAccess"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: L("proPlayers.load") })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: L("proPlayers.loadAll") })).toBeDisabled();
  });
});

describe("ProPlayersView — proxy-only access", () => {
  // The proxy injects the Riot key, so neither a local key nor saved settings
  // are needed (regression: the view was blocked for default users).
  it.each([
    ["no saved settings", null],
    ["settings without apiKey", { ...CFG, apiKey: "" }],
  ])("lists and loads players through the proxy with %s", async (_name, cfg) => {
    vi.mocked(getRiotProxyUrl).mockReturnValue("https://proxy.test");
    vi.mocked(getAccountByRiotId).mockResolvedValue({ puuid: "pro-puuid", gameName: "x", tagLine: "y" });
    vi.mocked(getRecentMatchIds).mockResolvedValue(["KR_1"]);
    vi.mocked(getMatchFull).mockResolvedValue(
      match("KR_1", { championId: 266, win: true, kills: 4, deaths: 1, assists: 9 })
    );
    await renderView(cfg);
    expect(screen.queryByText(L("proPlayers.needAccess"))).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: L("proPlayers.loadAll") })).toBeEnabled();

    const faker = panelOf("Faker");
    await act(async () => {
      fireEvent.click(within(faker).getByRole("button", { name: L("proPlayers.load") }));
    });
    expect(vi.mocked(getAccountByRiotId).mock.calls[0][0]).toEqual(
      expect.objectContaining({ apiKey: "", region: "kr" })
    );
    expect(within(faker).getByText("4/1/9")).toBeInTheDocument();
  });
});

describe("ProPlayersView — list & tabs", () => {
  it("lists every pro with team, role, riot id and region; twitch link only when set", async () => {
    await renderView();
    expect(screen.queryByText(L("proPlayers.needAccess"))).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: L("proPlayers.loadAll") })).toBeEnabled();

    const faker = panelOf("Faker");
    expect(within(faker).getByText("FA")).toBeInTheDocument();
    expect(within(faker).getByText("T1")).toBeInTheDocument();
    expect(within(faker).getByText("MID")).toBeInTheDocument();
    expect(within(faker).getByText("Hide on bush#KR1 · KR")).toBeInTheDocument();
    expect(within(faker).getByRole("link", { name: /twitch/ })).toHaveAttribute("href", "https://twitch.tv/faker");

    const zeus = panelOf("Zeus");
    expect(within(zeus).queryByRole("link")).not.toBeInTheDocument();
    expect(within(zeus).getByRole("button", { name: L("proPlayers.load") })).toBeInTheDocument();
  });

  it("filters by region tab and updates the footer count", async () => {
    await renderView();
    fireEvent.click(screen.getByRole("tab", { name: "LEC" }));
    expect(screen.getByText("Caps", { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByText("Faker", { selector: "p" })).not.toBeInTheDocument();
    expect(screen.getByText(L("proPlayers.footer", { count: countBy("euw1") }))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "LCS" }));
    expect(screen.getByText("Bjergsen", { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByText("Caps", { selector: "p" })).not.toBeInTheDocument();
    expect(screen.getByText(L("proPlayers.footer", { count: countBy("na1") }))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "LCK" }));
    expect(screen.getByText(L("proPlayers.footer", { count: countBy("kr") }))).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "LCK" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("ProPlayersView — loading a player", () => {
  it("fetches with the player's own region/Riot ID and renders one chip per match", async () => {
    vi.mocked(getAccountByRiotId).mockResolvedValue({ puuid: "pro-puuid", gameName: "x", tagLine: "y" });
    vi.mocked(getRecentMatchIds).mockResolvedValue(["M1", "M2", "M3", "M4"]);
    vi.mocked(getMatchFull).mockImplementation(async (_c, id) => {
      if (id === "M1") return match("M1", { championId: 266, win: true, kills: 10, deaths: 2, assists: 5 }, { durationSec: 1830 });
      if (id === "M2") return match("M2", { championId: 9999, win: false, kills: 1, deaths: 7, assists: 3 });
      return match(id, null); // pro not in participants -> dropped
    });

    await renderView();
    const faker = panelOf("Faker");
    await act(async () => {
      fireEvent.click(within(faker).getByRole("button", { name: L("proPlayers.load") }));
    });

    const expectedCfg = { apiKey: "RGAPI-test", region: "kr", riotIdName: "Hide on bush", riotIdTag: "KR1" };
    expect(getAccountByRiotId).toHaveBeenCalledWith(expectedCfg, "Hide on bush", "KR1");
    expect(getRecentMatchIds).toHaveBeenCalledWith(expectedCfg, "pro-puuid", 3);
    // Only the first 3 ids are fetched even if the API returns more.
    expect(getMatchFull).toHaveBeenCalledTimes(3);
    expect(getMatchFull).not.toHaveBeenCalledWith(expect.anything(), "M4");

    const win = within(faker).getByText("10/2/5").parentElement!;
    expect(win).toHaveAttribute("title", "Aatrox · 10/2/5 · 31min");
    expect(win.className).toContain("ring-good/40");
    expect(within(win).getByRole("img", { name: "Aatrox" })).toHaveAttribute("src", "aatrox.png");

    const loss = within(faker).getByText("1/7/3").parentElement!;
    expect(loss).toHaveAttribute("title", "? · 1/7/3 · 30min");
    expect(loss.className).toContain("ring-bad/40");
    expect(within(loss).queryByRole("img")).not.toBeInTheDocument();

    // Button is gone once data exists.
    expect(within(faker).queryByRole("button", { name: L("proPlayers.load") })).not.toBeInTheDocument();
  });

  it("shows 'cargando...' and a busy skeleton row while the request is pending", async () => {
    let resolveAccount!: (v: { puuid: string; gameName: string; tagLine: string }) => void;
    vi.mocked(getAccountByRiotId).mockReturnValue(new Promise((r) => { resolveAccount = r; }));
    vi.mocked(getRecentMatchIds).mockResolvedValue([]);

    const { container } = await renderView();
    const zeus = panelOf("Zeus");
    await act(async () => {
      fireEvent.click(within(zeus).getByRole("button", { name: L("proPlayers.load") }));
    });
    expect(within(zeus).getByText(L("common.loading"))).toBeInTheDocument();
    expect(zeus.querySelector('[aria-busy="true"]')!.children).toHaveLength(5);

    await act(async () => {
      resolveAccount({ puuid: "pro-puuid", gameName: "x", tagLine: "y" });
    });
    expect(within(zeus).queryByText(L("common.loading"))).not.toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it("renders the error truncated to 80 chars when a fetch fails", async () => {
    const long = "x".repeat(200);
    vi.mocked(getAccountByRiotId).mockRejectedValue(new Error(long));

    await renderView();
    const oner = panelOf("Oner");
    await act(async () => {
      fireEvent.click(within(oner).getByRole("button", { name: L("proPlayers.load") }));
    });
    const expected = `Error: ${long}`.slice(0, 80);
    expect(within(oner).getByText(expected)).toBeInTheDocument();
    expect(getRecentMatchIds).not.toHaveBeenCalled();
  });

  it("'Cargar todos' loads every visible player sequentially", async () => {
    const order: string[] = [];
    const resolvers: Array<() => void> = [];
    // Each account lookup stays pending until released, so a parallel
    // implementation would start the second lookup before the first resolves.
    vi.mocked(getAccountByRiotId).mockImplementation((_c, name) => {
      order.push(name);
      return new Promise((r) => {
        resolvers.push(() => r({ puuid: "pro-puuid", gameName: name, tagLine: "" }));
      });
    });
    vi.mocked(getRecentMatchIds).mockResolvedValue(["M1"]);
    vi.mocked(getMatchFull).mockResolvedValue(
      match("M1", { championId: 64, win: true, kills: 3, deaths: 3, assists: 3 })
    );

    await renderView();
    fireEvent.click(screen.getByRole("tab", { name: "LCS" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: L("proPlayers.loadAll") }));
    });

    const na = PRO_PLAYERS.filter((p) => p.region === "na1").map((p) => p.riotIdName);
    expect(na.length).toBeGreaterThanOrEqual(2);
    expect(order).toEqual([na[0]]);

    for (let i = 0; i < na.length; i++) {
      await act(async () => {
        resolvers[i]();
      });
      expect(order).toEqual(na.slice(0, Math.min(i + 2, na.length)));
    }
    expect(screen.getAllByText("3/3/3")).toHaveLength(na.length);
    // Non-visible (LCK/LEC) players are never requested.
    expect(getAccountByRiotId).toHaveBeenCalledTimes(na.length);
  });
});

describe("ProPlayersView — closing", () => {
  it("closes on Escape and on backdrop click, not on inner click", async () => {
    const { onClose } = await renderView();
    fireEvent.click(screen.getByText("Pro Players"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
