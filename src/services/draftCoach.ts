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
    `el WR del matchup si lo tengo. NUNCA inventes números. Prosa, sin listas, sin ` +
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
