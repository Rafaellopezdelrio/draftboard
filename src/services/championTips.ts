// On-demand AI champion tips, cached per (champion, role, patch) in SQLite.
// The pre-game TipCarousel only hand-curated ~9 champions; this gives all ~170
// short, specific, meta-aware tips — generated once, instant from cache after.
// Mirrors aiChampionGuide's cache-or-generate pattern.

import { getDb, isTauri } from "../db/client";
import { callAi, type AiProvider } from "./aiProvider";

/** Split an LLM tips blob into clean, capped lines — drops numbering, bullets,
 *  blank lines, and over-long entries. Exported for tests. */
export function parseTips(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length > 0 && l.length <= 120)
    .slice(0, 5);
}

export async function getCachedTips(
  championId: number,
  role: string,
  patch: string
): Promise<string[] | null> {
  if (!isTauri()) return null;
  const db = await getDb();
  const rows = await db.select<Array<{ tips_text: string }>>(
    `SELECT tips_text FROM ai_champion_tips
     WHERE champion_id = $1 AND role = $2 AND patch = $3 LIMIT 1`,
    [championId, role, patch]
  );
  if (rows.length === 0) return null;
  const tips = parseTips(rows[0].tips_text);
  return tips.length > 0 ? tips : null;
}

async function saveTips(
  championId: number,
  role: string,
  patch: string,
  tips: string[]
): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO ai_champion_tips (champion_id, role, patch, tips_text, generated_ts_ms)
     VALUES ($1,$2,$3,$4,$5)`,
    [championId, role, patch, tips.join("\n"), Date.now()]
  );
}

/** Pure prompt builder — exported for tests. */
export function buildTipsPrompts(
  championName: string,
  role: string,
  patch: string,
  language: "es" | "en"
): { system: string; user: string } {
  const system =
    language === "en"
      ? `You are a pro League of Legends coach. Give EXACTLY 4 short, specific tips ` +
        `for playing this champion in this role on the current meta. Each tip: one ` +
        `line, max 14 words, actionable (mechanic / timing / wave / trade / matchup / ` +
        `power spike). No numbering, no fluff, no generic advice like "play safe". ` +
        `One tip per line.`
      : `Eres un coach pro de League of Legends. Da EXACTAMENTE 4 tips CORTOS y ` +
        `específicos para jugar este campeón en este rol en el meta actual. Cada tip: ` +
        `una línea, máximo 14 palabras, accionable (mecánica / timing / wave / trade / ` +
        `matchup / power spike). Sin numeración, sin relleno, sin generalidades tipo ` +
        `"juega seguro". Un tip por línea.`;
  const user =
    language === "en"
      ? `4 tips for ${championName} ${role}, patch ${patch}.`
      : `4 tips para ${championName} ${role}, parche ${patch}.`;
  return { system, user };
}

export interface ChampionTipsInput {
  provider: AiProvider;
  apiKey: string;
  championId: number;
  championName: string;
  role: string;
  patch: string;
  language?: "es" | "en";
}

/** Cache-or-generate. Returns [] on any failure (caller falls back to curated
 *  / role tips) — tips must never throw into the champ-select UI. */
export async function getChampionTips(input: ChampionTipsInput): Promise<string[]> {
  try {
    const cached = await getCachedTips(input.championId, input.role, input.patch);
    if (cached) return cached;
    const { system, user } = buildTipsPrompts(
      input.championName,
      input.role,
      input.patch,
      input.language === "en" ? "en" : "es"
    );
    const raw = await callAi({
      provider: input.provider,
      apiKey: input.apiKey,
      systemPrompt: system,
      userPrompt: user,
      maxTokens: 200,
    });
    const tips = parseTips(raw);
    if (tips.length > 0) {
      await saveTips(input.championId, input.role, input.patch, tips);
    }
    return tips;
  } catch {
    return [];
  }
}
