import { describe, it, expect } from "vitest";
import { buildTrendsPrompts, type AiTrendsInput } from "./aiCoach";

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

  it("omits the optional blocks when not provided", () => {
    const { user } = buildTrendsPrompts(input());
    expect(user).not.toContain("Análisis estadístico");
    expect(user).not.toContain("Tu estilo de juego");
  });

  it("respects the language in the system prompt", () => {
    expect(buildTrendsPrompts(input({ language: "en" })).system).toMatch(/English/);
    expect(buildTrendsPrompts(input({ language: "es" })).system).toMatch(/Español/);
  });
});
