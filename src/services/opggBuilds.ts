// Op.gg recommended builds — fetched on demand per champion+role via our
// Cloudflare Worker proxy. The worker parses op.gg's Python-repr response
// and returns clean JSON.
//
// Why op.gg builds vs our own SQLite aggregation:
//   - op.gg has MILLIONS of games per patch (we'd never match that)
//   - Already accounts for items in correct ORDER (1st, 2nd, 3rd item)
//   - Includes runes + skill order + counter info in one payload
//   - Updates each patch automatically
//
// We keep the SQLite aggregator as a fallback for when op.gg is down or
// for users who explicitly synced pro/SoloQ data.

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { getRiotProxyUrl } from "./riotApi";
import type { Role } from "../types/champion";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
const httpFetch: typeof fetch = (input, init) =>
  isTauri()
    ? (tauriFetch as unknown as typeof fetch)(input, init)
    : fetch(input, init);

export interface OpggBuildPath {
  ids: number[];
  names: string[];
  play: number;
  win: number;
  pickRate: number;
}

export interface OpggRunes {
  primaryPage: string;
  primaryRunes: string[];
  secondaryPage: string;
  secondaryRunes: string[];
  statMods: string[];
  play: number;
  pickRate: number;
}

export interface OpggSkills {
  order: string; // e.g. "QEWQQRQQEERWWE" (level 1-18)
  play: number;
  win: number;
  pickRate: number;
}

export interface OpggCounter {
  championId: number;
  name: string;
  play: number;
  win: number;
  winRate: number;
}

export interface OpggSummonerSpells {
  /** Two Riot summoner spell IDs (e.g. [4, 14] = Flash + Ignite). */
  ids: [number, number];
  pickRate: number;
  play: number;
  win: number;
  winRate: number;
}

/** Riot summoner spell ID → display name + Data Dragon icon filename. */
export const SUMMONER_SPELL_META: Record<number, { name: string; icon: string }> = {
  1: { name: "Cleanse", icon: "SummonerBoost.png" },
  3: { name: "Exhaust", icon: "SummonerExhaust.png" },
  4: { name: "Flash", icon: "SummonerFlash.png" },
  6: { name: "Ghost", icon: "SummonerHaste.png" },
  7: { name: "Heal", icon: "SummonerHeal.png" },
  11: { name: "Smite", icon: "SummonerSmite.png" },
  12: { name: "Teleport", icon: "SummonerTeleport.png" },
  13: { name: "Clarity", icon: "SummonerMana.png" },
  14: { name: "Ignite", icon: "SummonerDot.png" },
  21: { name: "Barrier", icon: "SummonerBarrier.png" },
  32: { name: "Mark", icon: "SummonerSnowball.png" },
};

export interface OpggBuild {
  /** Most popular full builds (top 3 paths). Each `names` is a 3-item core. */
  coreItems: OpggBuildPath[];
  /** Most popular boots */
  boots: OpggBuildPath[];
  /** Starter items (Doran's, pots) */
  starterItems: OpggBuildPath[];
  /** Most popular 4th item options */
  fourthItems: OpggBuildPath[];
  /** Most popular 5th item options */
  fifthItems: OpggBuildPath[];
  /** Most popular 6th item options (legendary) */
  sixthItems: OpggBuildPath[];
  /** Top rune pages */
  runes: OpggRunes[];
  /** Skill leveling order (top 3 variants) */
  skills: OpggSkills[];
  /** Champions this one beats (high winrate vs them) */
  strongCounters: OpggCounter[];
  /** Champions that beat this one (low winrate vs them) */
  weakCounters: OpggCounter[];
  /** Top summoner spell combo (op.gg gives one dominant pick). May be empty. */
  summonerSpells: OpggSummonerSpells[];
}

const cache = new Map<string, { ts: number; data: OpggBuild }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30min in-memory dedupe

/**
 * Fetch the recommended build for a champion + role.
 *
 * @param championName Data Dragon ID (e.g. "Aatrox" — op.gg uses uppercase)
 * @param role TOP / JUNGLE / MIDDLE / BOTTOM / UTILITY
 */
export async function fetchOpggBuild(
  championName: string,
  role: Role
): Promise<OpggBuild | null> {
  const cacheKey = `${championName}:${role}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const proxyUrl = getRiotProxyUrl();
  if (!proxyUrl) {
    // eslint-disable-next-line no-console
    console.warn("[opggBuilds] no proxy configured");
    return null;
  }

  // Op.gg position naming differs from Riot's slightly
  const opggPosition =
    role === "TOP" ? "TOP" :
    role === "JUNGLE" ? "JUNGLE" :
    role === "MIDDLE" ? "MID" :
    role === "BOTTOM" ? "ADC" :
    "SUPPORT";

  try {
    const url = `${proxyUrl}/opgg/build?champion=${encodeURIComponent(
      championName.toUpperCase()
    )}&role=${opggPosition}`;
    const res = await httpFetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error(`[opggBuilds] HTTP ${res.status} for ${cacheKey}`);
      return null;
    }
    const data = (await res.json()) as OpggBuild;
    cache.set(cacheKey, { ts: Date.now(), data });
    return data;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[opggBuilds] fetch failed:", e);
    return null;
  }
}

/**
 * Pick the OPTIMAL build path: highest winrate among options with a
 * statistically significant sample. Falls back to most-popular if all
 * options are below the sample threshold.
 *
 * "Optimal" ≠ "most popular". Popular options may include suboptimal
 * builds that newer players copy. Best-WR is what actually wins more.
 */
export function pickBestBuild(paths: OpggBuildPath[]): OpggBuildPath | null {
  if (paths.length === 0) return null;
  // Min sample threshold: 3% pickrate (significant enough to trust WR signal)
  const significant = paths.filter((p) => p.pickRate >= 0.03);
  if (significant.length === 0) {
    // No path meets threshold → fall back to highest pickrate (most popular)
    return paths.reduce((best, p) => (p.pickRate > best.pickRate ? p : best));
  }
  // Among significant options, pick the one with highest winrate
  return significant.reduce((best, p) => {
    const pWR = p.play > 0 ? p.win / p.play : 0;
    const bWR = best.play > 0 ? best.win / best.play : 0;
    return pWR > bWR ? p : best;
  });
}

/**
 * Pick the MOST POPULAR build (highest pickrate). Useful when showing
 * "what people are building" rather than "what wins most".
 */
export function pickMostPopular<T extends { pickRate: number }>(
  paths: T[]
): T | null {
  if (paths.length === 0) return null;
  return paths.reduce((best, p) => (p.pickRate > best.pickRate ? p : best));
}

/**
 * Return the single best (highest WR with sample) build for each slot.
 */
export function topBuild(build: OpggBuild): {
  starter: OpggBuildPath | null;
  boots: OpggBuildPath | null;
  core: OpggBuildPath | null;
  fourth: OpggBuildPath | null;
  fifth: OpggBuildPath | null;
  sixth: OpggBuildPath | null;
} {
  return {
    starter: pickBestBuild(build.starterItems),
    boots: pickBestBuild(build.boots),
    core: pickBestBuild(build.coreItems),
    fourth: pickBestBuild(build.fourthItems),
    fifth: pickBestBuild(build.fifthItems),
    sixth: pickBestBuild(build.sixthItems),
  };
}
