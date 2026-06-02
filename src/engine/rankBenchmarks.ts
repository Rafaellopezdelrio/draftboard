// Rank-relative benchmarks — compares your per-minute stats against an
// approximate baseline for your rank bracket + role. This is the "vs your rank"
// axis (op.gg/Mobalytics-style) that complements our self-relative leak engine
// (your wins vs losses). Baselines are curated approximations from public
// aggregate data — surfaced as estimates, never as exact truth.

import type { Role } from "../types/champion";

export type RankBracket =
  | "iron-silver"
  | "gold-plat"
  | "emerald-diamond"
  | "master-plus";

const BRACKET_LABEL: Record<RankBracket, string> = {
  "iron-silver": "Iron–Silver",
  "gold-plat": "Gold–Plat",
  "emerald-diamond": "Emerald–Diamond",
  "master-plus": "Master+",
};

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

export function bracketLabel(b: RankBracket): string {
  return BRACKET_LABEL[b];
}

interface RoleBaseline {
  cspm: number;
  vspm: number;
  dpm: number; // deaths/min — lower is better
  kda: number;
}

// Approximate per-minute baselines. Numbers rise with bracket; supports trade
// CS for vision. Tuned to feel right, not to be exact — labeled as estimates.
const BASELINES: Record<RankBracket, Record<Role, RoleBaseline>> = {
  "iron-silver": {
    TOP: { cspm: 5.5, vspm: 0.5, dpm: 0.3, kda: 1.8 },
    JUNGLE: { cspm: 4.5, vspm: 0.7, dpm: 0.32, kda: 1.9 },
    MIDDLE: { cspm: 5.8, vspm: 0.55, dpm: 0.3, kda: 2.0 },
    BOTTOM: { cspm: 6.0, vspm: 0.5, dpm: 0.28, kda: 2.0 },
    UTILITY: { cspm: 1.0, vspm: 1.3, dpm: 0.32, kda: 1.9 },
  },
  "gold-plat": {
    TOP: { cspm: 6.5, vspm: 0.6, dpm: 0.27, kda: 2.2 },
    JUNGLE: { cspm: 5.2, vspm: 0.85, dpm: 0.28, kda: 2.3 },
    MIDDLE: { cspm: 6.8, vspm: 0.65, dpm: 0.27, kda: 2.4 },
    BOTTOM: { cspm: 7.0, vspm: 0.55, dpm: 0.25, kda: 2.4 },
    UTILITY: { cspm: 1.2, vspm: 1.6, dpm: 0.28, kda: 2.3 },
  },
  "emerald-diamond": {
    TOP: { cspm: 7.2, vspm: 0.7, dpm: 0.24, kda: 2.6 },
    JUNGLE: { cspm: 5.8, vspm: 1.0, dpm: 0.25, kda: 2.7 },
    MIDDLE: { cspm: 7.5, vspm: 0.75, dpm: 0.24, kda: 2.8 },
    BOTTOM: { cspm: 7.8, vspm: 0.6, dpm: 0.23, kda: 2.8 },
    UTILITY: { cspm: 1.3, vspm: 1.9, dpm: 0.25, kda: 2.7 },
  },
  "master-plus": {
    TOP: { cspm: 7.8, vspm: 0.8, dpm: 0.22, kda: 3.0 },
    JUNGLE: { cspm: 6.2, vspm: 1.15, dpm: 0.23, kda: 3.1 },
    MIDDLE: { cspm: 8.0, vspm: 0.85, dpm: 0.22, kda: 3.2 },
    BOTTOM: { cspm: 8.3, vspm: 0.65, dpm: 0.21, kda: 3.2 },
    UTILITY: { cspm: 1.4, vspm: 2.1, dpm: 0.23, kda: 3.1 },
  },
};

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

const METRICS: Array<{
  key: BenchmarkKey;
  label: string;
  lowerIsBetter: boolean;
}> = [
  { key: "cspm", label: "CS/min", lowerIsBetter: false },
  { key: "vspm", label: "Visión/min", lowerIsBetter: false },
  { key: "dpm", label: "Muertes/min", lowerIsBetter: true },
  { key: "kda", label: "KDA", lowerIsBetter: false },
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
    out.push({ key: m.key, label: m.label, value, expected, verdict });
  }
  return out;
}
