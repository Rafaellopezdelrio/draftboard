// Cross-game leak analysis: what statistically separates your wins from your
// losses. Unlike trendsEngine.detectWeakestArea (fixed threshold priority:
// CS -> KDA -> deaths) this splits matches into a win-set and a loss-set,
// measures each metric's standardized gap (Cohen's d effect size), and ranks
// them. The metric with the largest gap = your highest-leverage leak — the
// single thing that most distinguishes the games you win from the ones you
// lose, quantified instead of guessed.
//
// If NO metric separates wins from losses (top d < ~0.3), that is itself the
// finding: the leak is macro / draft / decision-making, not mechanics.

import type { MatchRow } from "../services/matchRepo";

export type LeakKey = "deaths" | "kda" | "cspm" | "kp" | "vision" | "gold";

export interface Leak {
  key: LeakKey;
  /** Spanish label, kept for the AI-summary/memory path (internal anchor). */
  label: string;
  /** i18n key for the UI label (trends.leakMetric.*). */
  labelKey: string;
  winAvg: number;
  lossAvg: number;
  /** lossAvg - winAvg, in the metric's own units (signed). */
  delta: number;
  /** |Cohen's d| — standardized effect size, 0.2 small / 0.5 medium / 0.8 large. */
  effect: number;
  severity: "bad" | "warn" | "info";
  /** Spanish insight, kept for the AI-memory path. */
  insight: string;
  /** Spanish advice, kept for the AI-memory path. */
  advice: string;
  /** i18n key for the UI advice (trends.leakAdvice.*). */
  adviceKey: string;
  /** Pre-formatted loss/win values (language-neutral) for the UI insight. */
  lossFmt: string;
  winFmt: string;
}

export interface LeakReport {
  topLeak: Leak;
  leaks: Leak[]; // ranked desc by effect size
  games: number;
  wins: number;
  losses: number;
  /** true when even the biggest gap is small -> problem is macro, not mechanics. */
  macro: boolean;
  /** Spanish headline, kept for the AI-memory path. */
  headline: string;
  /** i18n key for the UI headline (trends.leakHeadline*). */
  headlineKey: string;
  /** winrate % over the sample — param for the localized headline. */
  wrPct: number;
}

interface MetricDef {
  key: LeakKey;
  label: string;
  /** higher value = better play. deaths is the only "lower is better". */
  higherIsBetter: boolean;
  /** per-match value, or null to exclude this match from the metric. */
  value: (m: MatchRow) => number | null;
  format: (v: number) => string;
  advice: string;
}

const MIN_GAMES = 8;
const MIN_PER_SIDE = 3;

const METRICS: MetricDef[] = [
  {
    key: "deaths",
    label: "Muertes",
    higherIsBetter: false,
    value: (m) => m.deaths,
    format: (v) => v.toFixed(1),
    advice:
      "Antes de cada pelea evalúa si la trade vale. Revisa el minimapa tras cada recall.",
  },
  {
    key: "kda",
    label: "KDA",
    higherIsBetter: true,
    value: (m) => (m.kills + m.assists) / Math.max(1, m.deaths),
    format: (v) => v.toFixed(2),
    advice:
      "Elige mejor tus peleas: participa solo cuando puedas impactar sin morir.",
  },
  {
    key: "cspm",
    label: "Farm (CS/min)",
    higherIsBetter: true,
    // CS only means something for non-supports; exclude UTILITY so the
    // win/loss comparison isn't diluted by roaming support games.
    value: (m) =>
      m.position === "UTILITY" ? null : m.cs / Math.max(1, m.durationSec / 60),
    format: (v) => `${v.toFixed(1)} CS/m`,
    advice:
      "Prioriza últimos golpes y recupera oleadas tras objetivos en vez de rotar en vacío.",
  },
  {
    key: "kp",
    label: "Participación",
    higherIsBetter: true,
    // (kills+assists) per minute — proxy for how involved you are in the
    // map. We can't compute true KP (no team kills in schema), but the
    // per-minute rate still separates "present" from "isolated" games.
    value: (m) => (m.kills + m.assists) / Math.max(1, m.durationSec / 60),
    format: (v) => `${v.toFixed(2)}/min`,
    advice:
      "Acércate a objetivos y rotaciones — en tus derrotas juegas aislado del equipo.",
  },
  {
    key: "vision",
    label: "Visión (score/min)",
    higherIsBetter: true,
    // Nullable: pre-010 rows have no vision data -> skipped, never read as 0.
    value: (m) =>
      m.visionScore == null
        ? null
        : m.visionScore / Math.max(1, m.durationSec / 60),
    format: (v) => `${v.toFixed(2)}/min`,
    advice:
      "Compra control wards, wardea antes de objetivos y limpia la visión enemiga.",
  },
  {
    key: "gold",
    label: "Oro/min",
    higherIsBetter: true,
    value: (m) =>
      m.goldEarned == null
        ? null
        : m.goldEarned / Math.max(1, m.durationSec / 60),
    format: (v) => `${Math.round(v)}/min`,
    advice:
      "Sube tu economía: no pierdas oleadas y recoge plates / objetivos para no quedarte sin ítems.",
  },
];

export function analyzeLeaks(matches: MatchRow[]): LeakReport | null {
  if (matches.length < MIN_GAMES) return null;
  const winSet = matches.filter((m) => m.win);
  const lossSet = matches.filter((m) => !m.win);
  if (winSet.length < MIN_PER_SIDE || lossSet.length < MIN_PER_SIDE) return null;

  const leaks: Leak[] = [];
  for (const metric of METRICS) {
    const winVals = collect(winSet, metric.value);
    const lossVals = collect(lossSet, metric.value);
    if (winVals.length < MIN_PER_SIDE || lossVals.length < MIN_PER_SIDE) continue;

    const winAvg = mean(winVals);
    const lossAvg = mean(lossVals);
    const effect = Math.abs(cohensD(winVals, lossVals));
    const delta = lossAvg - winAvg;

    // Is the loss-side worse in the harmful direction? (deaths up, others down)
    const worseInLosses = metric.higherIsBetter ? lossAvg < winAvg : lossAvg > winAvg;
    // Only a leak if losses are actually worse; if you somehow play "better"
    // mechanically in losses, that's not the lever — skip it.
    if (!worseInLosses) continue;

    const severity: Leak["severity"] =
      effect >= 0.8 ? "bad" : effect >= 0.5 ? "warn" : "info";

    leaks.push({
      key: metric.key,
      label: metric.label,
      labelKey: `trends.leakMetric.${metric.key}`,
      winAvg,
      lossAvg,
      delta,
      effect,
      severity,
      insight: `${metric.label}: derrotas ${metric.format(lossAvg)} vs victorias ${metric.format(winAvg)}`,
      advice: metric.advice,
      adviceKey: `trends.leakAdvice.${metric.key}`,
      lossFmt: metric.format(lossAvg),
      winFmt: metric.format(winAvg),
    });
  }

  if (leaks.length === 0) return null;
  leaks.sort((a, b) => b.effect - a.effect);
  const topLeak = leaks[0];
  const macro = topLeak.effect < 0.3;

  const wr = Math.round((winSet.length / matches.length) * 100);
  const headline = macro
    ? `Tus stats mecánicas no distinguen tus victorias de tus derrotas — el leak está en macro/draft, no en mecánica.`
    : `Tu mayor diferencia entre ganar y perder: ${topLeak.label}.`;

  return {
    topLeak,
    leaks,
    games: matches.length,
    wins: winSet.length,
    losses: lossSet.length,
    macro,
    headline: `${headline} (${wr}% WR en ${matches.length})`,
    headlineKey: macro
      ? "trends.leakHeadlineMacro"
      : "trends.leakHeadlineMetric",
    wrPct: wr,
  };
}

/** Compact, prompt-ready summary so the AI coach reasons over the full-sample
 *  statistics instead of re-deriving from a 15-match window. */
export function summarizeLeakForAi(report: LeakReport): string {
  const rows = report.leaks
    .map(
      (l) =>
        `- ${l.label}: ${l.winAvg.toFixed(2)} (victorias) vs ${l.lossAvg.toFixed(2)} (derrotas), effect=${l.effect.toFixed(2)}`
    )
    .join("\n");
  const verdict = report.macro
    ? "Ningún stat mecánico separa claramente wins de losses -> el leak es macro/draft/decisiones."
    : `Leak principal: ${report.topLeak.label} (es lo que más separa victorias de derrotas).`;
  return `Estadística de ${report.games} partidas (${report.wins}W / ${report.losses}L). Diferencias victoria vs derrota:\n${rows}\n${verdict}`;
}

function collect(rows: MatchRow[], f: (m: MatchRow) => number | null): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const v = f(r);
    if (v !== null && Number.isFinite(v)) out.push(v);
  }
  return out;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function variance(xs: number[], m: number): number {
  if (xs.length < 2) return 0;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}

/** Cohen's d with pooled standard deviation. Returns 0 when there is no
 *  spread (pooled SD == 0) so identical sets never rank as a leak. */
function cohensD(a: number[], b: number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  const va = variance(a, ma);
  const vb = variance(b, mb);
  const pooled = Math.sqrt(
    ((a.length - 1) * va + (b.length - 1) * vb) /
      Math.max(1, a.length + b.length - 2)
  );
  if (pooled === 0) return 0;
  return (ma - mb) / pooled;
}
