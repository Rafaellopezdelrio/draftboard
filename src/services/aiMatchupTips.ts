// On-demand AI matchup tips. Cached per (you, enemy, role, patch) in SQLite.
// Used as fallback when no curated tip exists in src/data/matchupTips.ts.

import { getDb, isTauri } from "../db/client";
import { plainStyle } from "./aiStyle";
import { callAi, type AiProvider } from "./aiProvider";
import { isLaneOpponent } from "../data/matchupTips";
import type { Role } from "../types/champion";

/** Lane-trading prompt only applies to your actual lane opponent(s).
 *  `enemyPosition` undefined = legacy caller, assumed same lane. */
function isLaneMatchup(position: string, enemyPosition: string | null | undefined): boolean {
  if (enemyPosition === undefined) return true;
  return isLaneOpponent(position as Role, enemyPosition as Role | null);
}

/** Value stored in the `position` column. Same-role matchups keep the bare
 *  role (old rows stay valid); anything else gets its own key so laning
 *  tips cached for off-lane enemies are never reused. */
export function matchupCacheKey(position: string, enemyPosition?: string | null): string {
  if (enemyPosition === undefined || enemyPosition === position) return position;
  return `${position}|vs:${enemyPosition ?? "?"}`;
}

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
  patch: string,
  enemyPosition?: string | null
): Promise<AiMatchupTips | null> {
  if (!isTauri()) return null;
  const key = matchupCacheKey(position, enemyPosition);
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
    [championA, championB, key, patch]
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
  /** Enemy's (inferred) role; null = unknown. Omit for the legacy
   *  same-lane prompt. */
  enemyPosition?: string | null;
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
      input.patch,
      input.enemyPosition
    );
    if (cached) return cached.tipsText;
  }
  const key = matchupCacheKey(input.position, input.enemyPosition);

  const systemPrompt = `Eres un coach pro de League of Legends. Generas tips de matchup específicos: 3-4 bullets cortos, accionables, basados en mecánicas reales (cooldowns, power spikes, thresholds). NADA de generalidades. ${input.language === "en" ? "Respond in English." : "Responde en español."}

${plainStyle(input.language === "en" ? "en" : "es", { closingTip: false })}`;

  const userPrompt = isLaneMatchup(input.position, input.enemyPosition)
    ? `Matchup: yo juego ${input.championAName} ${input.position}, enemigo es ${input.championBName} ${input.enemyPosition ?? input.position}. Parche ${input.patch}.

Dame 3-4 tips concretos:
- Cómo tradear (cooldown windows, niveles donde gano/pierdo)
- Item core anti-él (specific items)
- Mistake típico que comete y cómo punish
- Power spike crítico a respetar

Formato: bullets de 1-2 líneas. Nada de intro/outro.`
    : `Yo juego ${input.championAName} ${input.position}. ${input.championBName} es del equipo enemigo y juega ${input.enemyPosition ?? "un rol desconocido"}: NO es mi rival de línea, no me des tips de laneo contra él. Parche ${input.patch}.

Dame 3-4 tips concretos:
- Cómo me amenaza en skirmishes y teamfights (engage, burst, rango)
- Cómo jugar ganks, roams o peleas contra él desde mi rol
- Item core anti-él (specific items)
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
    position: key,
    patch: input.patch,
    tipsText: text,
    generatedTsMs: Date.now(),
  });

  return text;
}
