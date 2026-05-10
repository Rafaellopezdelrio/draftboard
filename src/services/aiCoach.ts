// AI coach using configurable provider (Groq free / Anthropic paid / Gemini free).
// Sends a structured match summary + optional history context, returns
// natural-language coaching advice.

import type { Insight } from "../engine/coachEngine";
import type { GpiScore } from "../engine/gpiEngine";
import type { MatchFull, MatchTimeline } from "./riotApi";
import { callAi, type AiProvider } from "./aiProvider";
import { buildProAnalytics } from "../engine/matchAnalytics";
import {
  professionalCoachSystemPrompt,
  professionalMatchPrompt,
} from "./aiPromptBuilder";

export interface AiCoachInput {
  provider: AiProvider;
  apiKey: string;
  match: MatchFull;
  timeline: MatchTimeline;
  myPuuid: string;
  insights: Insight[];
  gpi: GpiScore | null;
  championName: string;
  opponentChampionName: string | null;
  championNamesById: Map<number, string>;
  rank?: { tier: string; division: string; lp: number } | null;
  language?: "es" | "en";
}

export interface AiTrendsInput {
  provider: AiProvider;
  apiKey: string;
  matches: Array<{
    championName: string;
    position: string;
    win: boolean;
    kda: string;
    cspm: number;
    visionScore: number;
    durationMin: number;
    queueId: number;
  }>;
  language?: "es" | "en";
}

export interface LessonPlanInput {
  provider: AiProvider;
  apiKey: string;
  weakestArea: string | null;
  archetype: string;
  recentMatches: Array<{
    championName: string;
    position: string;
    win: boolean;
    kda: string;
  }>;
  language?: "es" | "en";
}

export async function aiCoachAnalysis(input: AiCoachInput): Promise<string> {
  const analytics = buildProAnalytics(
    input.match,
    input.timeline,
    input.myPuuid,
    input.championNamesById
  );
  if (!analytics) throw new Error("No participant found");

  const systemPrompt = professionalCoachSystemPrompt({
    language: input.language ?? "es",
    rank: input.rank ?? null,
  });
  const userPrompt = professionalMatchPrompt(
    analytics,
    input.insights,
    input.language ?? "es"
  );

  return callAi({
    provider: input.provider,
    apiKey: input.apiKey,
    systemPrompt,
    userPrompt,
    maxTokens: 700,
  });
}

export async function aiTrendsAnalysis(input: AiTrendsInput): Promise<string> {
  if (input.matches.length < 5) {
    throw new Error("Se necesitan al menos 5 partidas");
  }
  const wins = input.matches.filter((m) => m.win).length;
  const lines = input.matches
    .map(
      (m) =>
        `- ${m.championName} ${m.position}: ${m.win ? "W" : "L"} ${m.kda} | ${m.cspm.toFixed(1)} CS/m | VS ${m.visionScore} | ${m.durationMin.toFixed(0)}min`
    )
    .join("\n");

  const systemPrompt = `Eres un coach profesional de League of Legends. Analizas TENDENCIAS, no partidas individuales. Identifica el patrón principal que explica los resultados (winrate, comportamiento, errores recurrentes, fortalezas) y da 2-3 acciones concretas para subir LP. Máximo 250 palabras. Idioma: ${input.language === "en" ? "English" : "Español"}.`;

  const userPrompt = `Analiza la TENDENCIA de mis últimas ${input.matches.length} partidas:

Winrate: ${wins}/${input.matches.length} (${((wins / input.matches.length) * 100).toFixed(0)}%)

Partidas (más recientes primero):
${lines}

Identifica patrones (campeones que rinden mejor, roles fuertes/débiles, fugas de LP, hábitos repetidos). Responde como un coach humano: foco en el patrón principal, NO listes todo. Dame 2-3 acciones concretas.`;

  return callAi({
    provider: input.provider,
    apiKey: input.apiKey,
    systemPrompt,
    userPrompt,
    maxTokens: 700,
  });
}

export async function aiLessonPlan(input: LessonPlanInput): Promise<string> {
  const lines = input.recentMatches
    .slice(0, 10)
    .map(
      (m) =>
        `- ${m.championName} ${m.position}: ${m.win ? "W" : "L"} ${m.kda}`
    )
    .join("\n");

  const systemPrompt = `Eres un coach pro de League of Legends. Diseñas planes de mejora de 7 días personalizados. El plan debe ser CONCRETO: cada día = 1 objetivo específico + 1 ejercicio medible. Total max 350 palabras. ${input.language === "en" ? "Respond in English." : "Responde en español."}`;

  const userPrompt = `Crea un plan de práctica de 7 días para mí.

Mi estilo: ${input.archetype}
Mi mayor problema: ${input.weakestArea ?? "no identificado"}

Mis últimas partidas:
${lines}

Para cada día:
- Objetivo específico (medible)
- Ejercicio concreto (ej. "20 min en práctica solo last-hits hasta CS@10 = 80")
- Cómo verificar que mejoraste

Sé específico y accionable. No uses listas con bullets dentro de cada día — texto fluido por día.`;

  return callAi({
    provider: input.provider,
    apiKey: input.apiKey,
    systemPrompt,
    userPrompt,
    maxTokens: 900,
  });
}
