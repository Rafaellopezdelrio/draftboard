// LessonPlanView contract:
//   - "Generar nuevo" tab: intro + generate button (disabled without an API
//     key for the selected provider). Generating loads 50 matches, needs >=5,
//     builds profile/weakest area, calls aiLessonPlan with a 10-game summary,
//     persists the plan (save failures swallowed) and shows the text.
//   - "Anteriores" tab: recentLessonPlans(20) list, refreshed after a new
//     plan; uncompleted plans can be marked completed.
//   - Escape / backdrop click close.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { LessonPlanView } from "./LessonPlanView";
import type { ChampionDb } from "../types/champion";
import type { MatchRow } from "../services/matchRepo";
import type { LessonPlan } from "../services/lessonPlanRepo";
import type { PlaystyleProfile } from "../engine/playstyleEngine";
import { usePrefsStore, DEFAULT_PREFS } from "../state/prefsStore";

vi.mock("../services/lessonPlanRepo", () => ({
  recentLessonPlans: vi.fn(),
  saveLessonPlan: vi.fn(),
  markLessonPlanCompleted: vi.fn(),
}));
vi.mock("../services/aiCoach", () => ({ aiLessonPlan: vi.fn() }));
vi.mock("../services/matchRepo", () => ({ recentMatches: vi.fn() }));
vi.mock("../engine/playstyleEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/playstyleEngine")>();
  return { ...actual, buildPlaystyleProfile: vi.fn() };
});
vi.mock("../engine/trendsEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engine/trendsEngine")>();
  return { ...actual, detectWeakestArea: vi.fn() };
});

import {
  recentLessonPlans,
  saveLessonPlan,
  markLessonPlanCompleted,
} from "../services/lessonPlanRepo";
import { aiLessonPlan } from "../services/aiCoach";
import { recentMatches } from "../services/matchRepo";
import { buildPlaystyleProfile } from "../engine/playstyleEngine";
import { detectWeakestArea } from "../engine/trendsEngine";

const db = {
  patch: "16.10.1",
  champions: {
    "266": { key: "266", id: "Aatrox", name: "Aatrox", iconUrl: "x", roles: [], tags: [] },
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
    kills: 5,
    deaths: 2,
    assists: 7,
    cs: 200,
    durationSec: 1800,
    opponentChampionId: 0,
    gameEndTimestampMs: 1_700_000_000_000 - seq * 3_600_000,
    visionScore: 20,
    goldEarned: null,
    ...over,
  } as MatchRow;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setPrefs(over: Partial<typeof DEFAULT_PREFS>) {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, ...over } });
}

async function setup() {
  const onClose = vi.fn();
  const utils = render(<LessonPlanView db={db} onClose={onClose} />);
  // Flush the initial recentLessonPlans effect.
  await act(async () => {});
  return { onClose, ...utils };
}

const generateBtn = () => screen.getByRole("button", { name: /Generar mi plan/ });
const historyTab = () => screen.getByRole("tab", { name: /Anteriores/ });

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  setPrefs({ aiProvider: "groq", groqApiKey: "gsk_test", aiCoachLanguage: "es" });
  vi.mocked(recentLessonPlans).mockResolvedValue([]);
  vi.mocked(saveLessonPlan).mockResolvedValue(1);
  vi.mocked(markLessonPlanCompleted).mockResolvedValue(undefined as never);
  vi.mocked(buildPlaystyleProfile).mockReturnValue({
    archetype: "aggressive",
  } as PlaystyleProfile);
  vi.mocked(detectWeakestArea).mockReturnValue({
    category: "Farming",
    detail: "CS bajo",
  });
});

describe("LessonPlanView — intro & API key gating", () => {
  it("renders the title, intro bullets and loads the last 20 plans", async () => {
    await setup();
    expect(screen.getByRole("dialog", { name: "Plan de mejora 7 días" })).toBeInTheDocument();
    expect(screen.getByText("Tus últimas 50 partidas")).toBeInTheDocument();
    expect(screen.getByText("Tu mayor problema actual detectado")).toBeInTheDocument();
    expect(recentLessonPlans).toHaveBeenCalledWith(20);
    expect(generateBtn()).toBeEnabled();
    expect(screen.queryByText(/Necesitas API key/)).not.toBeInTheDocument();
  });

  it("disables generation and names the provider when its key is missing", async () => {
    // A groq key does not count when the selected provider is anthropic.
    setPrefs({ aiProvider: "anthropic", groqApiKey: "gsk_test", anthropicApiKey: "" });
    await setup();
    expect(generateBtn()).toBeDisabled();
    expect(
      screen.getByText("Necesitas API key (anthropic) en Prefs. Groq es gratis.")
    ).toBeInTheDocument();
  });

  it("uses the gemini key when gemini is the provider", async () => {
    setPrefs({ aiProvider: "gemini", groqApiKey: "", geminiApiKey: "gem_test" });
    await setup();
    expect(generateBtn()).toBeEnabled();
  });

  it("uses the anthropic key when anthropic is the provider", async () => {
    setPrefs({ aiProvider: "anthropic", groqApiKey: "", anthropicApiKey: "sk-ant-test" });
    await setup();
    expect(generateBtn()).toBeEnabled();
  });
});

describe("LessonPlanView — generation", () => {
  it("shows a skeleton, calls the AI with a 10-game summary, saves and shows the plan", async () => {
    setPrefs({ aiProvider: "gemini", geminiApiKey: "gem_test", aiCoachLanguage: "en" });
    const matches = [
      mk({ championId: 9999, win: false, kills: 1, deaths: 8, assists: 2, position: "MIDDLE" }),
      ...Array.from({ length: 11 }, () => mk()),
    ];
    vi.mocked(recentMatches).mockResolvedValue(matches);
    const ai = deferred<string>();
    vi.mocked(aiLessonPlan).mockReturnValue(ai.promise);
    const saved: LessonPlan = {
      id: 7,
      createdTsMs: 1_700_000_000_000,
      weakestArea: "CS bajo",
      archetype: "Agresivo",
      planText: "Día 1: farmear",
      completed: false,
    };
    const { container } = await setup();

    await act(async () => {
      fireEvent.click(generateBtn());
    });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Generar mi plan/ })).not.toBeInTheDocument();

    expect(recentMatches).toHaveBeenCalledWith(50);
    expect(buildPlaystyleProfile).toHaveBeenCalledWith(matches);
    expect(detectWeakestArea).toHaveBeenCalledWith(matches);
    const input = vi.mocked(aiLessonPlan).mock.calls[0][0];
    expect(input).toMatchObject({
      provider: "gemini",
      apiKey: "gem_test",
      weakestArea: "CS bajo",
      archetype: "Agresivo",
      language: "en",
    });
    expect(input.recentMatches).toHaveLength(10);
    // Unknown champion falls back to "#id".
    expect(input.recentMatches[0]).toEqual({
      championName: "#9999",
      position: "MIDDLE",
      win: false,
      kda: "1/8/2",
    });
    expect(input.recentMatches[1]).toEqual({
      championName: "Aatrox",
      position: "TOP",
      win: true,
      kda: "5/2/7",
    });

    vi.mocked(recentLessonPlans).mockResolvedValue([saved]);
    await act(async () => {
      ai.resolve("Día 1: farmear");
    });

    expect(saveLessonPlan).toHaveBeenCalledWith({
      createdTsMs: expect.any(Number),
      weakestArea: "CS bajo",
      archetype: "Agresivo",
      planText: "Día 1: farmear",
      completed: false,
    });
    expect(screen.getByText("Día 1: farmear")).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    // History refreshed after the new text: the tab count reflects the saved plan.
    expect(recentLessonPlans).toHaveBeenCalledTimes(2);
    // The plan is persisted before the refresh, so history includes it.
    expect(vi.mocked(saveLessonPlan).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(recentLessonPlans).mock.invocationCallOrder[1]
    );
    await act(async () => {});
    expect(historyTab()).toHaveTextContent("1");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ver planes guardados →" }));
    });
    expect(historyTab()).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Día 1: farmear")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "marcar completado" })).toBeInTheDocument();
  });

  it("falls back to 'Balanceado' and a null weakest area when nothing is detected", async () => {
    vi.mocked(recentMatches).mockResolvedValue(Array.from({ length: 5 }, () => mk()));
    vi.mocked(buildPlaystyleProfile).mockReturnValue(null);
    vi.mocked(detectWeakestArea).mockReturnValue(null);
    vi.mocked(aiLessonPlan).mockResolvedValue("Plan genérico");
    await setup();
    await act(async () => {
      fireEvent.click(generateBtn());
    });
    expect(aiLessonPlan).toHaveBeenCalledWith(
      expect.objectContaining({ archetype: "Balanceado", weakestArea: null, provider: "groq", language: "es" })
    );
    expect(saveLessonPlan).toHaveBeenCalledWith(
      expect.objectContaining({ archetype: "Balanceado", weakestArea: null })
    );
    expect(screen.getByText("Plan genérico")).toBeInTheDocument();
  });

  it("refuses with fewer than 5 matches and never calls the AI", async () => {
    vi.mocked(recentMatches).mockResolvedValue(Array.from({ length: 4 }, () => mk()));
    await setup();
    await act(async () => {
      fireEvent.click(generateBtn());
    });
    expect(screen.getByText(/Necesitas al menos 5 partidas guardadas/)).toBeInTheDocument();
    expect(aiLessonPlan).not.toHaveBeenCalled();
    expect(saveLessonPlan).not.toHaveBeenCalled();
    // Intro (and the button) come back once loading ends.
    expect(generateBtn()).toBeEnabled();
  });

  it("shows the AI error and does not persist anything", async () => {
    vi.mocked(recentMatches).mockResolvedValue(Array.from({ length: 6 }, () => mk()));
    vi.mocked(aiLessonPlan).mockRejectedValue(new Error("429 rate limited"));
    await setup();
    await act(async () => {
      fireEvent.click(generateBtn());
    });
    expect(screen.getByText(/429 rate limited/)).toBeInTheDocument();
    expect(saveLessonPlan).not.toHaveBeenCalled();
  });

  it("still shows the plan when saving it fails", async () => {
    vi.mocked(recentMatches).mockResolvedValue(Array.from({ length: 6 }, () => mk()));
    vi.mocked(aiLessonPlan).mockResolvedValue("Plan sin guardar");
    vi.mocked(saveLessonPlan).mockRejectedValue(new Error("disk full"));
    await setup();
    await act(async () => {
      fireEvent.click(generateBtn());
    });
    expect(screen.getByText("Plan sin guardar")).toBeInTheDocument();
    expect(screen.queryByText(/disk full/)).not.toBeInTheDocument();
  });

  it("clears a previous error when retrying successfully", async () => {
    vi.mocked(recentMatches)
      .mockResolvedValueOnce([mk()])
      .mockResolvedValueOnce(Array.from({ length: 6 }, () => mk()));
    vi.mocked(aiLessonPlan).mockResolvedValue("Segundo intento");
    await setup();
    await act(async () => {
      fireEvent.click(generateBtn());
    });
    expect(screen.getByText(/Necesitas al menos 5 partidas/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(generateBtn());
    });
    expect(screen.queryByText(/Necesitas al menos 5 partidas/)).not.toBeInTheDocument();
    expect(screen.getByText("Segundo intento")).toBeInTheDocument();
  });
});

describe("LessonPlanView — history", () => {
  it("shows the empty state when there are no saved plans", async () => {
    await setup();
    fireEvent.click(historyTab());
    expect(screen.getByText("Sin planes generados")).toBeInTheDocument();
    expect(
      screen.getByText('Crea tu primer plan de 7 días en la pestaña "Generar nuevo".')
    ).toBeInTheDocument();
  });

  it("lists saved plans and marks an open one completed", async () => {
    const created = new Date(2026, 5, 15).getTime();
    vi.mocked(recentLessonPlans).mockResolvedValue([
      { id: 3, createdTsMs: created, weakestArea: null, archetype: "Seguro", planText: "Plan A", completed: false },
      { id: 2, createdTsMs: created, weakestArea: null, archetype: "Carry", planText: "Plan B", completed: true },
    ]);
    await setup();
    expect(historyTab()).toHaveTextContent("2");
    fireEvent.click(historyTab());

    expect(screen.getByText("Plan A")).toBeInTheDocument();
    expect(screen.getByText("Plan B")).toBeInTheDocument();
    expect(screen.getByText("Seguro")).toBeInTheDocument();
    expect(screen.getAllByText(new Date(created).toLocaleDateString(), { exact: false })).toHaveLength(2);
    expect(screen.getAllByText("completado")).toHaveLength(1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "marcar completado" }));
    });
    expect(markLessonPlanCompleted).toHaveBeenCalledWith(3);
    expect(screen.queryByRole("button", { name: "marcar completado" })).not.toBeInTheDocument();
    expect(screen.getAllByText("completado")).toHaveLength(2);
  });

  it("ignores 'mark completed' on a plan without an id", async () => {
    vi.mocked(recentLessonPlans).mockResolvedValue([
      { createdTsMs: 0, weakestArea: null, archetype: "Seguro", planText: "Sin id", completed: false },
    ]);
    await setup();
    fireEvent.click(historyTab());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "marcar completado" }));
    });
    expect(markLessonPlanCompleted).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "marcar completado" })).toBeInTheDocument();
  });
});

describe("LessonPlanView — closing", () => {
  it("closes on Escape", async () => {
    const { onClose } = await setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop click but not on clicks inside the card", async () => {
    const { onClose } = await setup();
    fireEvent.click(screen.getByText("Tus últimas 50 partidas"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
