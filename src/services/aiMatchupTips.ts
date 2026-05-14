// On-demand AI matchup tips. Cached per (you, enemy, role, patch) in SQLite.
// Used as fallback when no curated tip exists in src/data/matchupTips.ts.

import { getDb, isTauri } from "../db/client";
import { callAi, type AiProvider } from "./aiProvider";

export interface AiMatchupTips {
  championA: number;
  championB: number;
  position: string;
  patch: string;
  tipsText: string;
  generatedTsMs: number;
}

export async function getCachedMatchupTips(
  championA: number,
  championB: number,
  position: string,
  patch: string
): Promise<AiMatchupTips | null> {
  if (!isTauri()) return null;
  const db = await getDb();
  const rows = await db.select<
    Array<{
      champion_a: number;
      champion_b: number;
      position: string;
      patch: string;
      tips_text: string;
      generated_ts_ms: number;
    }>
  >(
    `SELECT * FROM ai_matchup_tips
     WHERE champion_a = $1 AND champion_b = $2 AND position = $3 AND patch = $4
     LIMIT 1`,
    [championA, championB, position, patch]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    championA: r.champion_a,
    championB: r.champion_b,
    position: r.position,
    patch: r.patch,
    tipsText: r.tips_text,
    generatedTsMs: r.generated_ts_ms,
  };
}

async function saveMatchupTips(t: AiMatchupTips): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO ai_matchup_tips
     (champion_a, champion_b, position, patch, tips_text, generated_ts_ms)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [t.championA, t.championB, t.position, t.patch, t.tipsText, t.generatedTsMs]
  );
}

export interface GenerateMatchupInput {
  provider: AiProvider;
  apiKey: string;
  championA: number;
  championAName: string;
  championB: number;
  championBName: string;
  position: string;
  patch: string;
  language?: "es" | "en";
  force?: boolean;
}

export async function generateMatchupTips(
  input: GenerateMatchupInput
): Promise<string> {
  if (!input.force) {
    const cached = await getCachedMatchupTips(
      input.championA,
      input.championB,
      input.position,
      input.patch
    );
    if (cached) return cached.tipsText;
  }

  const systemPrompt = `Eres un coach pro de League of Legends. Generas tips de matchup específicos: 3-4 bullets cortos, accionables, basados en mecánicas reales (cooldowns, power spikes, thresholds). NADA de generalidades. ${input.language === "en" ? "Respond in English." : "Responde en español."}`;

  const userPrompt = `Matchup: yo juego ${input.championAName} ${input.position}, enemigo es ${input.championBName} ${input.position}. Parche ${input.patch}.

Dame 3-4 tips concretos:
- Cómo tradear (cooldown windows, niveles donde gano/pierdo)
- Item core anti-él (specific items)
- Mistake típico que comete y cómo punish
- Power spike crítico a respetar

Formato: bullets de 1-2 líneas. Nada de intro/outro.`;

  const text = await callAi({
    provider: input.provider,
    apiKey: input.apiKey,
    systemPrompt,
    userPrompt,
    maxTokens: 400,
  });

  await saveMatchupTips({
    championA: input.championA,
    championB: input.championB,
    position: input.position,
    patch: input.patch,
    tipsText: text,
    generatedTsMs: Date.now(),
  });

  return text;
}
