// Draft AI Coach. Turns the engine's multi-dimensional suggestion output into
// a coherent, human draft explanation: WHY the pick, the key lane matchup +
// how to play it, and the win condition. This is what makes "best overall"
// (meta + mastery) read sensibly even when its matchup is rough — the thing
// the raw score can't convey on its own.
//
// On-demand (a button), never auto: each call is one LLM request.

import { callAi, type AiProvider } from "./aiProvider";

export interface DraftCoachInput {
  myChampion: string; // display name
  role: string; // "TOP" | "JUNGLE" | ...
  allies: string[]; // names
  enemies: string[]; // names
  laneOpponent: string | null;
  /** My win rate vs the lane opponent, 0-1, if known (op.gg matchup). */
  laneMatchupWinRate: number | null;
  /** Top engine suggestions with their reason tags, for grounding. */
  topSuggestions: Array<{ name: string; reasons: string[] }>;
  /** Scouted enemy comfort mains (from lobby mastery) — what they likely play. */
  enemyMains?: Array<{ championName: string; summonerName?: string }>;
  /** Banned champions (names) — so the coach reasons with the real pool, not a
   *  threat that's actually banned out. */
  bans?: string[];
  /** Local player's mastery on THIS champ — tailors advice (comfort pick the
   *  player can flex vs first-time pick that needs a simple game plan). Null/low
   *  points signal an unfamiliar champion. */
  myMastery?: { level: number; points: number } | null;
  /** Comp archetypes the ally team is MISSING (engine output) — grounds the win
   *  condition + how to cover the gap. */
  compMissing?: string[];
  language: "es" | "en";
}

/** Pure prompt builder — exported so it can be unit-tested without the LLM. */
export function buildDraftCoachPrompts(input: DraftCoachInput): {
  system: string;
  user: string;
} {
  const en = input.language === "en";
  const lang = en ? "English" : "Español";
  const system = en
    ? `You are a pro-level League of Legends draft coach. I give you a pick, the ` +
      `full draft and real matchup data. Explain in 3-4 sentences, concise and ` +
      `actionable: (1) why the pick fits this comp (or its risk), (2) YOUR lane ` +
      `matchup and how to play it (early aggressive / safe-scaling / all-in at ` +
      `level X / respect their power spike), (3) your win condition with this comp. ` +
      `Cite the matchup WR if I give it. If I give you my champion mastery, adapt ` +
      `to my comfort (new champ → simple focus; main → I can flex). If I give you ` +
      `what my comp lacks, say it in the win condition. NEVER fabricate numbers. ` +
      `Prose, no lists, no filler. Language: ${lang}.`
    : `Eres un coach de draft de League of Legends de nivel pro. Te paso un pick, ` +
      `el draft completo y datos de matchup reales. Explica en 3-4 frases, conciso ` +
      `y accionable: (1) por qué el pick encaja en esta comp (o su riesgo), (2) el ` +
      `matchup de TU carril y cómo jugarlo (early agresivo / safe-scaling / all-in ` +
      `nivel X / respeta su power spike), (3) tu win condition con esta comp. Cita ` +
      `el WR del matchup si lo tengo. Si te paso mi dominio del campeón, adapta a mi ` +
      `comodidad (nuevo → foco simple; main → puedo flexar). Si te paso lo que le ` +
      `falta a mi comp, dilo en la win condition. NUNCA inventes números. Prosa, sin ` +
      `listas, sin relleno. Idioma: ${lang}.`;

  // Label set — keeps the prompt fully ES or fully EN (the LLM parses either,
  // but a clean single-language prompt reads better + avoids accidental code-
  // switching in the response).
  const L = en
    ? { pick: "My pick", allies: "Allies", enemies: "Enemies", laneOpp: "Lane opponent", myWr: "my WR", engine: "Engine says", noTags: "no tags", mains: "Scouted enemy mains", mainsTail: "Factor in what they likely play", bans: "Draft bans", masteryOf: "My mastery of", masteryWord: "mastery", points: "points", lacks: "My comp lacks" }
    : { pick: "Mi pick", allies: "Aliados", enemies: "Enemigos", laneOpp: "Rival de carril", myWr: "mi WR", engine: "Lo que dice el engine", noTags: "sin tags", mains: "Mains enemigos scouteados", mainsTail: "Ten en cuenta lo que probablemente jueguen", bans: "Bans del draft", masteryOf: "Mi dominio de", masteryWord: "maestría", points: "puntos", lacks: "A mi comp le falta" };

  const lines: string[] = [];
  lines.push(`${L.pick}: ${input.myChampion} (${input.role}).`);
  if (input.allies.length) lines.push(`${L.allies}: ${input.allies.join(", ")}.`);
  if (input.enemies.length) lines.push(`${L.enemies}: ${input.enemies.join(", ")}.`);
  if (input.laneOpponent) {
    const wr =
      input.laneMatchupWinRate != null
        ? ` — ${L.myWr} ${(input.laneMatchupWinRate * 100).toFixed(0)}%`
        : "";
    lines.push(`${L.laneOpp}: ${input.laneOpponent}${wr}.`);
  }
  if (input.topSuggestions.length) {
    lines.push(
      `${L.engine}: ` +
        input.topSuggestions
          .map((s) => `${s.name} [${s.reasons.join(", ") || L.noTags}]`)
          .join(" · ") +
        `.`
    );
  }
  if (input.enemyMains?.length) {
    lines.push(
      `${L.mains}: ` +
        input.enemyMains
          .map((m) => `${m.championName}${m.summonerName ? ` (${m.summonerName})` : ""}`)
          .join(", ") +
        `. ${L.mainsTail}.`
    );
  }
  if (input.bans?.length) {
    lines.push(`${L.bans}: ${input.bans.join(", ")}.`);
  }
  if (input.myMastery) {
    lines.push(
      `${L.masteryOf} ${input.myChampion}: ${L.masteryWord} ${input.myMastery.level}, ${input.myMastery.points} ${L.points}.`
    );
  }
  if (input.compMissing?.length) {
    lines.push(`${L.lacks}: ${input.compMissing.join(", ")}.`);
  }
  return { system, user: lines.join("\n") };
}

/** Ask the AI to explain the current draft. Returns the coaching prose. */
export async function explainDraft(
  provider: AiProvider,
  apiKey: string,
  input: DraftCoachInput
): Promise<string> {
  const { system, user } = buildDraftCoachPrompts(input);
  return callAi({ provider, apiKey, systemPrompt: system, userPrompt: user });
}
