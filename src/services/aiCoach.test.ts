import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Orchestration tests below run the real prompt builders, analytics, memory
// and lesson-plan repos; only the AI transport and the SQLite handle are faked.
const callAi = vi.fn();
vi.mock("./aiProvider", () => ({
  callAi: (...a: unknown[]) => callAi(...a),
}));

const selectMock = vi.fn();
const executeMock = vi.fn();
const getDbMock = vi.fn();
let tauri = true;
vi.mock("../db/client", () => ({
  isTauri: () => tauri,
  getDb: () => getDbMock(),
}));

import {
  buildTrendsPrompts,
  buildMatchBenchmarkLine,
  aiCoachAnalysis,
  aiTrendsAnalysis,
  aiLessonPlan,
  type AiTrendsInput,
  type AiCoachInput,
  type LessonPlanInput,
} from "./aiCoach";
import type { MatchFull, MatchParticipant } from "./riotApi";

function mkMatch(): MatchFull {
  return {
    matchId: "m",
    durationSec: 1800,
    endTsMs: 0,
    queueId: 420,
    teams: [],
    participants: [
      {
        puuid: "me",
        position: "MIDDLE",
        cs: 90, // 3 CS/min — well below the Gold baseline
        visionScore: 12,
        deaths: 8,
        kills: 2,
        assists: 3,
      } as unknown as MatchParticipant,
    ],
  };
}

function input(over: Partial<AiTrendsInput> = {}): AiTrendsInput {
  return {
    provider: "groq",
    apiKey: "",
    matches: [
      {
        championName: "Ahri",
        position: "MIDDLE",
        win: true,
        kda: "5/2/8",
        cspm: 7.2,
        durationMin: 30,
        queueId: 420,
      },
    ],
    language: "es",
    ...over,
  };
}

describe("buildTrendsPrompts", () => {
  it("lists the matches in the user prompt", () => {
    const { user } = buildTrendsPrompts(input());
    expect(user).toContain("Ahri");
    expect(user).toContain("7.2 CS/m");
  });

  it("injects the leak statistics block when provided", () => {
    const { user } = buildTrendsPrompts(input({ leakSummary: "Leak principal: Muertes." }));
    expect(user).toContain("Análisis estadístico");
    expect(user).toContain("Leak principal: Muertes.");
  });

  it("injects the playstyle block and tells the coach to adapt to it", () => {
    const { user } = buildTrendsPrompts(input({ playstyleSummary: "Arquetipo: Agresivo." }));
    expect(user).toContain("Tu estilo de juego");
    expect(user).toContain("Arquetipo: Agresivo.");
    expect(user).toMatch(/Adapta el consejo a mi estilo/);
  });

  it("injects the rank-benchmark block and tells the coach to close the gaps", () => {
    const { user } = buildTrendsPrompts(
      input({ benchmarkSummary: "Rango Gold-Plat (MIDDLE): CS/min 5.2 vs 6.8 (below)." })
    );
    expect(user).toContain("Vs tu rango");
    expect(user).toContain("CS/min 5.2 vs 6.8 (below)");
    expect(user).toMatch(/por debajo de tu rango/);
  });

  it("injects the progress block and tells the coach to use the direction", () => {
    const { user } = buildTrendsPrompts(
      input({ progressSummary: "Tendencia general: improving." })
    );
    expect(user).toContain("Evolución temporal");
    expect(user).toContain("Tendencia general: improving.");
    expect(user).toMatch(/reconoce lo que YA mejoró/);
  });

  it("omits the optional blocks when not provided", () => {
    const { user } = buildTrendsPrompts(input());
    expect(user).not.toContain("Análisis estadístico");
    expect(user).not.toContain("Tu estilo de juego");
    expect(user).not.toContain("Vs tu rango");
    expect(user).not.toContain("Evolución temporal");
  });

  it("respects the language in the system prompt", () => {
    expect(buildTrendsPrompts(input({ language: "en" })).system).toMatch(/English/);
    expect(buildTrendsPrompts(input({ language: "es" })).system).toMatch(/Español/);
  });
});

describe("buildMatchBenchmarkLine", () => {
  it("reads this match's stats vs the player's bracket", () => {
    const line = buildMatchBenchmarkLine(mkMatch(), "me", "GOLD");
    expect(line).toMatch(/CS\/min below/);
    expect(line).toMatch(/Gold/);
  });

  it("returns empty when the player isn't in the match", () => {
    expect(buildMatchBenchmarkLine(mkMatch(), "ghost", "GOLD")).toBe("");
  });
});

describe("AI coach orchestration", () => {
  const NOW = 1_700_000_000_000;

  const fullPart = (over: Partial<MatchParticipant> & Pick<MatchParticipant, "puuid">): MatchParticipant => ({
    participantId: 1,
    championId: 103,
    teamId: 100,
    position: "MIDDLE",
    win: false,
    kills: 2,
    deaths: 8,
    assists: 3,
    cs: 150,
    goldEarned: 9_000,
    totalDamageDealtToChampions: 12_000,
    magicDamageDealtToChampions: 11_000,
    physicalDamageDealtToChampions: 1_000,
    totalDamageTaken: 20_000,
    damageDealtToObjectives: 2_000,
    visionScore: 15,
    wardsPlaced: 6,
    wardsKilled: 1,
    controlWardsBought: 0,
    champLevel: 14,
    items: [],
    summoner1Id: 4,
    summoner2Id: 14,
    perks: null,
    ...over,
  });

  const fullMatch = (): MatchFull => ({
    matchId: "EUW1_test",
    durationSec: 1800,
    endTsMs: 0,
    queueId: 420,
    teams: [],
    participants: [
      fullPart({ puuid: "me" }),
      fullPart({ puuid: "foe", participantId: 6, championId: 157, teamId: 200, win: true }),
    ],
  });

  const coachInput = (over: Partial<AiCoachInput> = {}): AiCoachInput => ({
    provider: "groq",
    apiKey: "",
    match: fullMatch(),
    timeline: { matchId: "EUW1_test", participantToPuuid: {}, frames: [] },
    myPuuid: "me",
    insights: [
      { category: "deaths", severity: "bad", title: "Muertes", detail: "8 muertes" },
    ],
    gpi: null,
    championName: "Ahri",
    opponentChampionName: "Yasuo",
    championNamesById: new Map([
      [103, "Ahri"],
      [157, "Yasuo"],
    ]),
    rank: { tier: "GOLD", division: "II", lp: 47 },
    ...over,
  });

  const trendMatch = (win: boolean) => ({
    championName: "Ahri",
    position: "MIDDLE",
    win,
    kda: "3/4/5",
    cspm: 6.5,
    durationMin: 28,
    queueId: 420,
  });

  const lessonInput = (over: Partial<LessonPlanInput> = {}): LessonPlanInput => ({
    provider: "groq",
    apiKey: "",
    weakestArea: "deaths",
    archetype: "Agresivo",
    recentMatches: Array.from({ length: 12 }, (_, i) => ({
      championName: `Champ${i}`,
      position: "MIDDLE",
      win: i % 2 === 0,
      kda: `${i}/1/1`,
    })),
    ...over,
  });

  beforeEach(() => {
    tauri = true;
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    callAi.mockReset().mockResolvedValue("Mueres demasiado en el río. Wardea antes de pushear.");
    selectMock.mockReset().mockResolvedValue([]);
    executeMock.mockReset().mockResolvedValue({ lastInsertId: 9, rowsAffected: 1 });
    getDbMock.mockReset().mockResolvedValue({ select: selectMock, execute: executeMock });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("aiCoachAnalysis", () => {
    it("throws when the player is not in the match, before calling the AI", async () => {
      await expect(aiCoachAnalysis(coachInput({ myPuuid: "ghost" }))).rejects.toThrow(
        "No participant found"
      );
      expect(callAi).not.toHaveBeenCalled();
      expect(executeMock).not.toHaveBeenCalled();
    });

    it("injects memory + rank benchmark into the prompts and returns the AI reply", async () => {
      selectMock.mockResolvedValue([
        {
          id: 1,
          kind: "pattern",
          category: "deaths",
          content: "Te pillan sin visión",
          match_id: null,
          champion_id: null,
          created_ts_ms: 1,
          expires_ts_ms: null,
        },
      ]);

      const out = await aiCoachAnalysis(coachInput());

      expect(out).toBe("Mueres demasiado en el río. Wardea antes de pushear.");
      // Memory context is asked for 8 items.
      expect(selectMock.mock.calls[0][1]).toEqual([NOW, 8]);
      const p = callAi.mock.calls[0][0];
      expect(p.maxTokens).toBe(700);
      expect(p.systemPrompt).toContain("The user's current rank: GOLD II 47LP.");
      expect(p.systemPrompt).toMatch(
        /MEMORIA DE SESIONES PASADAS[^\n]*\n- \[PATRÓN\/deaths\] Te pillan sin visión$/
      );
      expect(p.userPrompt).toMatch(/\n\nEsta partida vs tu rango \(Gold[^)]*\): .+\.$/);
    });

    it("saves the reply's first sentence as advice memory for this match", async () => {
      await aiCoachAnalysis(coachInput());
      const [sql, params] = executeMock.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO ai_memory/);
      expect(params).toEqual(["advice", "deaths", "Mueres demasiado en el río", "EUW1_test", 103, NOW, null]);
    });

    it("truncates the saved first sentence to 240 chars and tolerates no insights", async () => {
      callAi.mockResolvedValue(`${"a".repeat(300)}. resto`);
      await aiCoachAnalysis(coachInput({ insights: [] }));
      const params = executeMock.mock.calls[0][1];
      expect(params[1]).toBeNull();
      expect(params[2]).toBe("a".repeat(240));
    });

    it("saves no memory when the reply has no leading sentence", async () => {
      callAi.mockResolvedValue("... ok");
      expect(await aiCoachAnalysis(coachInput())).toBe("... ok");
      expect(executeMock).not.toHaveBeenCalled();
    });

    it("falls back to unknown elo without a rank and no memory block outside Tauri", async () => {
      tauri = false;
      await aiCoachAnalysis(coachInput({ rank: null }));
      const p = callAi.mock.calls[0][0];
      expect(p.systemPrompt).toContain("elo desconocido");
      expect(p.systemPrompt).not.toContain("MEMORIA DE SESIONES PASADAS");
      expect(getDbMock).not.toHaveBeenCalled();
    });

    it("passes the requested language to both prompt builders", async () => {
      await aiCoachAnalysis(coachInput({ language: "en" }));
      const p = callAi.mock.calls[0][0];
      expect(p.systemPrompt).toContain("Respond in English");
      expect(p.userPrompt).toContain("Respond in English.");
      expect(p.userPrompt).not.toContain("Responde en español.");
    });
  });

  describe("aiTrendsAnalysis", () => {
    it("refuses fewer than 5 matches without calling the AI", async () => {
      // 4 is the boundary: one short of the minimum.
      await expect(
        aiTrendsAnalysis({
          provider: "groq",
          apiKey: "",
          matches: [true, true, false, false].map(trendMatch),
        })
      ).rejects.toThrow("Se necesitan al menos 5 partidas");
      expect(callAi).not.toHaveBeenCalled();
    });

    it("sends the trends prompts and returns the reply", async () => {
      callAi.mockResolvedValue("Tendencia: mejoras.");
      const out = await aiTrendsAnalysis({
        provider: "gemini",
        apiKey: "g-key",
        matches: [true, false, true, false, true].map(trendMatch),
      });
      expect(out).toBe("Tendencia: mejoras.");
      const p = callAi.mock.calls[0][0];
      expect(p).toMatchObject({ provider: "gemini", apiKey: "g-key", maxTokens: 700 });
      expect(p.userPrompt).toContain("Winrate: 3/5 (60%)");
      expect(p.systemPrompt).toContain("Idioma: Español");
    });
  });

  describe("aiLessonPlan", () => {
    it("prompts with style, weakness and the 10 most recent matches", async () => {
      await aiLessonPlan(lessonInput());
      const p = callAi.mock.calls[0][0];
      expect(p.maxTokens).toBe(900);
      expect(p.systemPrompt).toContain("Responde en español.");
      expect(p.userPrompt).toContain("Mi estilo: Agresivo");
      expect(p.userPrompt).toContain("Mi mayor problema: deaths");
      expect(p.userPrompt).toContain("- Champ0 MIDDLE: W 0/1/1");
      expect(p.userPrompt).toContain("- Champ9 MIDDLE: L 9/1/1");
      expect(p.userPrompt).not.toContain("Champ10");
    });

    it("persists the plan and a goal memory, then returns the plan text", async () => {
      callAi.mockResolvedValue("Día 1: ...");
      const out = await aiLessonPlan(lessonInput());
      expect(out).toBe("Día 1: ...");

      const [planSql, planParams] = executeMock.mock.calls[0];
      expect(planSql).toMatch(/INSERT INTO lesson_plans/);
      expect(planParams).toEqual([NOW, "deaths", "Agresivo", "Día 1: ...", 0]);

      const [memSql, memParams] = executeMock.mock.calls[1];
      expect(memSql).toMatch(/INSERT INTO ai_memory/);
      expect(memParams).toEqual([
        "goal",
        "deaths",
        "Plan de 7 días generado: foco en deaths",
        null,
        null,
        NOW,
        null,
      ]);
    });

    it("handles an unknown weakest area and English output", async () => {
      await aiLessonPlan(lessonInput({ weakestArea: null, language: "en" }));
      const p = callAi.mock.calls[0][0];
      expect(p.systemPrompt).toContain("Respond in English.");
      expect(p.userPrompt).toContain("Mi mayor problema: no identificado");
      expect(executeMock.mock.calls[0][1][1]).toBeNull();
      expect(executeMock.mock.calls[1][1].slice(1, 3)).toEqual([
        null,
        "Plan de 7 días generado: foco en mejora general",
      ]);
    });

    it("saves nothing when the AI call fails", async () => {
      callAi.mockRejectedValue(new Error("quota"));
      await expect(aiLessonPlan(lessonInput())).rejects.toThrow("quota");
      expect(executeMock).not.toHaveBeenCalled();
    });
  });
});
