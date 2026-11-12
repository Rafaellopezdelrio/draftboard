// Conversational AI coach — user can ask any AI provider about their gameplay.

import type { MatchRow, ChampionPersonalStat } from "./matchRepo";
import type { ChampionMasteryDto } from "./riotApi";
import { callAi, type AiProvider } from "./aiProvider";
import { i18n } from "../i18n";
import { plainStyle } from "./aiStyle";

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
    maxTokens: 1200,
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

  const shown = Math.min(10, total);
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
    : lang === "en"
      ? "No rank detected"
      : "Sin rango detectado";

  if (lang === "en") {
    return `You are a League of Legends coach inside the user's draft advisor app. You answer questions about playing, picks, builds, matchups and improving. Go into detail, step by step, so someone who struggles to understand can follow it. Never give generic advice — use their real data.

USER CONTEXT:
- Rank: ${rankStr}
- Last ${total} games: ${wins} won (${wr}%)
- Top played: ${topChamps || "no data yet"}
- Top mastery: ${topMasteries || "no data yet"}
- Last ${shown} games (newest first, W = win, L = loss, kills/deaths/assists): ${last10 || "none"}

Guidelines:
- Find the one pattern that matters most; don't go through every stat.
- If they ask about "the last N games", use only those N.
- If asked about a champion, mention their own games with it if available.
- If asked something off-topic, politely steer back to LoL.
- Use English.

${plainStyle("en")}`;
  }

  return `Eres un coach de League of Legends dentro de la app de draft del usuario. Respondes preguntas sobre cómo jugar, qué elegir, qué comprar, contra quién y cómo mejorar. Entra en detalle, paso a paso, para que lo entienda alguien a quien le cuesta. Nunca des consejos genéricos: usa sus datos reales.

CONTEXTO DEL USUARIO:
- Liga: ${rankStr}
- Últimas ${total} partidas: ${wins} ganadas (${wr}%)
- Más jugados: ${topChamps || "sin datos aún"}
- Más maestría: ${topMasteries || "sin datos aún"}
- Últimas ${shown} partidas (la más reciente primero, W = victoria, L = derrota, asesinatos/muertes/asistencias): ${last10 || "ninguna"}

Pautas:
- Busca el patrón que más importa; no repases todos los datos.
- Si preguntan por "las últimas N partidas", usa solo esas N.
- Si preguntan por un campeón, menciona sus partidas con él si las hay.
- Si preguntan algo que no es de LoL, reconduce con amabilidad.
- Responde en español.

${plainStyle("es")}`;
}
