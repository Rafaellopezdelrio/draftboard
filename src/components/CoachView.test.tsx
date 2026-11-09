// CoachView contract:
//   - Lists the last 20 matches as selectable cards and auto-selects the newest.
//   - Selecting a match loads full match + timeline (rank optional) and runs
//     the coach + GPI engines; missing Riot ID / fetch failures show an error.
//   - Report: duration/queue header, Top Insight card (weakest GPI axis, only
//     when something scores < 65), GPI radar, optional AI Coach block, and
//     the insight cards (or a "clean game" note).
//   - AI Coach sends the match, my/opponent champion names and rank to
//     aiCoachAnalysis and renders the reply or the error.
//
// Engines that need a full Riot payload (analyzeMatch, computeGpi) are mocked
// so each test pins the insights/GPI it needs; deriveTopInsight + GpiRadar run
// for real.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CoachView } from "./CoachView";
import { usePrefsStore, DEFAULT_PREFS, type Preferences } from "../state/prefsStore";
import type { ChampionDb } from "../types/champion";
import type { MatchRow } from "../services/matchRepo";
import type { MatchFull, MatchTimeline } from "../services/riotApi";
import type { GpiScore } from "../engine/gpiEngine";
import type { Insight } from "../engine/coachEngine";

vi.mock("../services/matchRepo", () => ({ recentMatches: vi.fn() }));
vi.mock("../services/settingsRepo", () => ({ loadSettings: vi.fn() }));
vi.mock("../services/riotApi", () => ({
  getMatchFull: vi.fn(),
  getMatchTimeline: vi.fn(),
}));
vi.mock("../services/lcuPersonalData", () => ({ lcuRank: vi.fn() }));
vi.mock("../services/aiCoach", () => ({ aiCoachAnalysis: vi.fn() }));
vi.mock("../engine/coachEngine", () => ({ analyzeMatch: vi.fn() }));
vi.mock("../engine/gpiEngine", () => ({ computeGpi: vi.fn() }));

import { recentMatches } from "../services/matchRepo";
import { loadSettings } from "../services/settingsRepo";
import { getMatchFull, getMatchTimeline } from "../services/riotApi";
import { lcuRank } from "../services/lcuPersonalData";
import { aiCoachAnalysis } from "../services/aiCoach";
import { analyzeMatch } from "../engine/coachEngine";
import { computeGpi } from "../engine/gpiEngine";

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

const CFG = { puuid: "me", gameName: "Rafa", tagLine: "EUW", region: "euw1" };

const ROWS = [
  { matchId: "EUW1_1", championId: 266, win: true, queueId: 420, durationSec: 1800 },
  { matchId: "EUW1_2", championId: 9999, win: false, queueId: 440, durationSec: 1500 },
] as unknown as MatchRow[];

function participant(over: Record<string, unknown>) {
  return { puuid: "x", championId: 1, teamId: 100, position: "TOP", ...over };
}

function matchFull(over: Partial<MatchFull> = {}): MatchFull {
  return {
    matchId: "EUW1_1",
    durationSec: 1800,
    endTsMs: 0,
    queueId: 420,
    participants: [
      participant({ puuid: "me", championId: 266, teamId: 100, position: "TOP" }),
      participant({ puuid: "ally", championId: 9999, teamId: 100, position: "JUNGLE" }),
      participant({ puuid: "opp", championId: 64, teamId: 200, position: "TOP" }),
    ],
    teams: [],
    ...over,
  } as unknown as MatchFull;
}

const TIMELINE = { frames: [] } as unknown as MatchTimeline;

function gpi(categories: Partial<GpiScore["categories"]> = {}): GpiScore {
  return {
    total: 70,
    matchId: "EUW1_1",
    categories: {
      farming: 80,
      vision: 80,
      aggression: 80,
      survivability: 80,
      objectives: 80,
      versatility: 80,
      laning: 80,
      ...categories,
    },
  };
}

const INSIGHTS: Insight[] = [
  {
    category: "farming",
    severity: "bad",
    title: "CS bajo",
    detail: "Perdiste muchas oleadas.",
    metric: "5.1 cs/min",
    action: "Practica last-hit",
  },
  { category: "vision", severity: "good", title: "Buena visión", detail: "Wards constantes." },
] as unknown as Insight[];

const RANK = {
  tier: "GOLD",
  division: "II",
  leaguePoints: 42,
  wins: 1,
  losses: 1,
  hotStreak: false,
};

function setPrefs(over: Partial<Preferences> = {}) {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, ...over } });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function renderView(onClose = vi.fn()) {
  const utils = render(<CoachView db={db} onClose={onClose} />);
  await act(async () => {});
  await act(async () => {});
  return { ...utils, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  setPrefs();
  vi.mocked(recentMatches).mockResolvedValue(ROWS);
  vi.mocked(loadSettings).mockResolvedValue(CFG as never);
  vi.mocked(getMatchFull).mockResolvedValue(matchFull());
  vi.mocked(getMatchTimeline).mockResolvedValue(TIMELINE);
  vi.mocked(lcuRank).mockResolvedValue(RANK);
  vi.mocked(analyzeMatch).mockReturnValue(INSIGHTS);
  vi.mocked(computeGpi).mockReturnValue(gpi());
  vi.mocked(aiCoachAnalysis).mockResolvedValue("Juega más seguro en el carril.");
});

describe("CoachView — match list + loading", () => {
  it("lists recent matches and auto-loads the newest one", async () => {
    await renderView();
    expect(recentMatches).toHaveBeenCalledWith(20);

    const first = screen.getByTitle("Aatrox · SoloQ · 30min");
    expect(first).toHaveTextContent("Aatrox");
    expect(first).toHaveTextContent("W · SoloQ");
    expect(first.querySelector("img")).toHaveAttribute("src", "aatrox.png");
    expect(first.className).toContain("bg-accent/20");

    // Unknown champion falls back to "#id" with no icon.
    const second = screen.getByTitle("#9999 · Flex · 25min");
    expect(second).toHaveTextContent("L · Flex");
    expect(second.querySelector("img")).toBeNull();

    expect(getMatchFull).toHaveBeenCalledWith(CFG, "EUW1_1");
    expect(getMatchTimeline).toHaveBeenCalledWith(CFG, "EUW1_1");
    expect(screen.getByText(/30min ·\s*SoloQ/)).toBeInTheDocument();
  });

  it("does not fetch anything when there are no stored matches", async () => {
    vi.mocked(recentMatches).mockResolvedValue([]);
    await renderView();
    expect(loadSettings).not.toHaveBeenCalled();
    expect(getMatchFull).not.toHaveBeenCalled();
  });

  it("shows a busy skeleton while the match loads", async () => {
    const d = deferred<MatchFull>();
    vi.mocked(getMatchFull).mockReturnValue(d.promise);
    const { container } = await renderView();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();

    await act(async () => {
      d.resolve(matchFull());
    });
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.getByText("CS bajo")).toBeInTheDocument();
  });

  it("runs the engines with the fetched data and the LCU tier", async () => {
    await renderView();
    expect(analyzeMatch).toHaveBeenCalledWith({
      match: matchFull(),
      timeline: TIMELINE,
      myPuuid: "me",
    });
    expect(computeGpi).toHaveBeenCalledWith(matchFull(), "me", "GOLD", TIMELINE);
  });

  it("treats an LCU rank failure as unknown tier instead of an error", async () => {
    vi.mocked(lcuRank).mockRejectedValue(new Error("LCU offline"));
    await renderView();
    expect(computeGpi).toHaveBeenCalledWith(matchFull(), "me", null, TIMELINE);
    expect(screen.queryByText(/LCU offline/)).not.toBeInTheDocument();
    expect(screen.getByText("CS bajo")).toBeInTheDocument();
  });

  it("loads another match when its card is clicked", async () => {
    await renderView();
    vi.mocked(getMatchFull).mockResolvedValue(
      matchFull({ matchId: "EUW1_2", durationSec: 1500, queueId: 440 })
    );
    await act(async () => {
      fireEvent.click(screen.getByTitle("#9999 · Flex · 25min"));
    });
    expect(getMatchFull).toHaveBeenLastCalledWith(CFG, "EUW1_2");
    expect(screen.getByTitle("#9999 · Flex · 25min").className).toContain("bg-accent/20");
    expect(screen.getByText(/25min ·\s*Flex/)).toBeInTheDocument();
  });
});

describe("CoachView — errors", () => {
  it("asks for a Riot ID when settings have no puuid", async () => {
    vi.mocked(loadSettings).mockResolvedValue({ ...CFG, puuid: "" } as never);
    await renderView();
    expect(
      screen.getByText("Error: Configura primero tu Riot ID en ⚙")
    ).toBeInTheDocument();
    expect(getMatchFull).not.toHaveBeenCalled();
  });

  it("asks for a Riot ID when there are no settings at all", async () => {
    vi.mocked(loadSettings).mockResolvedValue(null);
    await renderView();
    expect(
      screen.getByText("Error: Configura primero tu Riot ID en ⚙")
    ).toBeInTheDocument();
  });

  it("shows the fetch error and hides the report", async () => {
    vi.mocked(getMatchFull).mockRejectedValue(new Error("Riot 503"));
    await renderView();
    expect(screen.getByText("Error: Riot 503")).toBeInTheDocument();
    expect(screen.queryByText("CS bajo")).not.toBeInTheDocument();
  });
});

describe("CoachView — report", () => {
  it("renders insight cards with icon, category, metric and action", async () => {
    await renderView();
    const bad = screen.getByText("CS bajo").closest("div.rounded")!;
    expect(bad).toHaveTextContent("✗");
    expect(bad).toHaveTextContent("farming");
    expect(bad).toHaveTextContent("Perdiste muchas oleadas.");
    expect(bad).toHaveTextContent("5.1 cs/min");
    expect(bad).toHaveTextContent("→ Practica last-hit");

    const good = screen.getByText("Buena visión").closest("div.rounded")!;
    expect(good).toHaveTextContent("✓");
    expect(good).not.toHaveTextContent("→");
  });

  it("shows the clean-game note when there are no insights", async () => {
    vi.mocked(analyzeMatch).mockReturnValue([]);
    await renderView();
    expect(screen.getByText("Sin observaciones — partida limpia.")).toBeInTheDocument();
  });

  it("skips the Top Insight card when every GPI axis is healthy, but shows the radar", async () => {
    await renderView();
    expect(screen.queryByText(/Insight principal/)).not.toBeInTheDocument();
    expect(document.querySelector("svg polygon")).not.toBeNull();
  });

  it("shows a critical Top Insight with a secondary weak area", async () => {
    vi.mocked(computeGpi).mockReturnValue(gpi({ laning: 20, vision: 40 }));
    await renderView();
    const card = screen.getByText(/Insight principal/).closest("div.border")!;
    expect(card.className).toContain("border-bad/60");
    expect(card).toHaveTextContent("Carril · 20/100");
    expect(card).toHaveTextContent("Perdiste tu carril claro.");
    expect(card).toHaveTextContent(
      "También revisa visión: Más visión preventiva."
    );
  });

  it("shows a needs-work Top Insight without a secondary line", async () => {
    vi.mocked(computeGpi).mockReturnValue(gpi({ farming: 50 }));
    await renderView();
    const card = screen.getByText(/Insight principal/).closest("div.border")!;
    expect(card.className).toContain("border-meh/50");
    expect(card).toHaveTextContent("Farmeo · 50/100");
    expect(card).toHaveTextContent("Sube tu CS/min.");
    expect(card).not.toHaveTextContent("También revisa");
  });

  it("styles a borderline (55-64) axis as 'okay'", async () => {
    vi.mocked(computeGpi).mockReturnValue(gpi({ objectives: 60 }));
    await renderView();
    const card = screen.getByText(/Insight principal/).closest("div.border")!;
    expect(card.className).toContain("border-border-subtle");
    expect(card).toHaveTextContent("Objetivos · 60/100");
  });

  it("omits Top Insight and radar when GPI is unavailable", async () => {
    vi.mocked(computeGpi).mockReturnValue(null);
    await renderView();
    expect(screen.queryByText(/Insight principal/)).not.toBeInTheDocument();
    expect(document.querySelector("svg polygon")).toBeNull();
    expect(screen.getByText("CS bajo")).toBeInTheDocument();
  });
});

describe("CoachView — AI Coach", () => {
  const aiButton = () => screen.getByRole("button", { name: /Analizar con AI|Analizando/ });

  it("is hidden when the AI coach pref is off", async () => {
    await renderView();
    expect(screen.queryByText("AI Coach")).not.toBeInTheDocument();
  });

  it("disables the button and shows a hint without an API key", async () => {
    // A groq key is set but must not be used for gemini.
    setPrefs({ aiCoachEnabled: true, aiProvider: "gemini", geminiApiKey: "", groqApiKey: "gsk" });
    await renderView();
    expect(aiButton()).toBeDisabled();
    expect(
      screen.getByText("Pega tu API key (gemini) en Prefs. Groq es gratis.")
    ).toBeInTheDocument();
  });

  it("sends the match context to aiCoachAnalysis and renders the reply", async () => {
    setPrefs({
      aiCoachEnabled: true,
      aiProvider: "anthropic",
      anthropicApiKey: "sk-ant",
      aiCoachLanguage: "en",
    });
    vi.mocked(computeGpi).mockReturnValue(gpi({ laning: 30 }));
    await renderView();
    const d = deferred<string>();
    vi.mocked(aiCoachAnalysis).mockReturnValue(d.promise);

    await act(async () => {
      fireEvent.click(aiButton());
    });
    expect(aiButton()).toHaveTextContent("Analizando...");
    expect(aiButton()).toBeDisabled();

    const args = vi.mocked(aiCoachAnalysis).mock.calls[0][0];
    expect(args).toMatchObject({
      provider: "anthropic",
      apiKey: "sk-ant",
      match: matchFull(),
      timeline: TIMELINE,
      myPuuid: "me",
      insights: INSIGHTS,
      gpi: gpi({ laning: 30 }),
      championName: "Aatrox",
      opponentChampionName: "Lee Sin",
      rank: { tier: "GOLD", division: "II", lp: 42 },
      language: "en",
    });
    expect(args.championNamesById).toEqual(
      new Map([
        [266, "Aatrox"],
        [64, "Lee Sin"],
      ])
    );

    await act(async () => {
      d.resolve("Juega más seguro en el carril.");
    });
    expect(screen.getByText("Juega más seguro en el carril.")).toBeInTheDocument();
    expect(aiButton()).toHaveTextContent("Analizar con AI");
  });

  it("falls back to '#id' names, null opponent and null rank", async () => {
    setPrefs({ aiCoachEnabled: true, groqApiKey: "gsk" });
    vi.mocked(getMatchFull).mockResolvedValue(
      matchFull({
        participants: [
          participant({ puuid: "me", championId: 7777, teamId: 100, position: "MIDDLE" }),
          participant({ puuid: "opp", championId: 64, teamId: 200, position: "TOP" }),
        ],
      } as Partial<MatchFull>)
    );
    await renderView();
    vi.mocked(lcuRank).mockResolvedValue(null);
    await act(async () => {
      fireEvent.click(aiButton());
    });
    const args = vi.mocked(aiCoachAnalysis).mock.calls[0][0];
    expect(args.championName).toBe("#7777");
    expect(args.opponentChampionName).toBeNull();
    expect(args.rank).toBeNull();
  });

  it("uses '#id' for an opponent champion missing from the db", async () => {
    setPrefs({ aiCoachEnabled: true, groqApiKey: "gsk" });
    vi.mocked(getMatchFull).mockResolvedValue(
      matchFull({
        participants: [
          participant({ puuid: "me", championId: 266, teamId: 100, position: "TOP" }),
          participant({ puuid: "opp", championId: 8888, teamId: 200, position: "TOP" }),
        ],
      } as Partial<MatchFull>)
    );
    await renderView();
    await act(async () => {
      fireEvent.click(aiButton());
    });
    expect(vi.mocked(aiCoachAnalysis).mock.calls[0][0].opponentChampionName).toBe("#8888");
  });

  it("shows the AI error", async () => {
    setPrefs({ aiCoachEnabled: true, groqApiKey: "gsk" });
    vi.mocked(aiCoachAnalysis).mockRejectedValue(new Error("quota exceeded"));
    await renderView();
    await act(async () => {
      fireEvent.click(aiButton());
    });
    expect(screen.getByText("Error: quota exceeded")).toBeInTheDocument();
    expect(aiButton()).not.toBeDisabled();
  });

  it("does nothing when the player is not in the match", async () => {
    setPrefs({ aiCoachEnabled: true, groqApiKey: "gsk" });
    vi.mocked(getMatchFull).mockResolvedValue(
      matchFull({
        participants: [participant({ puuid: "someone-else", championId: 64 })],
      } as Partial<MatchFull>)
    );
    await renderView();
    await act(async () => {
      fireEvent.click(aiButton());
    });
    expect(aiCoachAnalysis).not.toHaveBeenCalled();
  });

  it("does nothing when settings lost the puuid before the AI run", async () => {
    setPrefs({ aiCoachEnabled: true, groqApiKey: "gsk" });
    await renderView();
    vi.mocked(loadSettings).mockResolvedValue(null);
    await act(async () => {
      fireEvent.click(aiButton());
    });
    expect(aiCoachAnalysis).not.toHaveBeenCalled();
  });

  it("clears the previous AI reply when switching match", async () => {
    setPrefs({ aiCoachEnabled: true, groqApiKey: "gsk" });
    await renderView();
    await act(async () => {
      fireEvent.click(aiButton());
    });
    expect(screen.getByText("Juega más seguro en el carril.")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTitle("#9999 · Flex · 25min"));
    });
    expect(screen.queryByText("Juega más seguro en el carril.")).not.toBeInTheDocument();
  });
});

describe("CoachView — closing", () => {
  it("closes on Escape and backdrop click, not on inner clicks", async () => {
    const { onClose } = await renderView();
    fireEvent.click(screen.getByText("Coach"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog", { name: "Coach" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("CoachView — non-Rift games", () => {
  it("ARAM game: no insights list or clean-game note, queue label kept", async () => {
    vi.mocked(getMatchFull).mockResolvedValue(
      matchFull({
        queueId: 450,
        participants: [
          participant({ puuid: "me", championId: 266, teamId: 100, position: "" }),
          participant({ puuid: "opp", championId: 64, teamId: 200, position: "" }),
        ],
      } as Partial<MatchFull>)
    );
    await renderView();
    expect(screen.queryByText("Sin observaciones — partida limpia.")).toBeNull();
    expect(screen.queryByText("CS bajo")).toBeNull();
    expect(screen.getByText(/30min ·\s*ARAM/)).toBeInTheDocument();
  });

  it("AI coach gets no lane opponent when positions are empty", async () => {
    setPrefs({ aiCoachEnabled: true, groqApiKey: "gsk" });
    vi.mocked(getMatchFull).mockResolvedValue(
      matchFull({
        participants: [
          participant({ puuid: "me", championId: 266, teamId: 100, position: "" }),
          participant({ puuid: "opp", championId: 64, teamId: 200, position: "" }),
        ],
      } as Partial<MatchFull>)
    );
    await renderView();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Analizar con AI|Analizando/ }));
    });
    expect(vi.mocked(aiCoachAnalysis).mock.calls[0][0].opponentChampionName).toBeNull();
  });
});
