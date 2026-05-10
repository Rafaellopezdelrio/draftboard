// AI coach using user-provided Anthropic API key.
// Sends a structured match summary + optional history context, returns
// natural-language coaching advice.

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { Insight } from "../engine/coachEngine";
import type { GpiScore } from "../engine/gpiEngine";
import type { MatchFull } from "./riotApi";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
const httpFetch: typeof fetch = (input, init) =>
  isTauri()
    ? (tauriFetch as unknown as typeof fetch)(input, init)
    : fetch(input, init);

export interface AiCoachInput {
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

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

export interface AiTrendsInput {
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

  const body = {
    model: MODEL,
    max_tokens: 700,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  };

  const res = await httpFetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey.trim(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const json = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  return json.content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n");
}

export interface LessonPlanInput {
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

  const body = {
    model: MODEL,
    max_tokens: 900,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  };

  const res = await httpFetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey.trim(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const json = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  return json.content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n");
}

export async function aiCoachAnalysis(input: AiCoachInput): Promise<string> {
  const me = input.match.participants.find((p) => p.puuid === input.myPuuid);
  if (!me) throw new Error("No participant found");

  const myTeam = input.match.participants.filter((p) => p.teamId === me.teamId);
  const enemyTeam = input.match.participants.filter(
    (p) => p.teamId !== me.teamId
  );
  const minutes = (input.match.durationSec / 60).toFixed(1);

  const systemPrompt = `Eres un coach profesional de League of Legends, conciso y directo. Hablas como un coach humano: sin repetir cifras innecesariamente, identificando el patrón principal y dando 2-3 acciones concretas. Nunca uses listas largas. Máximo 200 palabras. Idioma: ${input.language === "en" ? "English" : "Español"}.`;

  const userPrompt = buildPrompt(
    input,
    me,
    myTeam,
    enemyTeam,
    minutes
  );

  const body = {
    model: MODEL,
    max_tokens: 600,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  };

  const res = await httpFetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey.trim(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) throw new Error("API key Anthropic inválida");
  if (res.status === 429) throw new Error("Rate limit Anthropic");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  return json.content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n");
}

function buildPrompt(
  input: AiCoachInput,
  me: MatchFull["participants"][number],
  myTeam: MatchFull["participants"],
  enemyTeam: MatchFull["participants"],
  minutes: string
): string {
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

  return `Analiza esta partida de un jugador y dime las 2-3 cosas más importantes a mejorar.

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
}
