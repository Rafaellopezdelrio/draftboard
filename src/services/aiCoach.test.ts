import { describe, it, expect } from "vitest";
import { buildTrendsPrompts, buildMatchBenchmarkLine, type AiTrendsInput } from "./aiCoach";
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

  it("omits the optional blocks when not provided", () => {
    const { user } = buildTrendsPrompts(input());
    expect(user).not.toContain("Análisis estadístico");
    expect(user).not.toContain("Tu estilo de juego");
    expect(user).not.toContain("Vs tu rango");
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
