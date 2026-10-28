// TrendsView contract:
//   - Loads the last 200 matches, filters by role/queue selects.
//   - Cross-game leak box (when analyzeLeaks has a report) supersedes the
//     single-threshold "weakest area" box; the leak is persisted to AI memory
//     and a "leak shifted" note is surfaced.
//   - Rank-relative benchmarks vs the player's bracket (dominant role when ALL).
//   - Progress (older vs newer half) with trend label + per-metric arrows.
//   - AI trends coach builds a summarized payload and renders text / errors.
//   - Spark charts for >=3 games, trend insights list or empty state.
//
// Engines run for real by default; leak/progress are wrapped so individual
// tests can pin a report to reach every render branch deterministically.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { TrendsView } from "./TrendsView";
import type { MatchRow } from "../services/matchRepo";
import type { ChampionDb } from "../types/champion";
import type { LeakReport, Leak } from "../engine/leakEngine";
import type { ProgressReport, ProgressMetric } from "../engine/progressEngine";
import { usePrefsStore, DEFAULT_PREFS } from "../state/prefsStore";

vi.mock("../services/matchRepo", () => ({ recentMatches: vi.fn() }));
vi.mock("../services/leakMemory", () => ({ recordLeak: vi.fn() }));
vi.mock("../services/aiCoach", () => ({ aiTrendsAnalysis: vi.fn() }));
vi.mock("../engine/leakEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/leakEngine")>();
  return { ...actual, analyzeLeaks: vi.fn() };
});
vi.mock("../engine/progressEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/progressEngine")>();
  return { ...actual, analyzeProgress: vi.fn() };
});

import { recentMatches } from "../services/matchRepo";
import { recordLeak } from "../services/leakMemory";
import { aiTrendsAnalysis } from "../services/aiCoach";
import { analyzeLeaks } from "../engine/leakEngine";
import { analyzeProgress } from "../engine/progressEngine";

const realLeak = await vi.importActual<typeof import("../engine/leakEngine")>(
  "../engine/leakEngine"
);
const realProgress = await vi.importActual<typeof import("../engine/progressEngine")>(
  "../engine/progressEngine"
);

const T0 = new Date("2026-06-15T12:00:00Z").getTime();
const HOUR = 3_600_000;

const db = {
  patch: "16.10.1",
  champions: {
    "266": { key: "266", id: "Aatrox", name: "Aatrox", iconUrl: "x", roles: [], tags: [] },
    "64": { key: "64", id: "LeeSin", name: "Lee Sin", iconUrl: "x", roles: [], tags: [] },
  },
  counters: [],
  meta: [],
  fetchedAt: 0,
} as unknown as ChampionDb;

let seq = 0;
function mk(over: Partial<MatchRow> = {}): MatchRow {
  seq++;
  return {
    matchId: `EUW1_${seq}`,
    championId: 266,
    queueId: 420,
    position: "TOP",
    win: true,
    // 30 min game: 6.5 cs/min, 0.30 deaths/min, KDA 1.33, 1.00 vision/min
    kills: 6,
    deaths: 9,
    assists: 6,
    cs: 195,
    durationSec: 1800,
    opponentChampionId: 0,
    gameEndTimestampMs: T0 - seq * HOUR,
    visionScore: 30,
    goldEarned: null,
    ...over,
  };
}

/** 6 identical-stat TOP games, newest 3 wins / older 3 losses. */
function sixTop(): MatchRow[] {
  return [
    mk({ win: true }),
    mk({ win: true }),
    mk({ win: true, championId: 9999 }),
    mk({ win: false }),
    mk({ win: false }),
    mk({ win: false }),
  ];
}

function setPrefs(over: Partial<typeof DEFAULT_PREFS>) {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, ...over } });
}

async function renderWith(
  matches: MatchRow[],
  props: { rankTier?: string | null; onClose?: () => void } = {}
) {
  vi.mocked(recentMatches).mockResolvedValue(matches);
  const onClose = props.onClose ?? vi.fn();
  const utils = render(<TrendsView db={db} onClose={onClose} rankTier={props.rankTier} />);
  await act(async () => {});
  return { ...utils, onClose };
}

function leak(over: Partial<Leak>): Leak {
  return {
    key: "deaths",
    label: "Muertes",
    labelKey: "trends.leakMetric.deaths",
    winAvg: 4,
    lossAvg: 8,
    delta: 4,
    effect: 1,
    severity: "bad",
    insight: "",
    advice: "",
    adviceKey: "trends.leakAdvice.deaths",
    lossFmt: "8.0",
    winFmt: "4.0",
    ...over,
  };
}

function leakReport(over: Partial<LeakReport> = {}): LeakReport {
  const leaks = [
    leak({ effect: 2 }),
    leak({
      key: "cspm",
      label: "Farm (CS/min)",
      labelKey: "trends.leakMetric.cspm",
      effect: 0.6,
      severity: "warn",
      adviceKey: "trends.leakAdvice.cspm",
      lossFmt: "5.1",
      winFmt: "6.4",
    }),
    leak({
      key: "vision",
      label: "Visión",
      labelKey: "trends.leakMetric.vision",
      effect: 0.35,
      severity: "info",
      adviceKey: "trends.leakAdvice.vision",
      lossFmt: "0.80",
      winFmt: "0.95",
    }),
  ];
  return {
    topLeak: leaks[0],
    leaks,
    games: 10,
    wins: 4,
    losses: 6,
    macro: false,
    headline: "Tu mayor diferencia entre ganar y perder: Muertes.",
    headlineKey: "trends.leakHeadlineMetric",
    wrPct: 40,
    ...over,
  };
}

function metric(over: Partial<ProgressMetric>): ProgressMetric {
  return {
    key: "winrate",
    label: "Winrate",
    older: 0.4,
    newer: 0.48,
    delta: 0.08,
    pctChange: 0.2,
    improving: true,
    direction: "up",
    display: "",
    ...over,
  };
}

function progressReport(over: Partial<ProgressReport> = {}): ProgressReport {
  const metrics = [
    metric({}),
    metric({ key: "deaths", label: "Muertes", pctChange: -0.153, improving: false, direction: "down" }),
    metric({ key: "cspm", label: "CS/min", pctChange: 0.01, direction: "flat" }),
  ];
  return {
    windowGames: 5,
    totalGames: 10,
    metrics,
    improved: [metrics[0]],
    regressed: [metrics[1]],
    trend: "improving",
    headline: "Vas en subida (últimas 5 vs 5 previas): mejora clara en Winrate.",
    ...over,
  };
}

beforeEach(() => {
  setPrefs({});
  vi.mocked(recentMatches).mockReset();
  vi.mocked(recordLeak).mockReset().mockResolvedValue(null);
  vi.mocked(aiTrendsAnalysis).mockReset();
  vi.mocked(analyzeLeaks).mockReset().mockImplementation(realLeak.analyzeLeaks);
  vi.mocked(analyzeProgress).mockReset().mockImplementation(realProgress.analyzeProgress);
});

describe("TrendsView — empty", () => {
  it("loads 200 matches and renders only the empty state with no data", async () => {
    await renderWith([]);
    expect(recentMatches).toHaveBeenCalledWith(200);
    expect(screen.getByText("Tendencias")).toBeInTheDocument();
    expect(screen.getByText("0 partidas")).toBeInTheDocument();
    expect(screen.getByText("Aún no hay tendencias")).toBeInTheDocument();
    expect(screen.queryByText(/vs tu rango/)).toBeNull();
    expect(screen.queryByText(/Evolución/)).toBeNull();
    expect(screen.queryByRole("img", { name: "Tendencia de winrate" })).toBeNull();
    expect(recordLeak).not.toHaveBeenCalled();
  });
});

describe("TrendsView — real engines on 6 games", () => {
  it("renders trend insights with severity styling", async () => {
    await renderWith(sixTop());
    expect(screen.getByText("6 partidas")).toBeInTheDocument();
    const wr = screen.getByText("Winrate ↑ 100% — mejorando");
    expect(wr).toHaveClass("text-good");
    expect(screen.getByText("KDA: 1.33 (antes 1.33)")).toHaveClass("text-white/80");
    expect(screen.getByText("CS/min: 6.5 (antes 6.5)")).toBeInTheDocument();
    expect(screen.queryByText("Aún no hay tendencias")).toBeNull();
  });

  it("dropping winrate renders as a warn insight", async () => {
    const ms = sixTop().map((m, i) => ({ ...m, win: i >= 3 }));
    await renderWith(ms);
    expect(screen.getByText("Winrate ↓ 0% — empeorando")).toHaveClass("text-meh");
  });

  it("falls back to the weakest-area box when there is no leak report", async () => {
    await renderWith(sixTop());
    expect(screen.queryByText(/Patrón cruzado/)).toBeNull();
    expect(screen.getByText("Tu mayor problema esta semana")).toBeInTheDocument();
    expect(screen.getByText("Muertes")).toBeInTheDocument();
    expect(screen.getByText("KDA medio de 1.33 — mueres demasiado.")).toBeInTheDocument();
  });

  it("benchmarks per-minute stats vs the default Gold–Plat bracket for the dominant role", async () => {
    await renderWith(sixTop());
    const header = screen.getByText(/vs tu rango · Gold–Plat · TOP/);
    expect(within(header).getByText("(estimado)")).toBeInTheDocument();
    const box = header.parentElement!;
    const row = (label: string) => within(box).getByText(label).parentElement!;

    expect(row("CS/min")).toHaveTextContent("6.5vs 6.5≈");
    expect(within(row("CS/min")).getByText("≈")).toHaveClass("text-white/40");
    expect(row("Visión/min")).toHaveTextContent("1.00vs 0.60↑");
    expect(within(row("Visión/min")).getByText("↑")).toHaveClass("text-good");
    expect(row("Muertes/min")).toHaveTextContent("0.30vs 0.27↓");
    expect(within(row("Muertes/min")).getByText("↓")).toHaveClass("text-bad");
    expect(row("KDA")).toHaveTextContent("1.33vs 2.20↓");
  });

  it("uses the player's rank bracket when rankTier is provided", async () => {
    await renderWith(sixTop(), { rankTier: "diamond" });
    const box = screen.getByText(/vs tu rango · Emerald–Diamond · TOP/).parentElement!;
    expect(within(box).getByText("CS/min").parentElement).toHaveTextContent("6.5vs 7.2↓");
  });

  it("omits vision benchmark when no match has a vision score", async () => {
    await renderWith(sixTop().map((m) => ({ ...m, visionScore: null })));
    const box = screen.getByText(/vs tu rango/).parentElement!;
    expect(within(box).queryByText("Visión/min")).toBeNull();
    expect(within(box).getByText("CS/min")).toBeInTheDocument();
  });

  it("vision/min only counts minutes from games that recorded vision", async () => {
    // 3 of 6 games have no vision score: 90 vision / 90 min = 1.00, not 0.50.
    await renderWith(sixTop().map((m, i) => (i % 2 === 0 ? m : { ...m, visionScore: null })));
    const box = screen.getByText(/vs tu rango/).parentElement!;
    expect(within(box).getByText("Visión/min").parentElement).toHaveTextContent("1.00vs 0.60↑");
  });

  it("picks the most-played lane as benchmark role when filtering ALL", async () => {
    // A minority lane comes first so "first lane seen" would pick TOP.
    const ms = [
      mk({ position: "TOP" }),
      ...Array.from({ length: 4 }, () => mk({ position: "JUNGLE", championId: 64 })),
      mk({ position: "" }),
    ];
    await renderWith(ms);
    expect(screen.getByText(/vs tu rango · Gold–Plat · JUNGLE/)).toBeInTheDocument();
  });

  it("no benchmarks without any lane position (e.g. ARAM)", async () => {
    await renderWith(sixTop().map((m) => ({ ...m, position: "", queueId: 450 })));
    expect(screen.queryByText(/vs tu rango/)).toBeNull();
  });

  it("no benchmarks under 5 games", async () => {
    await renderWith(sixTop().slice(0, 4));
    expect(screen.queryByText(/vs tu rango/)).toBeNull();
  });

  it("renders the three spark charts once there are >=3 games", async () => {
    await renderWith(sixTop());
    expect(screen.getByRole("img", { name: "Tendencia de winrate" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Tendencia de KDA" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Tendencia de CS por minuto" })).toBeInTheDocument();
  });

  it("no spark charts under 3 games", async () => {
    await renderWith(sixTop().slice(0, 2));
    expect(screen.queryByRole("img", { name: "Tendencia de winrate" })).toBeNull();
  });
});

describe("TrendsView — role + queue filters", () => {
  it("role select narrows the sample and labels the weakest box with the role", async () => {
    const ms = [
      ...sixTop(),
      // Low-CS jungle games -> "Farming" weakest area.
      ...Array.from({ length: 5 }, () => mk({ position: "JUNGLE", championId: 64, cs: 120, deaths: 2 })),
    ];
    await renderWith(ms);
    expect(screen.getByText("11 partidas")).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "JUNGLE" } });
    expect(screen.getByText("5 partidas")).toBeInTheDocument();
    expect(screen.getByText("Tu mayor problema en JUNGLE")).toBeInTheDocument();
    expect(screen.getByText("Farming")).toBeInTheDocument();
    expect(screen.getByText(/vs tu rango · Gold–Plat · JUNGLE/)).toBeInTheDocument();
  });

  it("queue select filters by numeric queue id and back to all", async () => {
    const ms = [...sixTop(), mk({ queueId: 440 }), mk({ queueId: 440 })];
    await renderWith(ms);
    const queue = screen.getAllByRole("combobox")[1];
    expect(within(queue).getAllByRole("option")[0]).toHaveTextContent("Todas las colas");
    fireEvent.change(queue, { target: { value: "440" } });
    expect(screen.getByText("2 partidas")).toBeInTheDocument();
    fireEvent.change(queue, { target: { value: "ALL" } });
    expect(screen.getByText("8 partidas")).toBeInTheDocument();
  });
});

describe("TrendsView — leak box", () => {
  it("renders the metric leak headline, advice and ranked insights with severity bars", async () => {
    const report = leakReport();
    vi.mocked(analyzeLeaks).mockReturnValue(report);
    await renderWith(sixTop());

    expect(screen.getByText("Patrón cruzado · victorias vs derrotas")).toBeInTheDocument();
    expect(
      screen.getByText("Tu mayor diferencia entre ganar y perder: Muertes. (40% WR en 10)")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Antes de cada pelea evalúa si la trade vale. Revisa el minimapa tras cada recall."
      )
    ).toBeInTheDocument();

    const insight = (text: string) => screen.getByText(text).closest("div")!.parentElement!;
    const deaths = insight("Muertes: derrotas 8.0 vs victorias 4.0");
    expect(deaths).toHaveTextContent("d2.00");
    // effect*60 capped at 100%
    const deathsBar = deaths.querySelector(".h-full") as HTMLElement;
    expect(deathsBar).toHaveClass("bg-bad/70");
    expect(deathsBar.style.width).toBe("100%");

    const cs = insight("Farm (CS/min): derrotas 5.1 vs victorias 6.4");
    expect(cs.querySelector(".h-full")).toHaveClass("bg-meh/70");
    expect((cs.querySelector(".h-full") as HTMLElement).style.width).toBe("36%");

    const vis = insight("Visión (score/min): derrotas 0.80 vs victorias 0.95");
    expect(vis.querySelector(".h-full")).toHaveClass("bg-white/30");

    // Leak supersedes the weakest-area box.
    expect(screen.queryByText(/Tu mayor problema/)).toBeNull();
    expect(recordLeak).toHaveBeenCalledWith(report);
  });

  it("surfaces the leak-shift note returned by leak memory", async () => {
    vi.mocked(analyzeLeaks).mockReturnValue(leakReport());
    vi.mocked(recordLeak).mockResolvedValue("Tu fuga principal cambió: kda → deaths.");
    await renderWith(sixTop());
    expect(screen.getByText("📈 Tu fuga principal cambió: kda → deaths.")).toHaveClass("text-good");
  });

  it("macro leak shows the macro headline and no mechanical advice", async () => {
    vi.mocked(analyzeLeaks).mockReturnValue(
      leakReport({ macro: true, headlineKey: "trends.leakHeadlineMacro", wrPct: 50, games: 12 })
    );
    await renderWith(sixTop());
    expect(
      screen.getByText(
        "Tus stats mecánicas no distinguen tus victorias de tus derrotas — el leak está en macro/draft, no en mecánica. (50% WR en 12)"
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Antes de cada pelea/)).toBeNull();
  });

  it("real leak engine: deaths-driven losses produce a metric headline", async () => {
    const ms = [
      ...[2, 3, 2, 3, 2, 3].map((d) => mk({ win: true, deaths: d })),
      ...[8, 9, 8, 9, 8, 9].map((d) => mk({ win: false, deaths: d })),
    ];
    await renderWith(ms);
    expect(screen.getByText(/^Tu mayor diferencia entre ganar y perder: /)).toBeInTheDocument();
    expect(screen.getByText(/^Muertes: derrotas 8\.5 vs victorias 2\.5$/)).toBeInTheDocument();
    expect(recordLeak).toHaveBeenCalledTimes(1);
  });
});

describe("TrendsView — progress box", () => {
  it("renders trend label, headline and per-metric arrows with signed % change", async () => {
    vi.mocked(analyzeProgress).mockReturnValue(progressReport());
    await renderWith(sixTop());

    const label = screen.getByText("en subida");
    expect(label).toHaveClass("text-good");
    expect(label.parentElement).toHaveTextContent("Evolución · en subida");
    expect(
      screen.getByText("Vas en subida (últimas 5 vs 5 previas): mejora clara en Winrate.")
    ).toBeInTheDocument();

    const grid = label.parentElement!.parentElement!;
    const value = (name: string) => within(grid).getByText(name).nextElementSibling!;
    expect(value("Winrate")).toHaveTextContent("↑ +20%");
    expect(value("Winrate")).toHaveClass("text-good");
    expect(value("Muertes")).toHaveTextContent("↓ -15%");
    expect(value("Muertes")).toHaveClass("text-bad");
    expect(value("CS/min")).toHaveTextContent("≈ +1%");
    expect(value("CS/min")).toHaveClass("text-white/40");
  });

  it.each([
    ["declining", "bajón", "text-bad"],
    ["mixed", "mixto", "text-white/60"],
    ["stable", "estable", "text-white/60"],
  ] as const)("trend %s renders as '%s'", async (trend, text, cls) => {
    vi.mocked(analyzeProgress).mockReturnValue(progressReport({ trend }));
    await renderWith(sixTop());
    expect(screen.getByText(text)).toHaveClass(cls);
  });

  it("real progress engine renders the evolution box with >=10 games", async () => {
    const ms = Array.from({ length: 10 }, (_, i) => mk({ win: i < 5, kills: i < 5 ? 10 : 2 }));
    await renderWith(ms);
    expect(screen.getByText(/^Evolución/)).toBeInTheDocument();
    expect(screen.getByText("en subida")).toBeInTheDocument();
  });
});

describe("TrendsView — AI coach", () => {
  it("is hidden when the AI coach is disabled", async () => {
    await renderWith(sixTop());
    expect(screen.queryByText("AI Coach (tendencias)")).toBeNull();
  });

  it("is hidden under 5 games even when enabled", async () => {
    setPrefs({ aiCoachEnabled: true, groqApiKey: "test-key" });
    await renderWith(sixTop().slice(0, 4));
    expect(screen.queryByText("AI Coach (tendencias)")).toBeNull();
  });

  it("button is disabled without an API key for the active provider", async () => {
    setPrefs({ aiCoachEnabled: true, aiProvider: "anthropic", groqApiKey: "unused" });
    await renderWith(sixTop());
    expect(screen.getByRole("button", { name: "Analizar últimas 6" })).toBeDisabled();
  });

  it("sends a summarized payload (champions, KDA, CS/min, benchmarks, playstyle) and renders the reply", async () => {
    setPrefs({ aiCoachEnabled: true, aiProvider: "groq", groqApiKey: "test-key", aiCoachLanguage: "en" });
    vi.mocked(aiTrendsAnalysis).mockResolvedValue("Juega más seguro en early.");
    await renderWith(sixTop());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Analizar últimas 6" }));
    });

    expect(screen.getByText("Juega más seguro en early.")).toBeInTheDocument();
    const input = vi.mocked(aiTrendsAnalysis).mock.calls[0][0];
    expect(input.provider).toBe("groq");
    expect(input.apiKey).toBe("test-key");
    expect(input.language).toBe("en");
    expect(input.matches).toHaveLength(6);
    expect(input.matches[0]).toEqual({
      championName: "Aatrox",
      position: "TOP",
      win: true,
      kda: "6/9/6",
      cspm: 6.5,
      durationMin: 30,
      queueId: 420,
    });
    expect(input.matches[2].championName).toBe("#9999");
    expect(input.benchmarkSummary).toBe(
      "Rango Gold–Plat (TOP): CS/min 6.5 vs 6.5 (at); Visión/min 1.00 vs 0.60 (above); Muertes/min 0.30 vs 0.27 (below); KDA 1.33 vs 2.20 (below)."
    );
    expect(input.playstyleSummary).toMatch(/^Arquetipo: .+KDA 1\.33, CS\/min 6\.5, muertes\/min 0\.30\.$/);
    // Too few games for leak (8) or progress (10) analysis.
    expect(input.leakSummary).toBeUndefined();
    expect(input.progressSummary).toBeUndefined();
  });

  it("includes leak + progress summaries and caps the payload at 15 games", async () => {
    setPrefs({ aiCoachEnabled: true, aiProvider: "gemini", geminiApiKey: "gem-key" });
    vi.mocked(analyzeLeaks).mockReturnValue(leakReport());
    vi.mocked(analyzeProgress).mockReturnValue(progressReport());
    vi.mocked(aiTrendsAnalysis).mockResolvedValue("ok");
    await renderWith(Array.from({ length: 20 }, () => mk()));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Analizar últimas 15" }));
    });

    const input = vi.mocked(aiTrendsAnalysis).mock.calls[0][0];
    expect(input.provider).toBe("gemini");
    expect(input.apiKey).toBe("gem-key");
    expect(input.matches).toHaveLength(15);
    expect(input.leakSummary).toContain("Leak principal: Muertes");
    expect(input.progressSummary).toContain("Tendencia general: improving.");
  });

  it("shows a loading label while the request is pending", async () => {
    setPrefs({ aiCoachEnabled: true, aiProvider: "anthropic", anthropicApiKey: "sk-test" });
    let resolve!: (s: string) => void;
    vi.mocked(aiTrendsAnalysis).mockReturnValue(new Promise((r) => (resolve = r)));
    await renderWith(sixTop());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Analizar últimas 6" }));
    });
    expect(screen.getByRole("button", { name: "Analizando..." })).toBeDisabled();
    expect(vi.mocked(aiTrendsAnalysis).mock.calls[0][0].apiKey).toBe("sk-test");

    await act(async () => {
      resolve("listo");
    });
    expect(screen.getByRole("button", { name: "Analizar últimas 6" })).toBeEnabled();
    expect(screen.getByText("listo")).toBeInTheDocument();
  });

  it("renders the error and re-enables the button when the request fails", async () => {
    setPrefs({ aiCoachEnabled: true, groqApiKey: "test-key" });
    vi.mocked(aiTrendsAnalysis).mockRejectedValue(new Error("rate limited"));
    await renderWith(sixTop());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Analizar últimas 6" }));
    });
    expect(screen.getByText("Error: rate limited")).toHaveClass("text-bad");
    expect(screen.getByRole("button", { name: "Analizar últimas 6" })).toBeEnabled();

    // A successful retry clears the previous error.
    vi.mocked(aiTrendsAnalysis).mockResolvedValueOnce("segundo intento ok");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Analizar últimas 6" }));
    });
    expect(screen.queryByText("Error: rate limited")).toBeNull();
    expect(screen.getByText("segundo intento ok")).toBeInTheDocument();
  });
});

describe("TrendsView — closing", () => {
  it("closes on Escape and backdrop click, not on clicks inside", async () => {
    const { onClose, container } = await renderWith([]);
    fireEvent.click(screen.getByText("Tendencias"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
