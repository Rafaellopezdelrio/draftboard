// AI coach using configurable provider (Groq free / Anthropic paid / Gemini free).
// Sends a structured match summary + optional history context, returns
// natural-language coaching advice.

import type { Insight } from "../engine/coachEngine";
import type { GpiScore } from "../engine/gpiEngine";
import type { MatchFull } from "./riotApi";
import { callAi, type AiProvider } from "./aiProvider";

export interface AiCoachInput {
  provider: AiProvider;
  apiKey: string;
  match: MatchFull;
  myPuuid: string;
  insights: Insight[];
  gpi: GpiScore | null;
  championName: string;
  opponentChampionName: string | null;
  recentTrendSummary?: string;
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
  const me = input.match.participants.find((p) => p.puuid === input.myPuuid);
  if (!me) throw new Error("No participant found");

  const myTeam = input.match.participants.filter((p) => p.teamId === me.teamId);
  const enemyTeam = input.match.participants.filter(
    (p) => p.teamId !== me.teamId
  );
  const minutes = (input.match.durationSec / 60).toFixed(1);
  const cspm = (me.cs / Number(minutes)).toFixed(1);
  const teamKills = myTeam.reduce((a, p) => a + p.kills, 0);
  const teamDmg = myTeam.reduce(
    (a, p) => a + p.totalDamageDealtToChampions,
    0
  );
  const kp = teamKills > 0 ? ((me.kills + me.assists) / teamKills) * 100 : 0;
  const dmgShare = teamDmg > 0 ? (me.totalDamageDealtToChampions / teamDmg) * 100 : 0;
  const vspm = (me.visionScore / Number(minutes)).toFixed(2);

  const insightsSummary = input.insights
    .map((i) => `[${i.severity}] ${i.title}: ${i.detail}`)
    .join("\n");

  const gpiSummary = input.gpi
    ? `GPI total ${input.gpi.total}/100 — farm ${input.gpi.categories.farming}, vision ${input.gpi.categories.vision}, agresión ${input.gpi.categories.aggression}, supervivencia ${input.gpi.categories.survivability}, objetivos ${input.gpi.categories.objectives}, versatilidad ${input.gpi.categories.versatility}`
    : "";

  const systemPrompt = `Eres un coach profesional de League of Legends, conciso y directo. Hablas como un coach humano: sin repetir cifras innecesariamente, identificando el patrón principal y dando 2-3 acciones concretas. Nunca uses listas largas. Máximo 200 palabras. Idioma: ${input.language === "en" ? "English" : "Español"}.`;

  const userPrompt = `Analiza esta partida de un jugador y dime las 2-3 cosas más importantes a mejorar.

DATOS:
- Campeón: ${input.championName} (${me.position})
- Rival en lane: ${input.opponentChampionName ?? "?"}
- Resultado: ${me.win ? "VICTORIA" : "DERROTA"} en ${minutes}min
- KDA: ${me.kills}/${me.deaths}/${me.assists}
- CS: ${me.cs} (${cspm}/min)
- Vision score: ${me.visionScore} (${vspm}/min), control wards: ${me.controlWardsBought}
- Kill participation: ${kp.toFixed(0)}%
- Damage share: ${dmgShare.toFixed(0)}%
- Oro: ${me.goldEarned}
- Equipo enemigo: ${enemyTeam.map((p) => `${p.position}`).join(", ")}

${gpiSummary ? `\nGPI: ${gpiSummary}\n` : ""}
${insightsSummary ? `\nReglas heurísticas detectaron:\n${insightsSummary}\n` : ""}
${input.recentTrendSummary ? `\nContexto últimas partidas: ${input.recentTrendSummary}\n` : ""}

Responde como un coach humano: identifica el patrón principal del problema (no listes todo), explica POR QUÉ pasó, y da 2-3 acciones concretas que pueda hacer en su próxima partida. Sin emojis, sin listas largas, máximo 200 palabras.`;

  return callAi({
    provider: input.provider,
    apiKey: input.apiKey,
    systemPrompt,
    userPrompt,
    maxTokens: 600,
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
