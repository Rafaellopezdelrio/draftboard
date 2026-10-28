// SummonerLookupView contract:
//   - Search is gated on a Riot key OR a configured proxy; settings fall back
//     to an euw1 default when none are stored.
//   - Secondary endpoints (summoner, masteries, match ids, league entries,
//     individual matches) degrade to "no data" instead of failing the lookup.
//   - Profile: SOLO queue entry wins over flex, rank emblem only for known
//     tiers, streak chip from the newest games, recent-form aggregates,
//     mastery tiles, per-match rows, op.gg link built from the tag.
//   - Copy-PUUID button flips to "OK" for 1.5s.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { SummonerLookupView } from "./SummonerLookupView";
import type { ChampionDb } from "../types/champion";
import type {
  ChampionMasteryDto,
  LeagueEntryDto,
  MatchFull,
  MatchParticipant,
} from "../services/riotApi";

vi.mock("../services/riotApi", () => ({
  getAccountByRiotId: vi.fn(),
  getSummonerByPuuid: vi.fn(),
  getLeagueEntriesByPuuid: vi.fn(),
  getTopMasteries: vi.fn(),
  getRecentMatchIds: vi.fn(),
  getMatchFull: vi.fn(),
  getRiotProxyUrl: vi.fn(),
}));

// isTauri() is true under setup.ts, so the real loadSettings would hit the
// mocked SQL plugin; stub it to control the stored Riot config directly.
vi.mock("../services/settingsRepo", () => ({
  loadSettings: vi.fn(),
}));

import { loadSettings } from "../services/settingsRepo";
import {
  getAccountByRiotId,
  getSummonerByPuuid,
  getLeagueEntriesByPuuid,
  getTopMasteries,
  getRecentMatchIds,
  getMatchFull,
  getRiotProxyUrl,
} from "../services/riotApi";

const PUUID = "puuid-123";

function champ(key: string, name: string) {
  return {
    key,
    id: name.replace(/\s/g, ""),
    name,
    iconUrl: `https://cdn.test/icon/${key}.png`,
    splashUrl: `https://cdn.test/splash/${key}.jpg`,
    roles: [],
    tags: [],
  };
}

const db = {
  patch: "16.10.1",
  champions: {
    "266": champ("266", "Aatrox"),
    "103": champ("103", "Ahri"),
    "64": champ("64", "Lee Sin"),
  },
  counters: [],
  meta: [],
  fetchedAt: 0,
} as unknown as ChampionDb;

function league(over: Partial<LeagueEntryDto> = {}): LeagueEntryDto {
  return {
    queueType: "RANKED_SOLO_5x5",
    tier: "GOLD",
    rank: "II",
    leaguePoints: 45,
    wins: 60,
    losses: 40,
    hotStreak: false,
    veteran: false,
    freshBlood: false,
    ...over,
  };
}

function mastery(championId: number, championLevel: number, championPoints: number): ChampionMasteryDto {
  return { championId, championLevel, championPoints, lastPlayTime: 0 };
}

interface MeOver {
  championId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
}

function matchFull(id: string, me: MeOver | null, durationSec = 1800): MatchFull {
  const other = { puuid: "someone-else", championId: 1, win: !me?.win, kills: 0, deaths: 0, assists: 0, cs: 0 };
  const participants = [other, ...(me ? [{ puuid: PUUID, ...me }] : [])];
  return {
    matchId: id,
    durationSec,
    endTsMs: 0,
    queueId: 420,
    participants: participants as unknown as MatchParticipant[],
    teams: [],
  };
}

interface Scenario {
  proxy?: string | null;
  leagues?: LeagueEntryDto[];
  masteries?: ChampionMasteryDto[];
  matches?: Record<string, MatchFull | Error>;
  level?: number;
}

function setup(s: Scenario = {}) {
  vi.mocked(getRiotProxyUrl).mockReturnValue(s.proxy === undefined ? "https://proxy.test" : s.proxy);
  vi.mocked(getAccountByRiotId).mockResolvedValue({ puuid: PUUID, gameName: "Hide on bush", tagLine: "KR1" });
  vi.mocked(getSummonerByPuuid).mockResolvedValue({
    id: "s",
    accountId: "a",
    puuid: PUUID,
    profileIconId: 1,
    summonerLevel: s.level ?? 512,
  });
  vi.mocked(getTopMasteries).mockResolvedValue(s.masteries ?? []);
  vi.mocked(getLeagueEntriesByPuuid).mockResolvedValue(s.leagues ?? []);
  const matches = s.matches ?? {};
  vi.mocked(getRecentMatchIds).mockResolvedValue(Object.keys(matches));
  vi.mocked(getMatchFull).mockImplementation(async (_cfg, id) => {
    const m = matches[id];
    if (m instanceof Error) throw m;
    return m;
  });
}

function nameInput() {
  return screen.getByPlaceholderText("Nombre del invocador") as HTMLInputElement;
}
function tagInput() {
  return screen.getByPlaceholderText("EUW") as HTMLInputElement;
}
function searchButton() {
  return screen.getByRole("button", { name: "Buscar" });
}

async function search(name = "Hide on bush", tag?: string) {
  fireEvent.change(nameInput(), { target: { value: name } });
  if (tag !== undefined) fireEvent.change(tagInput(), { target: { value: tag } });
  await act(async () => {
    fireEvent.click(searchButton());
  });
}

function renderView(onClose = vi.fn()) {
  render(<SummonerLookupView db={db} onClose={onClose} />);
  return onClose;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadSettings).mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SummonerLookupView — search gating", () => {
  it("starts on the empty prompt with the EUW tag and a disabled search button", () => {
    setup();
    renderView();
    expect(screen.getByRole("dialog", { name: "Buscar jugador" })).toBeInTheDocument();
    expect(screen.getByText("Busca a cualquier jugador por su Riot ID")).toBeInTheDocument();
    expect(tagInput().value).toBe("EUW");
    expect(searchButton()).toBeDisabled();
    fireEvent.change(nameInput(), { target: { value: "Caps" } });
    expect(searchButton()).toBeEnabled();
  });

  it("does not search when the form is submitted with an empty name", async () => {
    setup();
    renderView();
    await act(async () => {
      fireEvent.submit(nameInput().closest("form")!);
    });
    expect(getAccountByRiotId).not.toHaveBeenCalled();
  });

  it("refuses to search without a proxy and without a stored API key", async () => {
    setup({ proxy: null });
    renderView();
    await search();
    expect(
      screen.getByText(/Necesitas configurar tu Riot API Key/)
    ).toBeInTheDocument();
    expect(getAccountByRiotId).not.toHaveBeenCalled();
    // Error replaces the empty prompt and the button is usable again.
    expect(screen.queryByText("Busca a cualquier jugador por su Riot ID")).not.toBeInTheDocument();
    expect(searchButton()).toBeEnabled();
  });

  it("direct mode: uses the stored settings and trims the Riot ID parts", async () => {
    const stored = { region: "kr" as const, apiKey: "RGAPI-test", riotIdName: "me", riotIdTag: "EUW" };
    vi.mocked(loadSettings).mockResolvedValue(stored);
    setup({ proxy: null });
    renderView();
    await search("  Hide on bush ", " KR1 ");
    expect(getAccountByRiotId).toHaveBeenCalledWith(stored, "Hide on bush", "KR1");
    // Follow-up calls are keyed by the resolved account's puuid.
    expect(getSummonerByPuuid).toHaveBeenCalledWith(stored, PUUID);
    expect(getTopMasteries).toHaveBeenCalledWith(stored, PUUID, 7);
    expect(getRecentMatchIds).toHaveBeenCalledWith(stored, PUUID, 5);
    expect(getLeagueEntriesByPuuid).toHaveBeenCalledWith(stored, PUUID);
  });

  it("proxy mode: falls back to an euw1 config when no settings are stored", async () => {
    setup();
    renderView();
    await search();
    expect(getAccountByRiotId).toHaveBeenCalledWith(
      expect.objectContaining({ region: "euw1", apiKey: "" }),
      "Hide on bush",
      "EUW"
    );
    expect(screen.getByText("Hide on bush")).toBeInTheDocument();
  });

  it("shows the skeleton while loading and disables the button", async () => {
    setup();
    let resolve!: (v: { puuid: string; gameName: string; tagLine: string }) => void;
    vi.mocked(getAccountByRiotId).mockReturnValue(new Promise((r) => (resolve = r)));
    const { container } = render(<SummonerLookupView db={db} onClose={vi.fn()} />);
    await search();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    const busyBtn = screen.getByRole("button", { name: "..." });
    expect(busyBtn).toBeDisabled();
    await act(async () => {
      resolve({ puuid: PUUID, gameName: "Faker", tagLine: "KR1" });
    });
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.getByText("Faker")).toBeInTheDocument();
    expect(searchButton()).toBeEnabled();
  });

  it("surfaces an account lookup failure and clears it on the next successful search", async () => {
    setup();
    vi.mocked(getAccountByRiotId).mockRejectedValueOnce(new Error("Riot API 404: Not Found"));
    renderView();
    await search();
    expect(screen.getByText(/Riot API 404: Not Found/)).toBeInTheDocument();
    expect(screen.queryByText("Datos vía Riot API · públicos")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(searchButton());
    });
    expect(screen.queryByText(/Riot API 404/)).not.toBeInTheDocument();
    expect(screen.getByText("Datos vía Riot API · públicos")).toBeInTheDocument();
  });
});

describe("SummonerLookupView — profile rendering", () => {
  it("prefers the SOLO queue entry and renders rank, level, emblem and season stats", async () => {
    setup({
      leagues: [
        league({ queueType: "RANKED_FLEX_SR", tier: "PLATINUM", rank: "I", leaguePoints: 10 }),
        league({ wins: 60, losses: 40 }),
      ],
    });
    renderView();
    await search();
    expect(screen.getByText("#KR1")).toBeInTheDocument();
    expect(screen.getByText("Lvl 512")).toBeInTheDocument();
    expect(screen.getByTitle("GOLD II 45LP")).toBeInTheDocument();
    expect(screen.queryByTitle(/PLATINUM/)).not.toBeInTheDocument();
    const emblem = screen.getByRole("img", { name: "GOLD" }) as HTMLImageElement;
    expect(emblem.src).toMatch(/ranked-mini-regalia\/gold\.png$/);
    // Broken emblem image hides itself instead of showing a broken icon.
    fireEvent.error(emblem);
    expect(emblem.style.display).toBe("none");
    for (const label of ["Victorias", "Derrotas", "Winrate %", "Total"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // 60% season winrate (>= 55%) is coloured good.
    expect(screen.getByText("Winrate %").previousElementSibling).toHaveClass("text-good");
    expect(screen.queryByText("Sin clasificar")).not.toBeInTheDocument();
  });

  it("shows season wins/losses/winrate/total and keeps a sub-55% winrate neutral", async () => {
    // CountUp animates via requestAnimationFrame; fake it to land on the final values.
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    setup({ leagues: [league({ wins: 41, losses: 34 })] });
    renderView();
    await search();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const value = (label: string) => screen.getByText(label).previousElementSibling;
    expect(value("Victorias")).toHaveTextContent(/^41$/);
    expect(value("Derrotas")).toHaveTextContent(/^34$/);
    // 41 / 75 = 54.67% → one decimal, neutral colour.
    expect(value("Winrate %")).toHaveTextContent(/^54\.7$/);
    expect(value("Total")).toHaveTextContent(/^75$/);
    expect(value("Winrate %")).toHaveClass("text-white");
    expect(value("Winrate %")).not.toHaveClass("text-good");
  });

  it("shows the rank badge but no emblem for an unknown tier", async () => {
    setup({ leagues: [league({ tier: "WOOD", rank: "IV", leaguePoints: 0 })] });
    renderView();
    await search();
    expect(screen.getByTitle("WOOD IV 0LP")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "WOOD" })).not.toBeInTheDocument();
  });

  it("degrades every secondary endpoint failure to an unranked, no-data profile", async () => {
    setup({ leagues: [league({ queueType: "RANKED_FLEX_SR" })] });
    vi.mocked(getSummonerByPuuid).mockRejectedValue(new Error("x"));
    vi.mocked(getTopMasteries).mockRejectedValue(new Error("x"));
    vi.mocked(getRecentMatchIds).mockRejectedValue(new Error("x"));
    renderView();
    await search();
    expect(screen.getByText("Hide on bush")).toBeInTheDocument();
    // Flex-only entry is not shown as the player's rank.
    expect(screen.getByText("Sin clasificar")).toBeInTheDocument();
    expect(screen.queryByText(/^Lvl /)).not.toBeInTheDocument();
    expect(screen.getByText("Sin datos públicos disponibles para este jugador.")).toBeInTheDocument();
    expect(screen.queryByText("Victorias")).not.toBeInTheDocument();
    expect(screen.queryByText("Top maestrías")).not.toBeInTheDocument();
    expect(screen.queryByText("Últimas partidas")).not.toBeInTheDocument();
    expect(getMatchFull).not.toHaveBeenCalled();
  });

  it("treats a failing league endpoint as unranked", async () => {
    setup();
    vi.mocked(getLeagueEntriesByPuuid).mockRejectedValue(new Error("403"));
    renderView();
    await search();
    expect(screen.getByText("Sin clasificar")).toBeInTheDocument();
  });

  it("renders mastery tiles with level-tier badges and uses the top champion's splash", async () => {
    setup({
      masteries: [
        mastery(266, 12, 345_678),
        mastery(103, 7, 120_000),
        mastery(64, 5, 8_000),
        mastery(9999, 9, 50_000), // not in db → skipped
      ],
    });
    const { container } = render(<SummonerLookupView db={db} onClose={vi.fn()} />);
    await search();
    expect(screen.getByText("Top maestrías")).toBeInTheDocument();
    const aatrox = screen.getByTitle("Aatrox · M12 · 346k pts");
    const ahri = screen.getByTitle("Ahri · M7 · 120k pts");
    const lee = screen.getByTitle("Lee Sin · M5 · 8k pts");
    expect(within(aatrox).getByText("M12")).toHaveClass("bg-accent", "text-black");
    expect(within(ahri).getByText("M7")).toHaveClass("bg-accent/30");
    expect(within(lee).getByText("M5")).toHaveClass("bg-bg-elev");
    expect(within(aatrox).getByText("346k")).toBeInTheDocument();
    expect(screen.queryByTitle(/M9/)).not.toBeInTheDocument();
    const hero = container.querySelector<HTMLElement>('[style*="splash/266.jpg"]');
    expect(hero).not.toBeNull();
    expect(screen.queryByText("Sin datos públicos disponibles para este jugador.")).not.toBeInTheDocument();
  });

  it("builds recent form, streak and per-match rows, skipping failed/foreign matches", async () => {
    setup({
      matches: {
        m1: matchFull("m1", { championId: 103, win: true, kills: 10, deaths: 2, assists: 5, cs: 200 }, 1500),
        m2: matchFull("m2", { championId: 266, win: true, kills: 5, deaths: 0, assists: 5, cs: 180 }, 1200),
        m3: matchFull("m3", { championId: 999, win: false, kills: 1, deaths: 4, assists: 2, cs: 100 }, 1800),
        m4: new Error("match 500"),
        m5: matchFull("m5", null), // player not among participants
      },
    });
    renderView();
    await search();
    expect(getMatchFull).toHaveBeenCalledTimes(5);

    expect(screen.getByText("Forma reciente · 3g")).toBeInTheDocument();
    // 2 of 3 won → 67%, good colour.
    expect(screen.getByText("67% WR")).toHaveClass("text-good");
    // (16 + 12) / 6 = 4.67 → "good" KDA band.
    expect(screen.getByText("4.67 KDA")).toHaveClass("text-good");
    // 480 cs over 75 minutes.
    expect(screen.getByText("6.4 CS/min")).toBeInTheDocument();

    // Streak chip: the two newest games were wins.
    const streak = screen.getByTitle("Racha ganadora");
    expect(streak).toHaveTextContent("2W");

    // W/L pill strip, newest first.
    expect(screen.getByTitle("Victoria · 10/2/5")).toHaveTextContent("W");
    expect(screen.getByTitle("Victoria · 5/0/5")).toHaveTextContent("W");
    expect(screen.getByTitle("Derrota · 1/4/2")).toHaveTextContent("L");

    // Sparkline renders for 3+ games.
    expect(screen.getByRole("img", { name: "Tendencia" })).toBeInTheDocument();

    // Match rows.
    expect(screen.getByText("Últimas partidas")).toBeInTheDocument();
    expect(screen.getByText("10/2/5")).toHaveClass("text-accent");
    expect(screen.getByText("7.50 KDA")).toBeInTheDocument();
    expect(screen.getByText("8.0 CS/min")).toBeInTheDocument();
    expect(screen.getByText("25min")).toBeInTheDocument();
    // Deathless game: KDA = kills + assists.
    expect(screen.getByText("5/0/5")).toHaveClass("text-accent");
    expect(screen.getByText("10.00 KDA")).toBeInTheDocument();
    // Champion missing from db falls back to its numeric id.
    expect(screen.getByText("#999")).toBeInTheDocument();
    expect(screen.getByText("1/4/2")).toHaveClass("text-bad");
    expect(screen.getByText("0.75 KDA")).toBeInTheDocument();
    expect(screen.getByText("3.3 CS/min")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Ahri" })).toHaveAttribute("src", "https://cdn.test/icon/103.png");
  });

  it("shows a loss streak, a red winrate and no sparkline for fewer than 3 games", async () => {
    setup({
      matches: {
        m1: matchFull("m1", { championId: 266, win: false, kills: 2, deaths: 5, assists: 3, cs: 150 }),
        m2: matchFull("m2", { championId: 266, win: false, kills: 4, deaths: 4, assists: 4, cs: 150 }),
      },
    });
    renderView();
    await search();
    expect(screen.getByTitle("Racha perdedora")).toHaveTextContent("2L");
    expect(screen.getByText("0% WR")).toHaveClass("text-bad");
    // 13 / 9 = 1.44 → bad KDA band.
    expect(screen.getByText("1.44 KDA")).toHaveClass("text-bad");
    expect(screen.queryByRole("img", { name: "Tendencia" })).not.toBeInTheDocument();
  });

  it("omits the streak chip for a 1-game streak and colours 50% WR neutral", async () => {
    setup({
      matches: {
        m1: matchFull("m1", { championId: 266, win: true, kills: 3, deaths: 2, assists: 3, cs: 0 }, 0),
        m2: matchFull("m2", { championId: 266, win: false, kills: 2, deaths: 3, assists: 2, cs: 0 }, 0),
      },
    });
    renderView();
    await search();
    expect(screen.queryByTitle("Racha ganadora")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Racha perdedora")).not.toBeInTheDocument();
    expect(screen.getByText("50% WR")).toHaveClass("text-white/70");
    // (5 + 5) / 5 = 2.00 → "ok" band; per-row 3.00 is "good", 1.33 "bad".
    expect(screen.getByText("2.00 KDA")).toHaveClass("text-white/75");
    expect(screen.getByText("3/2/3")).toHaveClass("text-good");
    expect(screen.getByText("2/3/2")).toHaveClass("text-bad");
    // Zero-length games: no CS/min division.
    expect(screen.getByText("0.0 CS/min")).toBeInTheDocument();
    expect(screen.getAllByText("— CS/min")).toHaveLength(2);
  });
});

describe("SummonerLookupView — op.gg link", () => {
  function opggHref() {
    return screen.getByRole("link", { name: /op\.gg/ }).getAttribute("href");
  }

  it("uses the tag as region when it matches a known server (case-insensitive)", async () => {
    setup();
    renderView();
    await search("Hide on bush", "kr");
    expect(opggHref()).toBe("https://www.op.gg/summoners/kr/Hide%20on%20bush-KR1");
  });

  it("falls back to euw for a personalised tag", async () => {
    setup();
    renderView();
    await search("Hide on bush", "004");
    expect(opggHref()).toBe("https://www.op.gg/summoners/euw/Hide%20on%20bush-KR1");
  });

  // The tag datalist suggests region labels ("NA", "BR", "JP") while Riot's
  // default tags often carry a "1" ("NA1", "KR1", "EUW1"): both name the
  // same op.gg server slug (the bare label, lowercased).
  it.each([
    ["NA", "na"],
    ["na1", "na"],
    ["KR1", "kr"],
    ["EUW1", "euw"],
    ["BR", "br"],
    ["JP1", "jp"],
  ])("maps the region tag %s to the %s op.gg server", async (tag, slug) => {
    setup();
    renderView();
    await search("Doublelift", tag);
    expect(opggHref()).toMatch(new RegExp(`^https://www\\.op\\.gg/summoners/${slug}/`));
  });
});

describe("SummonerLookupView — copy PUUID", () => {
  it("copies the resolved account's puuid and reverts the label after 1.5s", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    setup();
    renderView();
    await search();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const btn = screen.getByTitle("Copia el PUUID al portapapeles");
    expect(btn).toHaveTextContent("PUUID");
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(writeText).toHaveBeenCalledWith(PUUID);
    expect(btn).toHaveTextContent("OK");
    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(btn).toHaveTextContent("OK");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(btn).toHaveTextContent("PUUID");
  });

  it("stays on PUUID when the clipboard refuses the write", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    setup();
    renderView();
    await search();
    const btn = screen.getByTitle("Copia el PUUID al portapapeles");
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(writeText).toHaveBeenCalled();
    expect(btn).toHaveTextContent("PUUID");
  });
});

describe("SummonerLookupView — closing", () => {
  it("closes on Escape and on backdrop click, but not on clicks inside the panel", () => {
    setup();
    const onClose = renderView();
    fireEvent.click(screen.getByText("Buscar jugador"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
