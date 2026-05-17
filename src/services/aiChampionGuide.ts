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

  const systemPrompt = `Eres un coach pro de League of Legends. Generas guías de campeón actualizadas al meta. Estructura: 1) Win condition (1 frase), 2) Power spikes (lvl 2/6/11 + items), 3) Trading pattern, 4) Wave management, 5) Teamfight role. Max 400 palabras.

FORMATO OBLIGATORIO (markdown plano):
- Headers con ## (ej: "## Power spikes")
- **Negrita** para nombres de habilidades, items y conceptos clave
- NO uses _underscores_ ni *asteriscos sueltos* para énfasis — solo **dobles asteriscos**
- Nombres de items en su forma canónica con mayúsculas y apóstrofes: "Doran's Shield", "Ninja Tabi", "Trinity Force"
- Habilidades en formato "Q (Nombre)" o solo el nombre con su tecla entre paréntesis al final: "Ground Slam (E)"
- Nada de _ITEM_, _NOMBRE_ o cosas así
${input.language === "en" ? "Respond in English." : "Responde en español."}`;

  const userPrompt = `Guía de ${input.championName} ${input.role} para el parche ${input.patch}.

Sé concreto y meta-aware: combos exactos, breakpoints reales, builds del parche actual. Nada de generalidades.`;

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
  const text = enrichGuideMarkdown(raw);

  await saveGuide({
    championId: input.championId,
    patch: input.patch,
    guideText: text,
    generatedTsMs: Date.now(),
  });

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
 *   2. Known item names (Doran's Shield, Trinity Force, etc.) → bolded
 *   3. Numbered top-level lists `1. Foo:` → `## Foo`
 *
 * Exported for unit tests.
 */
export function enrichGuideMarkdown(raw: string): string {
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

  // 2. Item names — a hand-curated list of the most-mentioned items in
  //    coaching prompts. Casing in the raw text varies (ALL CAPS,
  //    Title Case, missing apostrophes). We match case-insensitively and
  //    keep the canonical form when replacing.
  const KNOWN_ITEMS = [
    "Doran's Shield", "Doran's Blade", "Doran's Ring",
    "Health Potion", "Control Ward", "Stealth Ward",
    "Boots of Swiftness", "Sorcerer's Shoes", "Plated Steelcaps",
    "Mercury's Treads", "Ionian Boots of Lucidity", "Berserker's Greaves",
    "Mobility Boots", "Ninja Tabi",
    "Trinity Force", "Spirit Visage", "Sundered Sky", "Death's Dance",
    "Spear of Shojin", "Rabadon's Deathcap", "Nashor's Tooth",
    "Liandry's Torment", "Riftmaker", "Stridebreaker", "Sterak's Gage",
    "Black Cleaver", "Eclipse", "Goredrinker", "Heartsteel",
    "Iceborn Gauntlet", "Frozen Heart", "Thornmail", "Randuin's Omen",
    "Force of Nature", "Warmog's Armor", "Dead Man's Plate",
    "Kraken Slayer", "Galeforce", "Immortal Shieldbow", "Bloodthirster",
    "Infinity Edge", "Lord Dominik's Regards", "Mortal Reminder",
    "Mercurial Scimitar", "Phantom Dancer", "Rapid Firecannon",
    "Runaan's Hurricane", "Statikk Shiv", "Stormrazor",
    "Locket of the Iron Solari", "Redemption", "Mikael's Blessing",
    "Knight's Vow", "Zeke's Convergence", "Imperial Mandate",
    "Shurelya's Battlesong", "Moonstone Renewer", "Echoes of Helia",
    "Crown of the Shattered Queen", "Cosmic Drive", "Horizon Focus",
    "Luden's Companion", "Malignance", "Stormsurge", "Shadowflame",
    "Void Staff", "Banshee's Veil", "Zhonya's Hourglass",
    "Dusk and Dawn", "Dawn-shroud", "Ardent Censer",
    "Hubris", "Opportunity", "Profane Hydra", "Voltaic Cyclosword",
    "Yoremaster's Razor", "Spectral Sickle", "Edge of Night",
  ];
  // Use a single regex for performance; escape apostrophes for the alternation.
  const escaped = KNOWN_ITEMS.map((n) =>
    n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  // Sort by length desc so longer names win ("Doran's Shield" before "Doran").
  escaped.sort((a, b) => b.length - a.length);
  const itemRe = new RegExp(
    `\\b(${escaped.join("|")})\\b`,
    "gi"
  );
  out = out.replace(itemRe, (match) => {
    // Find the canonical form preserving the original casing for unknowns
    const canon = KNOWN_ITEMS.find(
      (n) => n.toLowerCase() === match.toLowerCase()
    );
    return `**${canon ?? match}**`;
  });

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
