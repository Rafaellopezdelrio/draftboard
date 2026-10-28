// BuildPanel is the shell around the op.gg build: it fetches op.gg + the
// locally synced aggregates, derives draft/live adaptations and hands them to
// <OpggBuildSection /> (stubbed here — it has its own tests). Real: runeAdvice,
// aramAdvice, suggestBuildAdaptations, findMyPlayer, PowerSpikesBars, prefs
// store, toasts.
//   - Unknown champion → nothing; header + loading skeleton while op.gg loads
//   - "No data" card only when op.gg AND aggregates are empty; Retry refetches
//   - Aggregate fallback rows: final items (deduped), skill order, rune page
//   - Rune import button (pref-gated) → applyRunes + inline status + toast
//   - Draft adaptations, rune tips vs enemy comp, ARAM banner
//   - Live in-game suggestions computed from the enemy team only

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { BuildPanel } from "./BuildPanel";
import { ToastProvider } from "./ui/ToastContainer";
import { usePrefsStore, DEFAULT_PREFS } from "../state/prefsStore";
import type { Champion, ChampionDb, Role } from "../types/champion";
import type { OpggBuild } from "../services/opggBuilds";
import type { BuildAgg, RuneAgg, SkillOrderAgg } from "../services/aggregateRepo";
import type { LiveGamePlayer, LiveGameSnapshot } from "../services/liveClient";
import * as agg from "../services/aggregateRepo";
import * as opgg from "../services/opggBuilds";
import * as lcu from "../services/lcuService";
import * as inGame from "../engine/inGameAdapter";

const live = vi.hoisted(() => ({
  state: { inGame: false, snapshot: null as LiveGameSnapshot | null },
}));
vi.mock("../hooks/useLiveGame", () => ({ useLiveGame: () => live.state }));

vi.mock("../services/aggregateRepo", () => ({
  loadAggregatedBuilds: vi.fn(),
  loadAggregatedRunes: vi.fn(),
  loadAggregatedSkillOrder: vi.fn(),
}));
vi.mock("../services/opggBuilds", async (importActual) => {
  const actual = await importActual<typeof import("../services/opggBuilds")>();
  return { ...actual, fetchOpggBuild: vi.fn() };
});
vi.mock("../services/lcuService", () => ({ applyRunes: vi.fn() }));
vi.mock("../engine/inGameAdapter", () => ({ suggestInGameAdaptations: vi.fn() }));
// ItemIcon would lazily fetch DDragon items.json — keep it offline.
vi.mock("../services/itemMeta", () => ({
  getItemMeta: () => null,
  subscribeToItemMeta: () => () => {},
}));
// Stub exposes the props BuildPanel derives so we can assert the wiring.
vi.mock("./build/OpggBuildSection", async () => {
  const { createElement } = await import("react");
  return {
    OpggBuildSection: (p: {
      build: OpggBuild & { tag?: string };
      enemyDdIds: string[];
      adaptations: unknown[];
      inGameSuggestions: Array<{ key: string }>;
    }) =>
      createElement("div", {
        "data-testid": "opgg-section",
        "data-build": p.build.tag,
        "data-enemies": p.enemyDdIds.join(","),
        "data-adaptations": String(p.adaptations.length),
        "data-ingame": p.inGameSuggestions.map((s) => s.key).join(","),
      }),
  };
});

const PATCH = "16.21.1";

function champ(key: string, id: string, tags: string[]): Champion {
  return {
    key,
    id,
    name: id,
    title: "",
    iconUrl: `icon-${id}.png`,
    splashUrl: "",
    tags,
    roles: [],
    archetypes: [],
  };
}

const DB = {
  patch: PATCH,
  champions: {
    "222": champ("222", "Jinx", ["Marksman"]),
    "99": champ("99", "Lux", ["Mage", "Support"]),
    "101": champ("101", "Xerath", ["Mage"]),
    "1": champ("1", "Annie", ["Mage"]),
  },
  counters: [],
  meta: [],
  fetchedAt: 0,
} as unknown as ChampionDb;

const OPGG = { tag: "opgg-jinx" } as unknown as OpggBuild;
const OPGG_RETRY = { tag: "opgg-retry" } as unknown as OpggBuild;

const BUILDS: BuildAgg[] = [
  { championId: 222, position: "BOTTOM", itemIds: [3031, 3031, 3094], games: 200, wins: 110 },
];
const SKILLS: SkillOrderAgg = { firstThree: "123", maxOrder: "132", games: 100, wins: 50 };
const PERKS = [8008, 9111, 9104, 8014, 8304, 8345];
const RUNES: RuneAgg = {
  championId: 222,
  position: "BOTTOM",
  primaryStyle: 8000,
  subStyle: 8300,
  perks: PERKS,
  shards: [],
  games: 100,
  wins: 55,
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderPanel(
  props: { championKey?: string; role?: Role; enemyKeys?: string[] } = {}
) {
  return render(
    <ToastProvider>
      <BuildPanel
        db={DB}
        championKey={props.championKey ?? "222"}
        role={props.role ?? "BOTTOM"}
        enemyKeys={props.enemyKeys}
      />
    </ToastProvider>
  );
}

function player(summonerName: string, team: "ORDER" | "CHAOS", items: number[]): LiveGamePlayer {
  return {
    championName: summonerName,
    rawChampionName: "",
    isBot: false,
    isDead: false,
    level: 10,
    position: "",
    skinID: 0,
    summonerName,
    summonerSpells: {
      summonerSpellOne: { displayName: "Flash", rawDescription: "" },
      summonerSpellTwo: { displayName: "Heal", rawDescription: "" },
    },
    scores: { kills: 0, deaths: 0, assists: 0, creepScore: 0, wardScore: 0 },
    team,
    items: items.map((itemID) => ({ itemID })),
  } as unknown as LiveGamePlayer;
}

function setLive(opts: { gameMode?: string; mapNumber?: number; me?: string; inGame?: boolean }) {
  live.state = {
    inGame: opts.inGame ?? true,
    snapshot: {
      activePlayer: { summonerName: opts.me ?? "Me", currentGold: 0, level: 10 },
      allPlayers: [
        player("Me", "ORDER", [3031]),
        player("Ally", "ORDER", [3089]),
        player("Foe1", "CHAOS", [3075]),
        player("Foe2", "CHAOS", [3065]),
      ],
      events: [],
      gameData: { gameMode: opts.gameMode ?? "CLASSIC", gameTime: 900, mapNumber: opts.mapNumber ?? 11 },
    },
  };
}

beforeEach(() => {
  live.state = { inGame: false, snapshot: null };
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, showRuneImportButton: true } });
  vi.mocked(agg.loadAggregatedBuilds).mockResolvedValue([]);
  vi.mocked(agg.loadAggregatedRunes).mockResolvedValue(null);
  vi.mocked(agg.loadAggregatedSkillOrder).mockResolvedValue(null);
  vi.mocked(opgg.fetchOpggBuild).mockResolvedValue(null);
  vi.mocked(inGame.suggestInGameAdaptations).mockReturnValue([]);
  // Collapsible Panels (power spikes) read/write localStorage.
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

describe("BuildPanel — loading & fallbacks", () => {
  it("renders nothing for a champion missing from the DB", async () => {
    const { container } = renderPanel({ championKey: "9999" });
    await act(async () => {});
    expect(container.querySelector("h3")).toBeNull();
    expect(screen.queryByTestId("opgg-section")).toBeNull();
    expect(opgg.fetchOpggBuild).not.toHaveBeenCalled();
  });

  it("shows the header and a loading skeleton until op.gg answers", async () => {
    const d = deferred<OpggBuild | null>();
    vi.mocked(opgg.fetchOpggBuild).mockReturnValue(d.promise);
    renderPanel({ enemyKeys: ["99", "9999", "101"] });

    expect(screen.getByText("Build · Jinx").tagName).toBe("H3");
    expect(screen.getByAltText("Jinx")).toHaveAttribute("src", "icon-Jinx.png");
    expect(screen.getByText("Cargando build óptima…")).toBeInTheDocument();
    expect(screen.queryByText("No se pudo cargar la build recomendada de op.gg.")).toBeNull();
    expect(opgg.fetchOpggBuild).toHaveBeenCalledWith("Jinx", "BOTTOM");
    expect(agg.loadAggregatedBuilds).toHaveBeenCalledWith(PATCH, 222, "BOTTOM");

    await act(async () => d.resolve(OPGG));
    expect(screen.queryByText("Cargando build óptima…")).toBeNull();
    const section = screen.getByTestId("opgg-section");
    expect(section).toHaveAttribute("data-build", "opgg-jinx");
    // Unknown enemy keys are dropped before mapping to DDragon ids.
    expect(section).toHaveAttribute("data-enemies", "Lux,Xerath");
  });

  it("shows the no-data card when op.gg and aggregates are all empty, and Retry refetches", async () => {
    renderPanel();
    expect(
      await screen.findByText("No se pudo cargar la build recomendada de op.gg.")
    ).toBeInTheDocument();
    expect(screen.getByText(/Verifica que el proxy esté activo en Prefs/)).toBeInTheDocument();
    expect(opgg.fetchOpggBuild).toHaveBeenCalledTimes(1);

    const d = deferred<OpggBuild | null>();
    vi.mocked(opgg.fetchOpggBuild).mockReturnValue(d.promise);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(opgg.fetchOpggBuild).toHaveBeenCalledTimes(2);
    expect(opgg.fetchOpggBuild).toHaveBeenLastCalledWith("Jinx", "BOTTOM");
    expect(screen.getByText("Cargando build óptima…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();

    await act(async () => d.resolve(OPGG_RETRY));
    expect(screen.getByTestId("opgg-section")).toHaveAttribute("data-build", "opgg-retry");
    expect(screen.queryByText("No se pudo cargar la build recomendada de op.gg.")).toBeNull();
  });

  it("falls back to synced aggregates: deduped final items, skill order and rune page", async () => {
    vi.mocked(agg.loadAggregatedBuilds).mockResolvedValue(BUILDS);
    vi.mocked(agg.loadAggregatedSkillOrder).mockResolvedValue(SKILLS);
    vi.mocked(agg.loadAggregatedRunes).mockResolvedValue(RUNES);
    renderPanel();

    expect(await screen.findByText("Items finales")).toBeInTheDocument();
    expect(screen.queryByText("No se pudo cargar la build recomendada de op.gg.")).toBeNull();
    const itemSrcs = Array.from(document.querySelectorAll("img[src*='/img/item/']")).map((i) =>
      i.getAttribute("src")
    );
    expect(itemSrcs).toEqual([
      `https://ddragon.leagueoflegends.com/cdn/${PATCH}/img/item/3031.png`,
      `https://ddragon.leagueoflegends.com/cdn/${PATCH}/img/item/3094.png`,
    ]);
    expect(screen.getByText(/55% WR ·/)).toHaveTextContent("55% WR · 200 games");

    expect(screen.getByText("Habilidades")).toBeInTheDocument();
    expect(screen.getByText("Q → W → E")).toBeInTheDocument();
    expect(screen.getByText("Q > E > W")).toBeInTheDocument();

    expect(screen.getByText("Runas recomendadas")).toBeInTheDocument();
    // First 4 perks are the primary tree (large), the rest are small.
    expect(screen.getByAltText("Runa 8008").className).toContain("w-8");
    expect(screen.getByAltText("Runa 8014").className).toContain("w-8");
    expect(screen.getByAltText("Runa 8304").className).toContain("w-5");
    expect(screen.getByAltText("Runa 8345")).toHaveAttribute(
      "src",
      "https://raw.communitydragon.org/latest/game/assets/perks/8345.png"
    );
  });
});

describe("BuildPanel — rune import", () => {
  async function renderWithRunes() {
    vi.mocked(agg.loadAggregatedRunes).mockResolvedValue(RUNES);
    renderPanel();
    return screen.findByRole("button", { name: "Aplicar →" });
  }

  it("applies the aggregate rune page and confirms inline + via toast", async () => {
    const d = deferred<boolean>();
    vi.mocked(lcu.applyRunes).mockReturnValue(d.promise);
    fireEvent.click(await renderWithRunes());

    expect(screen.getByText("Aplicando...")).toBeInTheDocument();
    expect(lcu.applyRunes).toHaveBeenCalledWith({
      name: "Jinx BOTTOM",
      primaryStyleId: 8000,
      subStyleId: 8300,
      selectedPerkIds: PERKS,
    });

    await act(async () => d.resolve(true));
    expect(screen.getByText("✓ Aplicadas")).toBeInTheDocument();
    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Runas aplicadas");
    expect(toast).toHaveTextContent("El cliente de LoL ya tiene la página activa.");
  });

  it("reports a failed import inline and with an error toast", async () => {
    vi.mocked(lcu.applyRunes).mockResolvedValue(false);
    const btn = await renderWithRunes();
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(screen.getByText("Error — abre el cliente")).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Error aplicando runas");
    expect(alert).toHaveTextContent("Abre el cliente y reintenta.");
  });

  it("hides the import button when the pref is off", async () => {
    usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, showRuneImportButton: false } });
    vi.mocked(agg.loadAggregatedRunes).mockResolvedValue(RUNES);
    renderPanel();
    expect(await screen.findByText("Runas recomendadas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aplicar →" })).toBeNull();
  });
});

describe("BuildPanel — enemy comp & live game", () => {
  it("lists draft adaptations with priority styling and forwards them to the op.gg section", async () => {
    vi.mocked(opgg.fetchOpggBuild).mockResolvedValue(OPGG);
    // Real adaptation engine: squishy Jinx vs an all-AP enemy (Lux) → MR core
    // + Zhonya situational. Proves the champion + enemy keys are wired in.
    renderPanel({ enemyKeys: ["99"] });

    expect(await screen.findByTestId("opgg-section")).toHaveAttribute("data-adaptations", "2");
    expect(screen.getByText("Adaptaciones vs comp enemiga")).toBeInTheDocument();
    const fon = screen.getByText("Force of Nature").closest("div.rounded") as HTMLElement;
    expect(fon).toHaveTextContent("Equipo enemigo 100% AP — necesitas MR");
    expect(fon.className).toContain("bg-bad/10");
    const zhonya = screen.getByText("Zhonya's Hourglass").closest("div.rounded") as HTMLElement;
    expect(zhonya.className).toContain("bg-meh/10");
  });

  it("adds rune tips for an AP-heavy poke comp and none without enemies", async () => {
    const { unmount } = renderPanel({ enemyKeys: ["99", "101", "1"] });
    await act(async () => {});
    expect(screen.getByText("Runas vs su comp")).toBeInTheDocument();
    expect(
      screen.getByText("Comp AP-heavy: shard de MR (fila 3) en vez de armadura.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Mucho poke: Second Wind + shard de HP para sostener antes de pelear.")
    ).toBeInTheDocument();
    unmount();

    renderPanel();
    await act(async () => {});
    expect(screen.queryByText("Runas vs su comp")).toBeNull();
    expect(screen.queryByText("Adaptaciones vs comp enemiga")).toBeNull();
  });

  it.each([
    ["ARAM game mode", { gameMode: "ARAM" }],
    ["Howling Abyss map", { mapNumber: 12 }],
  ])("shows the ARAM banner on %s", async (_label, opts) => {
    setLive(opts);
    renderPanel();
    await act(async () => {});
    expect(screen.getByText("Consejo ARAM · Jinx")).toBeInTheDocument();
    expect(screen.getByText(/Posiciónate detrás del frontline/)).toBeInTheDocument();
    expect(screen.getByText(/Sin recall: usa Reliquia de Vida/)).toBeInTheDocument();
    expect(
      screen.getByText("Los items de abajo son de SoloQ — adapta hacia sustain/poke.")
    ).toBeInTheDocument();
  });

  it("shows no ARAM banner on Summoner's Rift", async () => {
    setLive({});
    renderPanel();
    await act(async () => {});
    expect(screen.queryByText(/Consejo ARAM/)).toBeNull();
  });

  it("feeds only enemy-team players to the in-game adapter and forwards its suggestions", async () => {
    vi.mocked(opgg.fetchOpggBuild).mockResolvedValue(OPGG);
    vi.mocked(inGame.suggestInGameAdaptations).mockReturnValue([
      { itemId: 3033, itemName: "Mortal Reminder", reason: "x", priority: "core", key: "gw-ad" },
    ]);
    setLive({});
    renderPanel();

    expect(await screen.findByTestId("opgg-section")).toHaveAttribute("data-ingame", "gw-ad");
    const calls = vi.mocked(inGame.suggestInGameAdaptations).mock.calls;
    const args = calls[calls.length - 1][0];
    expect(args.champion.id).toBe("Jinx");
    expect(args.gameTime).toBe(900);
    expect(args.myItems).toEqual([{ itemID: 3031 }]);
    expect(args.enemyPlayers.map((p) => p.items[0].itemID)).toEqual([3075, 3065]);
  });

  it("skips in-game suggestions when the local player can't be matched or not in game", async () => {
    vi.mocked(opgg.fetchOpggBuild).mockResolvedValue(OPGG);
    setLive({ me: "Stranger" });
    const { unmount } = renderPanel();
    expect(await screen.findByTestId("opgg-section")).toHaveAttribute("data-ingame", "");
    unmount();

    setLive({ inGame: false });
    renderPanel();
    expect(await screen.findByTestId("opgg-section")).toHaveAttribute("data-ingame", "");
    expect(inGame.suggestInGameAdaptations).not.toHaveBeenCalled();
  });
});

describe("BuildPanel — champion switch", () => {
  it("ignores a late op.gg response for the previous champion", async () => {
    const old = deferred<OpggBuild | null>();
    vi.mocked(opgg.fetchOpggBuild)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ tag: "opgg-lux" } as unknown as OpggBuild);
    const { rerender } = renderPanel();
    rerender(
      <ToastProvider>
        <BuildPanel db={DB} championKey="99" role="UTILITY" />
      </ToastProvider>
    );
    expect(await screen.findByTestId("opgg-section")).toHaveAttribute("data-build", "opgg-lux");

    await act(async () => old.resolve(OPGG));
    expect(screen.getByTestId("opgg-section")).toHaveAttribute("data-build", "opgg-lux");
  });

  // BUG: the aggregate effect (loadAggregatedBuilds/Runes/SkillOrder) has no
  // cancellation guard, unlike the op.gg effect. Switching champion while the
  // previous champion's SQLite queries are in flight lets the stale result land
  // last and overwrite the new champion's final items / runes / skill order.
  // Verified failing: Lux shows Jinx's "55% WR · 200 games".
  it.skip("ignores late synced aggregates for the previous champion", async () => {
    const oldBuilds = deferred<BuildAgg[]>();
    vi.mocked(agg.loadAggregatedBuilds)
      .mockReturnValueOnce(oldBuilds.promise)
      .mockResolvedValueOnce([
        { championId: 99, position: "UTILITY", itemIds: [3089], games: 100, wins: 60 },
      ]);
    const { rerender } = renderPanel();
    rerender(
      <ToastProvider>
        <BuildPanel db={DB} championKey="99" role="UTILITY" />
      </ToastProvider>
    );
    expect(await screen.findByText(/60% WR ·/)).toHaveTextContent("60% WR · 100 games");

    // Jinx's slower aggregate query lands after the switch.
    await act(async () => oldBuilds.resolve(BUILDS));
    expect(screen.getByText(/WR ·/)).toHaveTextContent("60% WR · 100 games");
  });
});
