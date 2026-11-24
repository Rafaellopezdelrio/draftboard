// On-demand AI-generated champion guides cached per (champion, patch, role, language) in SQLite.
// First request for a champion calls the AI; subsequent loads are instant from cache.

import { getDb, isTauri } from "../db/client";
import { callAi, type AiProvider } from "./aiProvider";

export interface AiChampionGuide {
  championId: number;
  patch: string;
  guideText: string;
  generatedTsMs: number;
}

/**
 * Cache key stored in the "patch" column. The guide text depends on role and
 * language too, and the table's key is only (champion_id, patch), so both are
 * folded into that column instead of a schema change. Rows written before
 * this (plain patch) no longer match and are simply regenerated.
 * Exported for unit tests.
 */
export function guideCacheKey(patch: string, role?: string, language?: "es" | "en"): string {
  // "items" marks guides written from the live item list: older ones could
  // name removed items (Crown of the Shattered Queen) and are regenerated.
  return role ? `${patch}|${role}|${language ?? "es"}|items` : patch;
}

export async function getCachedGuide(
  championId: number,
  patch: string,
  role?: string,
  language?: "es" | "en"
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
    [championId, guideCacheKey(patch, role, language)]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    championId: r.champion_id,
    patch,
    guideText: r.guide_text,
    generatedTsMs: r.generated_ts_ms,
  };
}

async function saveGuide(
  g: AiChampionGuide,
  role: string,
  language?: "es" | "en"
): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO ai_champion_guides (champion_id, patch, guide_text, generated_ts_ms)
     VALUES ($1,$2,$3,$4)`,
    [g.championId, guideCacheKey(g.patch, role, language), g.guideText, g.generatedTsMs]
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
  /** Finished items sold on the Rift this patch, in `language`
   * (itemMeta.riftItemNames). The guide may only name these. */
  itemNames?: string[];
}

export async function generateChampionGuide(
  input: GenerateGuideInput
): Promise<string> {
  if (!input.force) {
    const cached = await getCachedGuide(
      input.championId,
      input.patch,
      input.role,
      input.language
    );
    if (cached) return cached.guideText;
  }

  const systemPrompt = `Eres un coach pro de League of Legends. Generas guías de campeón actualizadas al meta. Estructura: 1) Win condition (1 frase), 2) Power spikes (lvl 2/6/11 + items), 3) Trading pattern, 4) Wave management, 5) Teamfight role. Max 400 palabras.

FORMATO OBLIGATORIO (markdown plano):
- Headers con ## (ej: "## Power spikes")
- **Negrita** para nombres de habilidades, items y conceptos clave
- NO uses _underscores_ ni *asteriscos sueltos* para énfasis — solo **dobles asteriscos**
- Objetos: SOLO los de la lista que te paso, escritos exactamente igual (es la tienda de este parche; cualquier otro ya no existe)
- Habilidades en formato "Q (Nombre)" o solo el nombre con su tecla entre paréntesis al final: "Ground Slam (E)"
- Nada de _ITEM_, _NOMBRE_ o cosas así
${input.language === "en" ? "Respond in English." : "Responde en español de España: tú, nunca vos."}`;

  const items = input.itemNames ?? [];
  const itemBlock = items.length
    ? `\n\nOBJETOS QUE EXISTEN EN ESTE PARCHE (usa solo estos, con este nombre exacto):\n${items.join("; ")}`
    : "";
  const userPrompt = `Guía de ${input.championName} ${input.role} para el parche ${input.patch}.

Sé concreto y meta-aware: combos exactos, breakpoints reales, builds del parche actual. Nada de generalidades.${itemBlock}`;

  const raw = await callAi({
    provider: input.provider,
    apiKey: input.apiKey,
    systemPrompt,
    userPrompt,
    maxTokens: 900,
  });

  // Post-process LLM output so the markdown renderer has something to
  // highlight even when the model emits plain text. Llama tends to keep
  // ability names in ALL CAPS like "GROUND SLAM (E)" but skips the
  // **bold** wrapping we asked for — wrap them ourselves.
  const text = enrichGuideMarkdown(raw, items);

  await saveGuide(
    {
      championId: input.championId,
      patch: input.patch,
      guideText: text,
      generatedTsMs: Date.now(),
    },
    input.role,
    input.language
  );

  return text;
}

/**
 * Enrich raw LLM output with markdown markers our renderer can highlight.
 * The model is asked to use **bold** but doesn't always comply; we apply
 * the same logic deterministically so the UI never falls back to grey
 * uppercase text.
 *
 * Transformations:
 *   1. Ability names like `GROUND SLAM (E)` → `**Ground Slam (E)**`
 *      (also Title-Cases the words for readability)
 *   2. Item names from this patch's shop (`itemNames`, in the guide's
 *      language) → bolded with their exact shop spelling
 *   3. Numbered top-level lists `1. Foo:` → `## Foo`
 *
 * Exported for unit tests.
 */
export function enrichGuideMarkdown(raw: string, itemNames: string[] = []): string {
  let out = raw;

  // 1. Ability names: ALL CAPS phrase ending in (Q|W|E|R|P).
  //    Matches "GROUND SLAM (E)", "PERFECT TIMING (P)", etc.
  out = out.replace(
    /([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ' ]{2,30}?)\s*\(([QWERP])\)/g,
    (_, name: string, key: string) => {
      const titled = name
        .toLowerCase()
        .replace(/(^|\s|')([a-záéíóúñ])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
      return `**${titled.trim()} (${key})**`;
    }
  );

  // 2. Item names from this patch's shop. Casing in the raw text varies
  //    (ALL CAPS, Title Case), so match case-insensitively and write the
  //    shop spelling. Letter-aware edges instead of \b so Spanish names with
  //    accents ("Égida…") match; names the model already bolded are skipped.
  if (itemNames.length) {
    const escaped = itemNames
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      // Longer names first ("Doran's Shield" before "Doran's").
      .sort((a, b) => b.length - a.length);
    const itemRe = new RegExp(
      `(?<![\\p{L}\\p{N}*])(${escaped.join("|")})(?![\\p{L}\\p{N}*])`,
      "giu"
    );
    out = out.replace(itemRe, (match) => {
      const canon = itemNames.find((n) => n.toLowerCase() === match.toLowerCase());
      return `**${canon ?? match}**`;
    });
  }

  // 3. Numbered top-level sections: `1. Win condition:` → `## Win condition`
  //    Only matches at start of line + ends with `:` so we don't break
  //    in-paragraph numbering.
  out = out.replace(
    /^(\d+)\.\s+([^\n:]{3,40}):\s*$/gm,
    (_, _n, title) => `## ${title.trim()}`
  );
  out = out.replace(
    /^(\d+)\.\s+\*\*([^\n*]{3,40})\*\*:?\s*$/gm,
    (_, _n, title) => `## ${title.trim()}`
  );

  return out;
}
