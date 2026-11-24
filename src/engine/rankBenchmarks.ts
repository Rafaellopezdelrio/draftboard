// Rank-relative benchmarks — compares your per-minute stats against an
// approximate baseline for your rank bracket + role. This is the "vs your rank"
// axis (op.gg/Mobalytics-style) that complements our self-relative leak engine
// (your wins vs losses). Baselines are curated approximations from public
// aggregate data — surfaced as estimates, never as exact truth.

import type { Role } from "../types/champion";
import { i18n } from "../i18n";

export type RankBracket =
  | "iron-silver"
  | "gold-plat"
  | "emerald-diamond"
  | "master-plus";

const TIER_BRACKET: Record<string, RankBracket> = {
  IRON: "iron-silver",
  BRONZE: "iron-silver",
  SILVER: "iron-silver",
  GOLD: "gold-plat",
  PLATINUM: "gold-plat",
  EMERALD: "emerald-diamond",
  DIAMOND: "emerald-diamond",
  MASTER: "master-plus",
  GRANDMASTER: "master-plus",
  CHALLENGER: "master-plus",
};

/** Map a Riot tier name to a bracket. Defaults to the median bracket so an
 *  unknown/unranked user still gets a meaningful (if generic) comparison. */
export function bracketForTier(tier: string | null | undefined): RankBracket {
  if (!tier) return "gold-plat";
  return TIER_BRACKET[tier.toUpperCase()] ?? "gold-plat";
}

/** Bracket name in the app language (trends.bracket.*). */
export function bracketLabel(b: RankBracket): string {
  return i18n.t(`trends.bracket.${b}`);
}

interface RoleBaseline {
  cspm: number;
  vspm: number;
  dpm: number; // deaths/min — lower is better
  kda: number;
}

// Per-minute medians per bracket. Gold-plat and master-plus were measured on
// 24/11 (38 Gold III lobbies and 40 Master+ EUW games, 50-80 players per
// role, the owner left out); emerald-diamond sits between the two, and
// iron-silver keeps the old gap to gold-plat (not measured).
const BASELINES: Record<RankBracket, Record<Role, RoleBaseline>> = {
  "iron-silver": {
    TOP: { cspm: 6, vspm: 0.64, dpm: 0.24, kda: 1.4 },
    JUNGLE: { cspm: 5.4, vspm: 0.71, dpm: 0.23, kda: 1.9 },
    MIDDLE: { cspm: 5.4, vspm: 0.52, dpm: 0.24, kda: 1.6 },
    BOTTOM: { cspm: 6.5, vspm: 0.54, dpm: 0.24, kda: 2.1 },
    UTILITY: { cspm: 1.1, vspm: 2.1, dpm: 0.27, kda: 2 },
  },
  "gold-plat": {
    TOP: { cspm: 7.1, vspm: 0.77, dpm: 0.21, kda: 1.8 },
    JUNGLE: { cspm: 6.4, vspm: 0.85, dpm: 0.2, kda: 2.3 },
    MIDDLE: { cspm: 6.4, vspm: 0.63, dpm: 0.21, kda: 2 },
    BOTTOM: { cspm: 7.7, vspm: 0.65, dpm: 0.21, kda: 2.5 },
    UTILITY: { cspm: 1.3, vspm: 2.5, dpm: 0.24, kda: 2.4 },
  },
  "emerald-diamond": {
    TOP: { cspm: 7.3, vspm: 0.77, dpm: 0.21, kda: 1.8 },
    JUNGLE: { cspm: 6.9, vspm: 0.86, dpm: 0.2, kda: 2.8 },
    MIDDLE: { cspm: 7, vspm: 0.69, dpm: 0.22, kda: 2.1 },
    BOTTOM: { cspm: 8, vspm: 0.67, dpm: 0.21, kda: 2.6 },
    UTILITY: { cspm: 1.2, vspm: 2.6, dpm: 0.23, kda: 2.6 },
  },
  "master-plus": {
    TOP: { cspm: 7.4, vspm: 0.77, dpm: 0.21, kda: 1.8 },
    JUNGLE: { cspm: 7.3, vspm: 0.86, dpm: 0.2, kda: 3.2 },
    MIDDLE: { cspm: 7.6, vspm: 0.74, dpm: 0.22, kda: 2.1 },
    BOTTOM: { cspm: 8.2, vspm: 0.68, dpm: 0.21, kda: 2.7 },
    UTILITY: { cspm: 1, vspm: 2.7, dpm: 0.22, kda: 2.8 },
  },
};

/** The raw per-minute baseline for a bracket+role. Exported so the GPI engine
 *  can score farming/vision against rank-appropriate targets. */
export function baselineFor(
  bracket: RankBracket,
  role: Role
): { cspm: number; vspm: number; dpm: number; kda: number } {
  return BASELINES[bracket][role];
}

/** Expected share of the team's champion damage per role. Shared by the
 *  post-game coach (damage-share insight) and the GPI aggression axis. */
export const DAMAGE_SHARE_TARGET: Record<string, number> = {
  TOP: 0.22,
  JUNGLE: 0.18,
  MIDDLE: 0.24,
  BOTTOM: 0.28,
  UTILITY: 0.1,
};

// Queues not played on Summoner's Rift, or SR modes where lane/vision/death
// rules make no sense: ARAM, Arena, URF, Nexus Blitz, Brawl, Swarm...
const NON_RIFT_QUEUES = new Set<number>([
  100, 450, 720, 900, 1010, 1300, 1700, 1710, 1810, 1820, 1830, 1840, 1900, 2300, 2400,
]);

/** True when a queue's games can be judged with Summoner's Rift lane rules. */
export function isRiftQueue(queueId: number): boolean {
  return !NON_RIFT_QUEUES.has(queueId);
}

export type BenchmarkKey = "cspm" | "vspm" | "dpm" | "kda";
export type BenchmarkVerdict = "above" | "at" | "below";

export interface Benchmark {
  key: BenchmarkKey;
  label: string;
  value: number;
  expected: number;
  /** Verdict in the GOOD direction (so high deaths reads "below"). */
  verdict: BenchmarkVerdict;
}

// Rank baselines are fuzzy — only call it above/below outside an 8% band.
const TOLERANCE = 0.08;

// Labels come from trends.metric.<key> when a benchmark is built.
const METRICS: Array<{
  key: BenchmarkKey;
  lowerIsBetter: boolean;
}> = [
  { key: "cspm", lowerIsBetter: false },
  { key: "vspm", lowerIsBetter: false },
  { key: "dpm", lowerIsBetter: true },
  { key: "kda", lowerIsBetter: false },
];

export interface BenchmarkInput {
  bracket: RankBracket;
  role: Role;
  cspm: number | null;
  vspm: number | null;
  dpm: number | null;
  kda: number | null;
}

/** Compare each provided stat to the bracket+role baseline. Skips metrics with
 *  no data (e.g. vision on pre-010 matches). */
export function benchmarkStats(input: BenchmarkInput): Benchmark[] {
  const base = BASELINES[input.bracket][input.role];
  const values: Record<BenchmarkKey, number | null> = {
    cspm: input.cspm,
    vspm: input.vspm,
    dpm: input.dpm,
    kda: input.kda,
  };
  const out: Benchmark[] = [];
  for (const m of METRICS) {
    const value = values[m.key];
    if (value == null) continue;
    const expected = base[m.key];
    const ratio = expected === 0 ? 1 : value / expected;
    let verdict: BenchmarkVerdict;
    if (Math.abs(ratio - 1) <= TOLERANCE) {
      verdict = "at";
    } else if (m.lowerIsBetter) {
      verdict = value < expected ? "above" : "below";
    } else {
      verdict = value > expected ? "above" : "below";
    }
    out.push({ key: m.key, label: i18n.t(`trends.metric.${m.key}`), value, expected, verdict });
  }
  return out;
}
