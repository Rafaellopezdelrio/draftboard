// Top Insight engine. Takes a GPI score and returns the single most
// actionable critique — the lowest-scoring category with a one-sentence
// improvement tip tailored to that axis. Renders in CoachView as a
// prominent card at the top of post-game analysis so the user always
// gets a clear "this is what to work on next game" message.
//
// Pure derivation from GPI percentages — no API call, no AI cost.

import type { GpiScore, GpiCategory } from "./gpiEngine";

export interface TopInsight {
  category: GpiCategory;
  score: number; // 0-100
  /** Severity bucket — drives the card's color in the UI. */
  severity: "critical" | "needs-work" | "okay";
  /** Spanish label for the category, ready to render. */
  label: string;
  /** Single-sentence actionable tip. */
  tip: string;
  /** Optional secondary tip when multiple axes are weak. */
  secondaryTip?: string;
}

const CATEGORY_LABELS: Record<GpiCategory, string> = {
  farming: "Farmeo",
  vision: "Visión",
  aggression: "Agresión",
  survivability: "Supervivencia",
  objectives: "Objetivos",
  versatility: "Versatilidad",
  laning: "Carril",
};

const TIPS: Record<GpiCategory, { critical: string; needsWork: string }> = {
  farming: {
    critical:
      "CS por debajo del target. Última oleada antes de roams + freeze tras kills. Stack waves antes de buscar objetivos.",
    needsWork:
      "Sube tu CS/min. Cada 10 CS = ~700 oro. Identifica oleadas perdidas y trabaja last-hits sub-óptimos.",
  },
  vision: {
    critical:
      "Wards muy bajos. Compra Stealth/Pink en cada back. Ward objectives 30s antes del spawn (Dragon/Baron).",
    needsWork:
      "Más visión preventiva. Ward los entries a tu lane antes de cada gank-window enemy.",
  },
  aggression: {
    critical:
      "Pocos kills/asistencias. Forzaste pocos trades. Identifica power spikes y mueve a otras lanes con prio.",
    needsWork:
      "Más participación team. Sigue ulti enemigas y haz collapse cuando tu lane esté segura.",
  },
  survivability: {
    critical:
      "Demasiadas muertes. Trackea junglas + ulti enemigas. Pinguea MIA y respeta vision cuando tengas advantage.",
    needsWork:
      "Reduce muertes. Ward antes de pushear. Si jungla no aparece 60s = posible gank.",
  },
  objectives: {
    critical:
      "Pocos objetivos asegurados. Posiciona para Dragon/Baron timer. Smite advantage + vision = pit fight ganador.",
    needsWork:
      "Más prioridad objetivos. Cada Dragon = +stats permanentes. Coordina back-timings con tu equipo.",
  },
  versatility: {
    critical:
      "Champ pool muy limitado. Aprende 2-3 más en tu rol para counter-pick y evitar bans hostiles.",
    needsWork:
      "Pool justo pero limitado. Expande con 1 pick más por archetype (tank/bruiser/AP) para flex.",
  },
  laning: {
    critical:
      "Perdiste tu carril claro. Respeta el matchup, farmea bajo torre y pide ganks en vez de forzar trades perdedores.",
    needsWork:
      "Empata o gana tu carril. Mejora wave management y castiga los CDs del rival para sacar ventaja temprana.",
  },
};

/**
 * Compute the top insight from a GPI score. Looks at the weakest
 * category (lowest score) and returns the matching tip. If everything
 * is solid (lowest > 65), returns null so the UI skips the card.
 */
export function deriveTopInsight(gpi: GpiScore | null): TopInsight | null {
  if (!gpi) return null;
  const entries = Object.entries(gpi.categories) as Array<[GpiCategory, number]>;
  // Sort ascending — lowest first.
  entries.sort((a, b) => a[1] - b[1]);
  const [worstCat, worstScore] = entries[0];

  // Everything OK — no insight needed.
  if (worstScore >= 65) return null;

  const severity: TopInsight["severity"] =
    worstScore < 35 ? "critical" : worstScore < 55 ? "needs-work" : "okay";
  const tips = TIPS[worstCat];
  const tip = severity === "critical" ? tips.critical : tips.needsWork;

  // Secondary tip if a second axis is also weak.
  let secondaryTip: string | undefined;
  if (entries.length > 1 && entries[1][1] < 55) {
    const [secondCat] = entries[1];
    secondaryTip = `También revisa ${CATEGORY_LABELS[secondCat].toLowerCase()}: ${TIPS[secondCat].needsWork.split(".")[0]}.`;
  }

  return {
    category: worstCat,
    score: worstScore,
    severity,
    label: CATEGORY_LABELS[worstCat],
    tip,
    secondaryTip,
  };
}
