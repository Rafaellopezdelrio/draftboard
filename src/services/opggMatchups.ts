// Full matchup grid for a champion+role — every opponent with real play
// counts and WR. Scraped via our Cloudflare Worker from op.gg's counter
// page, which inlines a Next.js stream that contains the complete data.
//
// Why this exists: op.gg's MCP only returns top 3 strong + top 3 weak
// counters. For features like "live WR vs the actual enemy laner in your
// draft" we need the FULL grid. This service is the entry point.

import { httpFetch } from "./httpClient";
import { getRiotProxyUrl } from "./riotApi";
import type { Role } from "../types/champion";
import { withRetry, RateLimitError, throwIfRateLimited } from "./retry";
import { trackFetch } from "./breadcrumbs";
import { emitFetchFailure } from "./fetchNotify";

export interface OpggMatchup {
  play: number;
  win: number;
  winRate: number;          // 0-100, as op.gg gives it
  championKey: string;      // op.gg internal slug, e.g. "leesin"
  championName: string;     // display name, e.g. "Lee Sin"
  imageUrl?: string;
}

export interface OpggMatchupResponse {
  champion: string;
  role: string;
  tier: string;
  matchups: OpggMatchup[];
  count: number;
}

const cache = new Map<string, { ts: number; data: OpggMatchup[] }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

const ROLE_TO_OPGG: Record<Role, string> = {
  TOP: "top",
  JUNGLE: "jungle",
  MIDDLE: "mid",
  BOTTOM: "adc",
  UTILITY: "support",
};

/**
 * Map the player's solo-queue tier (LCU `rank.tier`, e.g. "GOLD", "DIAMOND")
 * to the op.gg matchup bracket. op.gg's `_plus` buckets aggregate "that tier
 * and above" — the most relevant *and* well-sampled matchup data for the
 * player's own elo (every bracket iron→diamond carries 10k+ games). Bounds:
 *   - Floor silver_plus: op.gg has no iron/bronze `_plus` bucket and their raw
 *     brackets are thin.
 *   - Cap diamond_plus: master+ brackets thin to ~2k games and get noisy, so
 *     diamond_plus's richer sample is the better signal up there.
 *   - Unknown / unranked → emerald_plus (the proven neutral default).
 * Keeping data tier-relevant matters: a champ's matchups genuinely differ by
 * elo, so a Gold player gets Gold+ numbers instead of a flat Emerald+ view.
 */
const RANK_TO_OPGG_TIER: Record<string, string> = {
  IRON: "silver_plus",
  BRONZE: "silver_plus",
  SILVER: "silver_plus",
  GOLD: "gold_plus",
  PLATINUM: "platinum_plus",
  EMERALD: "emerald_plus",
  DIAMOND: "diamond_plus",
  MASTER: "diamond_plus",
  GRANDMASTER: "diamond_plus",
  CHALLENGER: "diamond_plus",
};

export function opggTierForRank(rankTier?: string | null): string {
  if (!rankTier) return "emerald_plus";
  const tier = rankTier.toUpperCase().split(/\s+/)[0]; // "DIAMOND II" → "DIAMOND"
  return RANK_TO_OPGG_TIER[tier] ?? "emerald_plus";
}

/**
 * Fetch all matchups for `championDdId` in `role` at `tier`. Returns an
 * empty array if the proxy is unreachable or op.gg returned nothing —
 * never throws.
 *
 * @param championDdId Data Dragon ID e.g. "Aatrox", "LeeSin" — the
 *   service lowercases it for op.gg's URL convention.
 * @param tier op.gg tier slug, e.g. "emerald_plus", "challenger", "all".
 */
export async function fetchOpggMatchups(
  championDdId: string,
  role: Role,
  tier: string = "emerald_plus"
): Promise<OpggMatchup[]> {
  const cacheKey = `${championDdId}:${role}:${tier}`;
  const c = cache.get(cacheKey);
  if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.data;

  const proxyUrl = getRiotProxyUrl();
  if (!proxyUrl) {
    // eslint-disable-next-line no-console
    console.warn("[opggMatchups] no proxy configured");
    return [];
  }

  const url =
    `${proxyUrl}/opgg/matchups?champion=${encodeURIComponent(championDdId.toLowerCase())}` +
    `&role=${ROLE_TO_OPGG[role]}` +
    `&tier=${encodeURIComponent(tier)}`;
  try {
    // Worker scrapes op.gg's counter page (Next.js streaming chunk).
    // Cold-start 5xx happens; 4xx (bad champ slug) doesn't retry.
    const data = await withRetry(
      async () => {
        const res = await httpFetch(url, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        throwIfRateLimited(res, url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        trackFetch(url, "ok");
        return (await res.json()) as OpggMatchupResponse;
      },
      {
        attempts: 3,
        baseDelayMs: 500,
        // Allow 429 retries via RateLimitError + Retry-After. Other 4xx
        // are non-retriable.
        shouldRetry: (err) => {
          if (err instanceof RateLimitError) return true;
          return !String((err as Error)?.message ?? "").match(/HTTP 4\d\d/);
        },
        onRetry: (e, n) =>
          trackFetch(url, "fail", `attempt ${n}: ${String(e).slice(0, 80)}`),
      }
    );
    const matchups = data.matchups ?? [];
    if (matchups.length === 0) {
      // HTTP 200 but zero matchups = op.gg changed their page structure and
      // our anchor/parse missed (a "soft" scraper break, not a network
      // error). Breadcrumb it so telemetry shows the breakage, and DON'T
      // cache the empty result — otherwise a transient miss serves dead data
      // for the full 30min TTL. Next call retries.
      trackFetch(url, "fail", "scraper 200 but 0 matchups (op.gg layout change?)");
      return [];
    }
    cache.set(cacheKey, { ts: Date.now(), data: matchups });
    return matchups;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[opggMatchups] fetch failed after retries:", e);
    emitFetchFailure("op.gg matchups", e);
    return [];
  }
}

/**
 * Resolve a matchup by op.gg slug ("leesin") into the entry. Case-insensitive.
 */
export function findMatchup(
  matchups: OpggMatchup[],
  opggKey: string
): OpggMatchup | null {
  const lower = opggKey.toLowerCase();
  return (
    matchups.find((m) => m.championKey.toLowerCase() === lower) ?? null
  );
}

/**
 * Convert a Data Dragon champion id to op.gg's slug. op.gg slugs are the
 * lowercased DDragon id with no separators — which already matches every
 * champion, INCLUDING the tricky ones (MonkeyKing→monkeyking, KSante→ksante,
 * Kaisa→kaisa). The map below is kept as an explicit allow-list of the
 * verified-tricky ids so a future op.gg rename is caught here, not silently.
 *
 * NB: op.gg uses "monkeyking" (Wukong's internal id), NOT the display
 * "wukong" — /champions/wukong 404s. An earlier mapping had this inverted,
 * which silently zeroed every Wukong matchup. See opggMatchups.test.ts.
 */
export function ddIdToOpggKey(ddId: string): string {
  const lower = ddId.toLowerCase();
  const special: Record<string, string> = {
    monkeyking: "monkeyking",
    belveth: "belveth",
    chogath: "chogath",
    khazix: "khazix",
    kogmaw: "kogmaw",
    velkoz: "velkoz",
    reksai: "reksai",
    drmundo: "drmundo",
    jarvaniv: "jarvaniv",
    missfortune: "missfortune",
    masteryi: "masteryi",
    aurelionsol: "aurelionsol",
    tahmkench: "tahmkench",
    twistedfate: "twistedfate",
    xinzhao: "xinzhao",
    leesin: "leesin",
    leblanc: "leblanc",
    kaisa: "kaisa",
    ksante: "ksante",
    nunu: "nunu",
  };
  return special[lower] ?? lower;
}
