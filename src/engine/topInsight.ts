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
  /** i18n key for the category label (coach.category.*). */
  labelKey: string;
  /** i18n key for the actionable tip (coach.tip.<cat>.<critical|needsWork>). */
  tipKey: string;
  /** i18n keys for the optional secondary weak axis (area label + its tip). */
  secondaryAreaKey?: string;
  secondaryTipKey?: string;
}

/**
 * Compute the top insight from a GPI score. Looks at the weakest
 * category (lowest score) and returns the matching tip (as i18n keys, resolved
 * by the panel). If everything is solid (lowest > 65), returns null so the UI
 * skips the card.
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
  const tipKey = `coach.tip.${worstCat}.${severity === "critical" ? "critical" : "needsWork"}`;

  // Secondary tip if a second axis is also weak.
  let secondaryAreaKey: string | undefined;
  let secondaryTipKey: string | undefined;
  if (entries.length > 1 && entries[1][1] < 55) {
    const [secondCat] = entries[1];
    secondaryAreaKey = `coach.category.${secondCat}`;
    secondaryTipKey = `coach.tip.${secondCat}.needsWork`;
  }

  return {
    category: worstCat,
    score: worstScore,
    severity,
    labelKey: `coach.category.${worstCat}`,
    tipKey,
    secondaryAreaKey,
    secondaryTipKey,
  };
}
