import type { MatchRow } from "../services/matchRepo";
import { i18n } from "../i18n";

const metricName = (key: string): string => i18n.t(`trends.metric.${key}`);

export interface Trend {
  metric: string;
  current: number;
  previous: number;
  delta: number;
  direction: "up" | "down" | "flat";
  insight: string;
  severity: "good" | "warn" | "bad" | "info";
}

export function computeTrends(matches: MatchRow[]): Trend[] {
  if (matches.length < 6) return [];
  const half = Math.floor(matches.length / 2);
  const recent = matches.slice(0, half);
  const earlier = matches.slice(half, half * 2);
  const out: Trend[] = [];

  // Winrate trend
  out.push(
    diff(metricName("winrate"), winrate(recent), winrate(earlier), {
      goodIfUp: true,
      formatter: (v) => `${(v * 100).toFixed(0)}%`,
      threshold: 0.05,
    })
  );

  // KDA
  out.push(
    diff(metricName("kda"), avgKda(recent), avgKda(earlier), {
      goodIfUp: true,
      formatter: (v) => v.toFixed(2),
      threshold: 0.3,
    })
  );

  // Deaths/min
  out.push(
    diff(metricName("dpm"), avgDeathsPerMin(recent), avgDeathsPerMin(earlier), {
      goodIfUp: false,
      formatter: (v) => v.toFixed(2),
      threshold: 0.05,
    })
  );

  // CS/min (excluding utility)
  const recentDps = recent.filter((m) => m.position !== "UTILITY");
  const earlierDps = earlier.filter((m) => m.position !== "UTILITY");
  if (recentDps.length > 0 && earlierDps.length > 0) {
    out.push(
      diff(metricName("cspm"), avgCspm(recentDps), avgCspm(earlierDps), {
        goodIfUp: true,
        formatter: (v) => v.toFixed(1),
        threshold: 0.5,
      })
    );
  }

  return out;
}

interface DiffOpts {
  goodIfUp: boolean;
  formatter: (v: number) => string;
  threshold: number;
}

function diff(
  metric: string,
  current: number,
  previous: number,
  opts: DiffOpts
): Trend {
  const delta = current - previous;
  const meaningful = Math.abs(delta) >= opts.threshold;
  const direction: Trend["direction"] = !meaningful
    ? "flat"
    : delta > 0
      ? "up"
      : "down";
  let severity: Trend["severity"] = "info";
  let insight = i18n.t("trends.trendText.flat", {
    metric,
    now: opts.formatter(current),
    before: opts.formatter(previous),
  });
  if (meaningful) {
    const isGood = (delta > 0) === opts.goodIfUp;
    severity = isGood ? "good" : "warn";
    const arrow = delta > 0 ? "↑" : "↓";
    insight = i18n.t(isGood ? "trends.trendText.better" : "trends.trendText.worse", {
      metric,
      arrow,
      now: opts.formatter(current),
    });
  }
  return { metric, current, previous, delta, direction, insight, severity };
}

function winrate(ms: MatchRow[]): number {
  if (ms.length === 0) return 0;
  return ms.filter((m) => m.win).length / ms.length;
}
function avgKda(ms: MatchRow[]): number {
  if (ms.length === 0) return 0;
  const sum = ms.reduce(
    (a, m) => a + (m.kills + m.assists) / Math.max(1, m.deaths),
    0
  );
  return sum / ms.length;
}
function avgDeathsPerMin(ms: MatchRow[]): number {
  if (ms.length === 0) return 0;
  const sum = ms.reduce((a, m) => a + m.deaths / (m.durationSec / 60), 0);
  return sum / ms.length;
}
function avgCspm(ms: MatchRow[]): number {
  if (ms.length === 0) return 0;
  const sum = ms.reduce((a, m) => a + m.cs / (m.durationSec / 60), 0);
  return sum / ms.length;
}

export interface WeakestArea {
  category: string;
  detail: string;
}

export function detectWeakestArea(matches: MatchRow[]): WeakestArea | null {
  if (matches.length < 5) return null;
  const dps = matches.filter((m) => m.position !== "UTILITY");
  // Junglers farm camps, not waves: their baseline sits about 1 CS/min lower.
  const cspmTarget =
    dps.reduce((a, m) => a + (m.position === "JUNGLE" ? 4.5 : 5.5), 0) /
    Math.max(1, dps.length);
  if (dps.length >= 5 && avgCspm(dps) < cspmTarget) {
    return {
      category: i18n.t("trends.weak.farming"),
      detail: i18n.t("trends.weak.farmingDetail", { v: avgCspm(dps).toFixed(1) }),
    };
  }
  if (avgKda(matches) < 1.5) {
    return {
      category: i18n.t("trends.weak.deaths"),
      detail: i18n.t("trends.weak.kdaDetail", { v: avgKda(matches).toFixed(2) }),
    };
  }
  if (avgDeathsPerMin(matches) > 0.3) {
    return {
      category: i18n.t("trends.weak.deaths"),
      detail: i18n.t("trends.weak.dpmDetail", { v: avgDeathsPerMin(matches).toFixed(2) }),
    };
  }
  return null;
}
