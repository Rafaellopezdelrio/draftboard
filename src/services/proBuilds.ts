// Pro builds (variant-clustered) for a champion+role. Sourced from u.gg's
// public GraphQL via our worker, which buckets the last ~20 pro matches
// into 2-3 archetype variants (bruiser vs tank vs damage, etc).
//
// Each variant carries the core 2-item pair, a representative full build,
// the list of pros that ran it, total games, and WR — letting the UI
// show "5 pros went Sundered → Voltaic" instead of one averaged blob.
import { getRiotProxyUrl } from "./riotApi";
import type { Role } from "../types/champion";
import { fetchProxyJson } from "./proxyFetch";import { emitFetchFailure } from "./fetchNotify";

export interface ProBuildVariant {
  /** "id1-id2" string of the core pair (sorted asc), e.g. "6610-6699". */
  key: string;
  corePair: [number, number];
  /** Full 6-item representative build for this variant. */
  representativeBuild: number[];
  games: number;
  wins: number;
  /** 0-1 fraction; 0% means all matches lost (yes, this happens). */
  winRate: number;
  proNames: string[];
}

export interface ProMatchRecent {
  proName: string;
  team: string | null;
  league: string | null;
  win: boolean;
  /** "K/D/A" formatted. */
  kda: string;
  opponentChampionId: number;
  finalBuild: number[];
  summonerSpells: number[];
  timestamp: number;
}

export interface ProBuildsResponse {
  championId: number;
  role: string;
  totalMatches: number;
  variants: ProBuildVariant[];
  recent: ProMatchRecent[];
}

const cache = new Map<string, { ts: number; data: ProBuildsResponse }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

const ROLE_TO_UGG: Record<Role, string> = {
  TOP: "top",
  JUNGLE: "jungle",
  MIDDLE: "mid",
  BOTTOM: "adc",
  UTILITY: "support",
};

/**
 * Fetch the clustered pro build variants for this champion+role.
 *
 * @param championId  Riot numeric champion id (e.g. 266 for Aatrox).
 * @param role        Our app's Role enum, mapped to u.gg's lowercase form.
 */
export async function fetchProBuilds(
  championId: number,
  role: Role
): Promise<ProBuildsResponse | null> {
  const cacheKey = `${championId}:${role}`;
  const c = cache.get(cacheKey);
  if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.data;

  const proxyUrl = getRiotProxyUrl();
  if (!proxyUrl) return null;

  const url =
    `${proxyUrl}/ugg/pro-builds?championId=${championId}` +
    `&role=${ROLE_TO_UGG[role]}`;
  try {
    // Worker → u.gg GraphQL → variant clustering. Flaky on cold start.
    // Retry 3x; 4xx aborts early (bad champ id / role).
    const data = await fetchProxyJson<ProBuildsResponse>(url);
    cache.set(cacheKey, { ts: Date.now(), data });
    return data;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[proBuilds] fetch failed after retries:", e);
    emitFetchFailure("Pro builds", e);
    return null;
  }
}
