// Longitudinal progress synthesis: are you actually getting better over time?
//
// leakEngine answers "what separates my wins from my losses" on a static
// sample. progressEngine answers a different question — "am I trending up or
// down" — by splitting the match history chronologically into an OLDER half and
// a NEWER half and measuring how each metric moved between them. This is the
// multi-session synthesis the trends coach was missing: instead of a single
// snapshot, the AI gets the direction of travel and can say "your deaths are
// dropping, keep it up" or "your CS regressed this week".
//
// Pure + fully tested. No DB / no I/O — caller passes the rows.

import type { MatchRow } from "../services/matchRepo";

export type ProgressKey = "winrate" | "kda" | "cspm" | "deaths" | "vision" | "kp";

export interface ProgressMetric {
  key: ProgressKey;
  label: string;
  /** mean over the older half (chronologically first). */
  older: number;
  /** mean over the newer half (most recent games). */
  newer: number;
  /** newer - older, in the metric's own units (signed). */
  delta: number;
  /** relative change vs the older window, signed (e.g. 0.2 = +20%). */
  pctChange: number;
  /** true when the move is in the good direction (deaths down, others up). */
  improving: boolean;
  /** "up"/"down" = a meaningful move; "flat" = within the noise threshold. */
  direction: "up" | "down" | "flat";
  /** prompt/UI-ready one-liner, e.g. "Muertes 6.2 → 4.8 (mejora)". */
  display: string;
}

export interface ProgressReport {
  /** games per side (older/newer); both halves are this size. */
  windowGames: number;
  totalGames: number;
  /** all measurable metrics, ordered most-notable change first. */
  metrics: ProgressMetric[];
  improved: ProgressMetric[];
  regressed: ProgressMetric[];
  /** overall direction of travel across the measured metrics. */
  trend: "improving" | "declining" | "mixed" | "stable";
  headline: string;
}

interface MetricDef {
  key: ProgressKey;
  label: string;
  higherIsBetter: boolean;
  /** per-match value, or null to exclude this match from the metric. */
  value: (m: MatchRow) => number | null;
  format: (v: number) => string;
}

const MIN_TOTAL = 10;
const MIN_PER_SIDE = 5;
const MIN_SAMPLES = 3;
// Below this relative move a metric counts as "flat" (noise, not a real trend).
const FLAT_PCT = 0.05;

function cspm(m: MatchRow): number {
  return m.cs / Math.max(1, m.durationSec / 60);
}

const METRICS: MetricDef[] = [
  {
    key: "winrate",
    label: "Winrate",
    higherIsBetter: true,
    value: (m) => (m.win ? 1 : 0),
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "kda",
    label: "KDA",
    higherIsBetter: true,
    value: (m) => (m.kills + m.assists) / Math.max(1, m.deaths),
    format: (v) => v.toFixed(2),
  },
  {
    key: "cspm",
    label: "Farm (CS/min)",
    higherIsBetter: true,
    // CS is meaningless for supports — exclude UTILITY so a support streak
    // doesn't read as a farming regression.
    value: (m) => (m.position === "UTILITY" ? null : cspm(m)),
    format: (v) => `${v.toFixed(1)} CS/m`,
  },
  {
    key: "deaths",
    label: "Muertes",
    higherIsBetter: false,
    value: (m) => m.deaths,
    format: (v) => v.toFixed(1),
  },
  {
    key: "vision",
    label: "Visión (score/min)",
    higherIsBetter: true,
    value: (m) =>
      m.visionScore == null ? null : m.visionScore / Math.max(1, m.durationSec / 60),
    format: (v) => `${v.toFixed(2)}/min`,
  },
  {
    key: "kp",
    label: "Implicación (KA/min)",
    higherIsBetter: true,
    value: (m) => (m.kills + m.assists) / Math.max(1, m.durationSec / 60),
    format: (v) => `${v.toFixed(2)}/min`,
  },
];

/** Build the progress report. `matches` may be in any order; we sort by
 *  end-timestamp internally. Returns null when there aren't enough games to
 *  form two comparable windows. */
export function analyzeProgress(matches: MatchRow[]): ProgressReport | null {
  if (matches.length < MIN_TOTAL) return null;

  // Chronological ascending so the split is older-half vs newer-half.
  const sorted = [...matches].sort(
    (a, b) => a.gameEndTimestampMs - b.gameEndTimestampMs
  );
  const half = Math.floor(sorted.length / 2);
  if (half < MIN_PER_SIDE) return null;
  // When odd, the middle game is dropped so both windows are equal size.
  const olderSet = sorted.slice(0, half);
  const newerSet = sorted.slice(sorted.length - half);

  const metrics: ProgressMetric[] = [];
  for (const def of METRICS) {
    const olderVals = collect(olderSet, def.value);
    const newerVals = collect(newerSet, def.value);
    if (olderVals.length < MIN_SAMPLES || newerVals.length < MIN_SAMPLES) continue;

    const older = mean(olderVals);
    const newer = mean(newerVals);
    const delta = newer - older;
    const pctChange = older === 0 ? (newer === 0 ? 0 : 1) : delta / Math.abs(older);

    const improving = def.higherIsBetter ? delta > 0 : delta < 0;
    const direction: ProgressMetric["direction"] =
      Math.abs(pctChange) < FLAT_PCT ? "flat" : improving ? "up" : "down";
    const tag =
      direction === "flat" ? "estable" : improving ? "mejora" : "empeora";

    metrics.push({
      key: def.key,
      label: def.label,
      older,
      newer,
      delta,
      pctChange,
      improving,
      direction,
      display: `${def.label} ${def.format(older)} → ${def.format(newer)} (${tag})`,
    });
  }

  if (metrics.length === 0) return null;

  // Most-notable change first (largest relative move regardless of direction).
  metrics.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
  const improved = metrics.filter((m) => m.direction === "up");
  const regressed = metrics.filter((m) => m.direction === "down");

  const trend = classifyTrend(metrics, improved, regressed);
  const headline = buildHeadline(trend, improved, regressed, half);

  return {
    windowGames: half,
    totalGames: sorted.length,
    metrics,
    improved,
    regressed,
    trend,
    headline,
  };
}

function classifyTrend(
  metrics: ProgressMetric[],
  improved: ProgressMetric[],
  regressed: ProgressMetric[]
): ProgressReport["trend"] {
  const moving = improved.length + regressed.length;
  if (moving === 0) return "stable";
  // Winrate is the outcome that matters most — let it break ties.
  const wr = metrics.find((m) => m.key === "winrate");
  if (wr && wr.direction !== "flat") {
    if (wr.improving && regressed.length <= improved.length) return "improving";
    if (!wr.improving && improved.length <= regressed.length) return "declining";
  }
  if (improved.length >= moving * 0.7) return "improving";
  if (regressed.length >= moving * 0.7) return "declining";
  return "mixed";
}

function buildHeadline(
  trend: ProgressReport["trend"],
  improved: ProgressMetric[],
  regressed: ProgressMetric[],
  half: number
): string {
  const span = `últimas ${half} vs ${half} previas`;
  const best = improved[0];
  const worst = regressed[0];
  switch (trend) {
    case "improving":
      return best
        ? `Vas en subida (${span}): mejora clara en ${best.label}.`
        : `Vas en subida (${span}).`;
    case "declining":
      return worst
        ? `Bajón (${span}): cae ${worst.label}. Recupera ese hábito.`
        : `Bajón (${span}).`;
    case "mixed":
      return `Progreso mixto (${span}): sube ${improved[0]?.label ?? "algo"}, baja ${regressed[0]?.label ?? "algo"}.`;
    default:
      return `Estable (${span}): sin cambios claros. Fuerza una mejora deliberada.`;
  }
}

/** Compact, prompt-ready summary so the trends coach reasons over the direction
 *  of travel (am I improving?) instead of a single static snapshot. */
export function summarizeProgressForAi(report: ProgressReport): string {
  const rows = report.metrics.map((m) => `- ${m.display}`).join("\n");
  return `Evolución (${report.windowGames} partidas recientes vs ${report.windowGames} previas):\n${rows}\nTendencia general: ${report.trend}.`;
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
