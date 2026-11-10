// Build for ONE matchup (my champion vs my lane opponent): the items, runes
// and spells players actually use in that matchup, plus op.gg's lane read.
// Served by our Cloudflare Worker from op.gg's public MCP server
// (lol_get_lane_matchup_guide). The generic build lives in opggBuilds.ts.
import { getRiotProxyUrl } from "./riotApi";
import type { Role } from "../types/champion";
import type { OpggBuildPath } from "./opggBuilds";
import { fetchProxyJson } from "./proxyFetch";

export interface MatchupRunePage {
  primaryStyle: number;
  subStyle: number;
  /** 4 primary + 2 secondary perk ids. */
  perks: number[];
  shards: number[];
  play: number;
  win: number;
  pickRate: number;
}

export interface MatchupBuild {
  /** Games / wins of my champion vs this opponent; null when op.gg has no row. */
  games: number | null;
  wins: number | null;
  /** op.gg's tip for playing against the opponent (in the requested language). */
  tip: string | null;
  /** Display name of the champion with the lane edge, as op.gg reports it. */
  laneAdvantage: string | null;
  soloKillAdvantage: string | null;
  playStyle: string | null;
  coreItems: OpggBuildPath[];
  boots: OpggBuildPath[];
  starterItems: OpggBuildPath[];
  runes: MatchupRunePage[];
  summonerSpells: Array<{ ids: [number, number]; play: number; win: number; pickRate: number }>;
}

export interface MatchupBuildResponse {
  champion: string;
  championName: string;
  role: string;
  opponent: string;
  opponentName: string;
  build: MatchupBuild | null;
}

const ROLE_TO_OPGG: Record<Role, string> = {
  TOP: "top",
  JUNGLE: "jungle",
  MIDDLE: "mid",
  BOTTOM: "adc",
  UTILITY: "support",
};

const cache = new Map<string, { ts: number; data: MatchupBuildResponse }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * @param championDdId Data Dragon id of my champion (e.g. "MonkeyKing")
 * @param opponentDdId Data Dragon id of the lane opponent
 * @returns the response (its `build` is null when op.gg has no data for the
 *   pair), or null when the request failed / no proxy is configured.
 */
export async function fetchMatchupBuild(
  championDdId: string,
  role: Role,
  opponentDdId: string,
  lang: "es" | "en"
): Promise<MatchupBuildResponse | null> {
  const key = `${championDdId}:${role}:${opponentDdId}:${lang}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;
  const proxyUrl = getRiotProxyUrl();
  if (!proxyUrl) return null;
  const url =
    `${proxyUrl}/opgg/matchup-build?champion=${encodeURIComponent(championDdId.toLowerCase())}` +
    `&role=${ROLE_TO_OPGG[role]}&opponent=${encodeURIComponent(opponentDdId.toLowerCase())}&lang=${lang}`;
  try {
    const data = await fetchProxyJson<MatchupBuildResponse>(url);
    cache.set(key, { ts: Date.now(), data });
    return data;
  } catch {
    // Optional extra on top of the generic build: stay quiet, show nothing.
    return null;
  }
}

/** Test-only: drop the in-memory cache. */
export function __clearMatchupBuildCache(): void {
  cache.clear();
}
