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
  const lang = input.language === "en" ? "English" : "Español";
  const system =
    `Eres un coach de draft de League of Legends de nivel pro. Te paso un pick, ` +
    `el draft completo y datos de matchup reales. Explica en 3-4 frases, conciso ` +
    `y accionable: (1) por qué el pick encaja en esta comp (o su riesgo), (2) el ` +
    `matchup de TU carril y cómo jugarlo (early agresivo / safe-scaling / all-in ` +
    `nivel X / respeta su power spike), (3) tu win condition con esta comp. Cita ` +
    `el WR del matchup si lo tengo. Si te paso mi dominio del campeón, adapta a mi ` +
    `comodidad (nuevo → foco simple; main → puedo flexar). Si te paso lo que le falta ` +
    `a mi comp, dilo en la win condition. NUNCA inventes números. Prosa, sin listas, sin ` +
    `relleno. Idioma: ${lang}.`;

  const lines: string[] = [];
  lines.push(`Mi pick: ${input.myChampion} (${input.role}).`);
  if (input.allies.length) lines.push(`Aliados: ${input.allies.join(", ")}.`);
  if (input.enemies.length) lines.push(`Enemigos: ${input.enemies.join(", ")}.`);
  if (input.laneOpponent) {
    const wr =
      input.laneMatchupWinRate != null
        ? ` — mi WR ${(input.laneMatchupWinRate * 100).toFixed(0)}%`
        : "";
    lines.push(`Rival de carril: ${input.laneOpponent}${wr}.`);
  }
  if (input.topSuggestions.length) {
    lines.push(
      `Lo que dice el engine: ` +
        input.topSuggestions
          .map((s) => `${s.name} [${s.reasons.join(", ") || "sin tags"}]`)
          .join(" · ") +
        `.`
    );
  }
  if (input.enemyMains?.length) {
    lines.push(
      `Mains enemigos scouteados: ` +
        input.enemyMains
          .map((m) => `${m.championName}${m.summonerName ? ` (${m.summonerName})` : ""}`)
          .join(", ") +
        `. Ten en cuenta lo que probablemente jueguen.`
    );
  }
  if (input.bans?.length) {
    lines.push(`Bans del draft: ${input.bans.join(", ")}.`);
  }
  if (input.myMastery) {
    lines.push(
      `Mi dominio de ${input.myChampion}: maestría ${input.myMastery.level}, ${input.myMastery.points} puntos.`
    );
  }
  if (input.compMissing?.length) {
    lines.push(`A mi comp le falta: ${input.compMissing.join(", ")}.`);
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
