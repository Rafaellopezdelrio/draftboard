// Conversational AI coach — user can ask Claude anything about their gameplay.
// Includes context: recent matches, masteries, current draft, weakest area.

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { MatchRow, ChampionPersonalStat } from "./matchRepo";
import type { ChampionMasteryDto } from "./riotApi";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
const httpFetch: typeof fetch = (input, init) =>
  isTauri()
    ? (tauriFetch as unknown as typeof fetch)(input, init)
    : fetch(input, init);

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

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
  apiKey: string,
  history: ChatMessage[],
  context: ChatContext,
  language: "es" | "en" = "es"
): Promise<string> {
  const systemPrompt = buildSystem(context, language);

  const body = {
    model: MODEL,
    max_tokens: 800,
    system: systemPrompt,
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  };

  const res = await httpFetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey.trim(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) throw new Error("API key Anthropic inválida");
  if (res.status === 429) throw new Error("Rate limit alcanzado, espera 1 min");
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
