// On-demand AI-generated champion guides cached per (champion, patch) in SQLite.
// First request for a champion calls the AI; subsequent loads are instant from cache.

import { getDb, isTauri } from "../db/client";
import { callAi, type AiProvider } from "./aiProvider";

export interface AiChampionGuide {
  championId: number;
  patch: string;
  guideText: string;
  generatedTsMs: number;
}

export async function getCachedGuide(
  championId: number,
  patch: string
): Promise<AiChampionGuide | null> {
  if (!isTauri()) return null;
  const db = await getDb();
  const rows = await db.select<
    Array<{
      champion_id: number;
      patch: string;
      guide_text: string;
      generated_ts_ms: number;
    }>
  >(
    `SELECT * FROM ai_champion_guides WHERE champion_id = $1 AND patch = $2 LIMIT 1`,
    [championId, patch]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    championId: r.champion_id,
    patch: r.patch,
    guideText: r.guide_text,
    generatedTsMs: r.generated_ts_ms,
  };
}

async function saveGuide(g: AiChampionGuide): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO ai_champion_guides (champion_id, patch, guide_text, generated_ts_ms)
     VALUES ($1,$2,$3,$4)`,
    [g.championId, g.patch, g.guideText, g.generatedTsMs]
  );
}

export interface GenerateGuideInput {
  provider: AiProvider;
  apiKey: string;
  championId: number;
  championName: string;
  role: string;
  patch: string;
  language?: "es" | "en";
  force?: boolean;
}

export async function generateChampionGuide(
  input: GenerateGuideInput
): Promise<string> {
  if (!input.force) {
    const cached = await getCachedGuide(input.championId, input.patch);
    if (cached) return cached.guideText;
  }

  const systemPrompt = `Eres un coach pro de League of Legends. Generas guías de campeón actualizadas al meta. Estructura: 1) Win condition (1 frase), 2) Power spikes (lvl 2/6/11 + items), 3) Trading pattern, 4) Wave management, 5) Teamfight role. Max 400 palabras. ${input.language === "en" ? "Respond in English." : "Responde en español."}`;

  const userPrompt = `Guía de ${input.championName} ${input.role} para el parche ${input.patch}.

Sé concreto y meta-aware: combos exactos, breakpoints reales, builds del parche actual. Nada de generalidades.`;

  const text = await callAi({
    provider: input.provider,
    apiKey: input.apiKey,
    systemPrompt,
    userPrompt,
    maxTokens: 900,
  });

  await saveGuide({
    championId: input.championId,
    patch: input.patch,
    guideText: text,
    generatedTsMs: Date.now(),
  });

  return text;
}
