// Conversational AI coach — user can ask any AI provider about their gameplay.

import type { MatchRow, ChampionPersonalStat } from "./matchRepo";
import type { ChampionMasteryDto } from "./riotApi";
import { callAi, type AiProvider } from "./aiProvider";
import { i18n } from "../i18n";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatContext {
  recentMatches: MatchRow[];
  masteries: ChampionMasteryDto[];
  personalStats: ChampionPersonalStat[];
  currentRank?: { tier: string; division: string; lp: number } | null;
  championNamesById: Record<number, string>;
}

export async function chatWithCoach(
  provider: AiProvider,
  apiKey: string,
  history: ChatMessage[],
  context: ChatContext,
  language: "es" | "en" = "es"
): Promise<string> {
  const systemPrompt = buildSystem(context, language);
  const lastUser = history[history.length - 1];
  if (!lastUser || lastUser.role !== "user") {
    throw new Error(i18n.t("serviceErrors.lastMustBeUser"));
  }
  const priorHistory = history.slice(0, -1);

  return callAi({
    provider,
    apiKey,
    systemPrompt,
    userPrompt: lastUser.content,
    history: priorHistory,
    maxTokens: 800,
  });
}

function buildSystem(ctx: ChatContext, lang: "es" | "en"): string {
  const total = ctx.recentMatches.length;
  const wins = ctx.recentMatches.filter((m) => m.win).length;
  const wr = total > 0 ? ((wins / total) * 100).toFixed(0) : "?";

  const topChamps = ctx.personalStats
    .filter((s) => s.games >= 3)
    .slice(0, 5)
    .map((s) => {
      const name = ctx.championNamesById[s.championId] ?? `#${s.championId}`;
      return `${name}: ${s.games}g ${(s.winRate * 100).toFixed(0)}%WR`;
    })
    .join(", ");

  const topMasteries = ctx.masteries
    .slice(0, 5)
    .map((m) => {
      const name = ctx.championNamesById[m.championId] ?? `#${m.championId}`;
      return `${name} (M${m.championLevel}, ${Math.round(m.championPoints / 1000)}k)`;
    })
    .join(", ");

  const last10 = ctx.recentMatches
    .slice(0, 10)
    .map((m) => {
      const name = ctx.championNamesById[m.championId] ?? `#${m.championId}`;
      const kda = `${m.kills}/${m.deaths}/${m.assists}`;
      return `${m.win ? "W" : "L"} ${name} ${m.position} ${kda}`;
    })
    .join("; ");

  const rankStr = ctx.currentRank
    ? `${ctx.currentRank.tier} ${ctx.currentRank.division} ${ctx.currentRank.lp}LP`
    : "Sin rango detectado";

  if (lang === "en") {
    return `You are a professional League of Legends coach embedded in the user's draft advisor app. You answer their questions about gameplay, picks, builds, matchups, and improvement. Be concise (2-4 paragraphs max), specific, and actionable. Never use generic advice — reference their actual data.

USER CONTEXT:
- Rank: ${rankStr}
- Recent winrate: ${wins}/${total} (${wr}%)
- Top played: ${topChamps || "no data yet"}
- Top mastery: ${topMasteries || "no data yet"}
- Last 10 matches: ${last10 || "none"}

Guidelines:
- Don't list all stats; highlight the most important pattern.
- If asked about a champion, mention their personal data with that champ if available.
- If asked something off-topic, politely redirect to LoL coaching.
- Use English.`;
  }

  return `Eres un coach profesional de League of Legends integrado en el draft advisor del usuario. Respondes preguntas sobre gameplay, picks, builds, matchups y cómo mejorar. Sé conciso (2-4 párrafos máximo), específico y accionable. Nunca des consejos genéricos — referencia sus datos reales.

CONTEXTO DEL USUARIO:
- Rango: ${rankStr}
- Winrate reciente: ${wins}/${total} (${wr}%)
- Más jugados: ${topChamps || "sin datos aún"}
- Top maestría: ${topMasteries || "sin datos aún"}
- Últimas 10 partidas: ${last10 || "ninguna"}

Pautas:
- No listes todas las stats; destaca el patrón más importante.
- Si preguntan por un campeón, menciona sus datos personales con ese campeón si los hay.
- Si preguntan algo off-topic, redirige amablemente al coaching de LoL.
- Responde en español.`;
}
