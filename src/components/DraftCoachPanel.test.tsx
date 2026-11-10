// DraftCoachPanel contract:
//   - Renders nothing until my champion (known to the DB) and role exist.
//   - Non-Groq providers need an API key; without one the button shows a
//     config error and never calls the AI. Groq goes through the proxy.
//   - The AI payload carries names (not keys), the lane matchup from
//     liveCounters, top-3 suggestions with translated reasons, scouted enemy
//     mains, bans, my mastery, missing comp archetypes and the coach language.
//   - Loading state disables the button; failures render the error.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { usePrefsStore, DEFAULT_PREFS, type Preferences } from "../state/prefsStore";
import type { ChampionDb } from "../types/champion";
import type { ScoredSuggestion } from "../engine/suggestionEngine";
import type { EnemyMain } from "../engine/banEngine";
import type { ChampionMasteryDto } from "../services/riotApi";

vi.mock("../services/draftCoach", async (orig) => ({
  ...(await orig<typeof import("../services/draftCoach")>()),
  explainDraft: vi.fn(),
}));

let enemyMains: EnemyMain[] = [];
const useEnemyMainsSpy = vi.fn();
vi.mock("../hooks/useEnemyMains", () => ({
  useEnemyMains: (ids: number[]) => {
    useEnemyMainsSpy(ids);
    return enemyMains;
  },
}));

import { DraftCoachPanel } from "./DraftCoachPanel";
import { explainDraft } from "../services/draftCoach";

function champ(key: string, name: string, archetypes: string[] = []) {
  return { key, id: name, name, title: "", iconUrl: "", splashUrl: "", tags: [], roles: [], archetypes };
}

const db = {
  patch: "16.1.1",
  champions: {
    "266": champ("266", "Aatrox"),
    "64": champ("64", "Lee Sin", ["engage"]),
    "122": champ("122", "Darius"),
    "222": champ("222", "Jinx"),
    "103": champ("103", "Ahri"),
  },
  counters: [],
  meta: [],
  fetchedAt: 0,
} as unknown as ChampionDb;

function sug(name: string, reasons: string[]): ScoredSuggestion {
  return { champion: { name }, reasons } as unknown as ScoredSuggestion;
}

function setPrefs(over: Partial<Preferences> = {}) {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, ...over } });
}

type PanelProps = Parameters<typeof DraftCoachPanel>[0];

function renderPanel(over: Partial<PanelProps> = {}) {
  return render(
    <DraftCoachPanel
      db={db}
      myChampionKey="266"
      role="TOP"
      allyKeys={[]}
      enemyKeys={[]}
      liveCounters={[]}
      suggestions={[]}
      {...over}
    />
  );
}

const button = () => screen.getByRole("button");

beforeEach(() => {
  vi.mocked(explainDraft).mockReset();
  useEnemyMainsSpy.mockClear();
  enemyMains = [];
  setPrefs();
});

describe("DraftCoachPanel — visibility", () => {
  it("renders nothing without my champion", () => {
    const { container } = renderPanel({ myChampionKey: null });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing without a role", () => {
    const { container } = renderPanel({ role: null });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when my champion is not in the DB", () => {
    const { container } = renderPanel({ myChampionKey: "9999" });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the explain button with its tooltip", () => {
    renderPanel();
    expect(button()).toHaveAttribute("title", "La IA explica tu pick + el matchup + cómo jugarlo");
    expect(button()).toBeEnabled();
  });

  it("forwards the enemy summoner ids to the mains scout", () => {
    renderPanel({ enemySummonerIds: [11, 12] });
    expect(useEnemyMainsSpy).toHaveBeenCalledWith([11, 12]);
  });
});

describe("DraftCoachPanel — API key gate", () => {
  it.each([
    ["anthropic", { anthropicApiKey: "" }],
    ["gemini", { geminiApiKey: "   " }],
  ] as const)("asks to configure the %s key and skips the AI call", (provider, keys) => {
    setPrefs({ aiProvider: provider, ...keys });
    renderPanel();
    fireEvent.click(button());
    expect(screen.getByText(/⚠/)).toBeInTheDocument();
    expect(explainDraft).not.toHaveBeenCalled();
  });

  it.each([
    ["anthropic", { anthropicApiKey: "sk-ant", geminiApiKey: "gm", groqApiKey: "gq" }, "sk-ant"],
    ["gemini", { anthropicApiKey: "sk-ant", geminiApiKey: "gm", groqApiKey: "gq" }, "gm"],
    ["groq", { anthropicApiKey: "sk-ant", geminiApiKey: "gm", groqApiKey: "gq" }, "gq"],
  ] as const)("passes the %s provider with its own key", async (provider, keys, expected) => {
    setPrefs({ aiProvider: provider, ...keys });
    vi.mocked(explainDraft).mockResolvedValue("ok");
    renderPanel();
    await act(async () => {
      fireEvent.click(button());
    });
    expect(explainDraft).toHaveBeenCalledWith(provider, expected, expect.any(Object));
  });

  it("lets Groq run without a key (shared proxy)", async () => {
    setPrefs({ aiProvider: "groq", groqApiKey: "" });
    vi.mocked(explainDraft).mockResolvedValue("ok");
    renderPanel();
    await act(async () => {
      fireEvent.click(button());
    });
    expect(explainDraft).toHaveBeenCalledWith("groq", "", expect.any(Object));
  });
});

describe("DraftCoachPanel — payload", () => {
  it("builds the full draft context for the AI", async () => {
    enemyMains = [
      { championId: 222, points: 300_000, summonerName: "Foo" },
      { championId: 999, points: 100_000 },
    ];
    const masteries = [
      { championId: 64, championLevel: 3, championPoints: 1 },
      { championId: 266, championLevel: 7, championPoints: 250_000 },
    ] as unknown as ChampionMasteryDto[];
    vi.mocked(explainDraft).mockResolvedValue("Juega agresivo nivel 2.");
    renderPanel({
      allyKeys: ["64", "777"],
      enemyKeys: ["122", "103"],
      liveCounters: [
        { championKey: "64", vsChampionKey: "103", role: "JUNGLE", winRate: 0.4, sampleSize: 10 },
        { championKey: "266", vsChampionKey: "122", role: "TOP", winRate: 0.47, sampleSize: 900 },
      ],
      suggestions: [
        sug("Aatrox", ["suggestions.reason.main", "WR 54%"]),
        sug("Darius", ["suggestions.reason.counters"]),
        sug("Jinx", []),
        sug("Ahri", ["suggestions.reason.synergy"]),
      ],
      bannedKeys: ["222", "555"],
      masteries,
    });

    await act(async () => {
      fireEvent.click(button());
    });

    expect(explainDraft).toHaveBeenCalledTimes(1);
    expect(vi.mocked(explainDraft).mock.calls[0][2]).toEqual({
      myChampion: "Aatrox",
      role: "TOP",
      allies: ["Lee Sin", "777"],
      enemies: ["Darius", "Ahri"],
      laneOpponent: "Darius",
      laneMatchupWinRate: 0.47,
      topSuggestions: [
        { name: "Aatrox", reasons: ["tu main", "WR 54%"] },
        { name: "Darius", reasons: ["contrarresta a enemigos"] },
        { name: "Jinx", reasons: [] },
      ],
      enemyMains: [
        { championName: "Jinx", summonerName: "Foo" },
        { championName: "#999", summonerName: undefined },
      ],
      bans: ["Jinx", "555"],
      myMastery: { level: 7, points: 250_000 },
      // Lee Sin brings engage; frontline + peel are still missing.
      compMissing: ["frontline", "peel"],
      language: "es",
    });
    expect(screen.getByText("Juega agresivo nivel 2.")).toBeInTheDocument();
  });

  it("sends nulls for an unknown lane matchup and mastery, and the English language", async () => {
    setPrefs({ aiCoachLanguage: "en" });
    vi.mocked(explainDraft).mockResolvedValue("ok");
    renderPanel({
      liveCounters: [
        { championKey: "64", vsChampionKey: "103", role: "JUNGLE", winRate: 0.4, sampleSize: 10 },
      ],
    });
    await act(async () => {
      fireEvent.click(button());
    });
    // First English request lazy-loads the en bundle before calling the AI.
    await vi.waitFor(() => expect(explainDraft).toHaveBeenCalledTimes(1));
    const input = vi.mocked(explainDraft).mock.calls[0][2];
    expect(input.laneOpponent).toBeNull();
    expect(input.laneMatchupWinRate).toBeNull();
    expect(input.myMastery).toBeNull();
    expect(input.compMissing).toEqual(["engage", "frontline", "peel"]);
    expect(input.language).toBe("en");
  });

  // Regression: locale bundles load lazily for the UI locale only, so with a
  // Spanish UI and an English coach the reasons used to fall back to Spanish
  // ("tu main"). The test env mirrors that (only es preloaded).
  it("translates suggestion reasons into the coach language (English)", async () => {
    setPrefs({ aiCoachLanguage: "en" });
    vi.mocked(explainDraft).mockResolvedValue("ok");
    renderPanel({
      suggestions: [sug("Aatrox", ["suggestions.reason.main", "suggestions.reason.counters"])],
    });
    await act(async () => {
      fireEvent.click(button());
    });
    await vi.waitFor(() => expect(explainDraft).toHaveBeenCalledTimes(1));
    expect(vi.mocked(explainDraft).mock.calls[0][2].topSuggestions).toEqual([
      { name: "Aatrox", reasons: ["your main", "counters enemies"] },
    ]);
  });
});

describe("DraftCoachPanel — request lifecycle", () => {
  it("disables the button while thinking, then shows the advice", async () => {
    let resolve!: (v: string) => void;
    vi.mocked(explainDraft).mockReturnValue(new Promise<string>((r) => (resolve = r)));
    renderPanel();

    const idle = button().textContent;
    fireEvent.click(button());
    expect(button().textContent).not.toBe(idle);
    expect(button()).toBeDisabled();

    await act(async () => {
      resolve("Consejo listo");
    });
    expect(button().textContent).toBe(idle);
    expect(button()).toBeEnabled();
    expect(screen.getByText("Consejo listo")).toBeInTheDocument();
  });

  it("shows the error when the AI call fails and clears the old advice", async () => {
    vi.mocked(explainDraft).mockResolvedValueOnce("Primer consejo");
    renderPanel();
    await act(async () => {
      fireEvent.click(button());
    });
    expect(screen.getByText("Primer consejo")).toBeInTheDocument();

    vi.mocked(explainDraft).mockRejectedValueOnce(new Error("rate limited"));
    await act(async () => {
      fireEvent.click(button());
    });
    expect(screen.getByText("⚠ Error: rate limited")).toBeInTheDocument();
    expect(screen.queryByText("Primer consejo")).toBeNull();
    expect(button()).toBeEnabled();
  });

  it("clears a previous key error on a successful retry", async () => {
    setPrefs({ aiProvider: "anthropic", anthropicApiKey: "" });
    vi.mocked(explainDraft).mockResolvedValue("ok ahora");
    renderPanel();
    fireEvent.click(button());
    expect(screen.getByText(/⚠/)).toBeInTheDocument();

    act(() => setPrefs({ aiProvider: "anthropic", anthropicApiKey: "sk-ant" }));
    await act(async () => {
      fireEvent.click(button());
    });
    expect(screen.queryByText(/⚠/)).toBeNull();
    expect(screen.getByText("ok ahora")).toBeInTheDocument();
  });
});

describe("DraftCoachPanel — i18n", () => {
  // Regression: the button and the key error were hardcoded Spanish.
  it("takes the button label and the key error from the UI locale", async () => {
    const { i18n } = await import("../i18n");
    i18n.addResourceBundle(
      "zz",
      "translation",
      { draftCoach: { button: "BTN", thinking: "BUSY", needKey: "KEY {{provider}}" } },
      true,
      true
    );
    await act(async () => {
      await i18n.changeLanguage("zz");
    });
    try {
      setPrefs({ aiProvider: "gemini", geminiApiKey: "" });
      renderPanel();
      expect(button()).toHaveTextContent("BTN");
      fireEvent.click(button());
      expect(screen.getByText("⚠ KEY gemini")).toBeInTheDocument();

      act(() => setPrefs({ aiProvider: "groq" }));
      vi.mocked(explainDraft).mockReturnValue(new Promise<string>(() => {}));
      await act(async () => {
        fireEvent.click(button());
      });
      expect(button()).toHaveTextContent("BUSY");
    } finally {
      await act(async () => {
        await i18n.changeLanguage("es");
      });
    }
  });
});

describe("DraftCoachPanel — lane opponent", () => {
  // Regression: every enemy is queried in MY role and entries arrive in
  // network order, so "first entry for my champion" named an off-lane enemy.
  it("picks the enemy whose primary role is mine, not the first entry", async () => {
    vi.mocked(explainDraft).mockResolvedValue("ok");
    renderPanel({
      myChampionKey: "103", // Ahri
      role: "MIDDLE",
      enemyKeys: ["122", "222", "777"],
      liveCounters: [
        // Darius (TOP) answered first with a bigger sample.
        { championKey: "103", vsChampionKey: "122", role: "MIDDLE", winRate: 0.6, sampleSize: 5000 },
        { championKey: "103", vsChampionKey: "222", role: "MIDDLE", winRate: 0.55, sampleSize: 40 },
        { championKey: "103", vsChampionKey: "777", role: "MIDDLE", winRate: 0.5, sampleSize: 9 },
      ],
      db: {
        ...db,
        champions: { ...db.champions, "777": champ("777", "Syndra") },
      } as unknown as ChampionDb,
    });
    await act(async () => {
      fireEvent.click(button());
    });
    const input = vi.mocked(explainDraft).mock.calls[0][2];
    expect(input.laneOpponent).toBe("Syndra");
    expect(input.laneMatchupWinRate).toBe(0.5);
  });

  it("falls back to the largest sample when nobody mains my role", async () => {
    vi.mocked(explainDraft).mockResolvedValue("ok");
    renderPanel({
      myChampionKey: "103",
      role: "MIDDLE",
      liveCounters: [
        { championKey: "103", vsChampionKey: "222", role: "MIDDLE", winRate: 0.55, sampleSize: 40 },
        { championKey: "103", vsChampionKey: "122", role: "MIDDLE", winRate: 0.6, sampleSize: 5000 },
      ],
    });
    await act(async () => {
      fireEvent.click(button());
    });
    expect(vi.mocked(explainDraft).mock.calls[0][2].laneOpponent).toBe("Darius");
  });
});

describe("DraftCoachPanel — champion switch", () => {
  const props = (over: Partial<PanelProps>): PanelProps => ({
    db,
    myChampionKey: "266",
    role: "TOP",
    allyKeys: [],
    enemyKeys: [],
    liveCounters: [],
    suggestions: [],
    ...over,
  });

  // Regression: the panel stays mounted when the hover changes, so the old
  // champion's advice stayed on screen under the new one.
  it("hides the previous champion's advice", async () => {
    vi.mocked(explainDraft).mockResolvedValue("Consejo Aatrox");
    const { rerender } = render(<DraftCoachPanel {...props({})} />);
    await act(async () => {
      fireEvent.click(button());
    });
    expect(screen.getByText("Consejo Aatrox")).toBeInTheDocument();

    rerender(<DraftCoachPanel {...props({ myChampionKey: "103" })} />);
    expect(screen.queryByText("Consejo Aatrox")).toBeNull();
    expect(button()).toBeEnabled();
  });

  it("ignores a late reply for the previous champion", async () => {
    const resolvers: Array<(v: string) => void> = [];
    vi.mocked(explainDraft).mockImplementation(
      () => new Promise<string>((r) => resolvers.push(r))
    );
    const { rerender } = render(<DraftCoachPanel {...props({})} />);
    await act(async () => {
      fireEvent.click(button());
    });
    rerender(<DraftCoachPanel {...props({ myChampionKey: "103" })} />);
    expect(button()).toBeEnabled();
    await act(async () => {
      fireEvent.click(button());
    });
    expect(resolvers).toHaveLength(2);

    await act(async () => {
      resolvers[0]("Consejo Aatrox");
    });
    expect(screen.queryByText("Consejo Aatrox")).toBeNull();
    expect(button()).toBeDisabled(); // Ahri's request is still running

    await act(async () => {
      resolvers[1]("Consejo Ahri");
    });
    expect(screen.getByText("Consejo Ahri")).toBeInTheDocument();
  });
});
