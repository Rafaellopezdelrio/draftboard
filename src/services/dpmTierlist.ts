// dpm.lol tier list — via our Cloudflare Worker proxy. dpm.lol exposes a
// JSON API at /v1/tierlist that returns champions with a numeric tierScore
// and per-lane stats per rank bracket. Our worker (handleDpmTierList) applies
// dpm.lol's own bucketing rules (S+/S/A/B/C/D) and filters out off-meta
// noise (count <= 100), then we map the result back into the app's MetaTier
// shape using the same numeric-key convention as op.gg.
//
// Why dpm.lol: it's the only public tier list with per-bracket data from Iron
// to Challenger. op.gg's MCP only exposes plat+. Letting users pick their
// actual rank fixes the "Mel is mid in low elo but never in Challenger"
// problem that the plat+ aggregate can't solve.
import type { MetaTier, Role } from "../types/champion";
import { getRiotProxyUrl } from "./riotApi";
import { fetchProxyJson } from "./proxyFetch";import { emitFetchFailure } from "./fetchNotify";

export type DpmTier =
  | "all" | "iron" | "bronze" | "silver" | "silver_plus" | "gold" | "gold_plus"
  | "platinum" | "platinum_plus" | "emerald" | "emerald_plus" | "diamond"
  | "diamond_plus" | "master" | "master_plus" | "grandmaster" | "challenger";

export type DpmPlatform =
  | "euw1" | "kr" | "na1" | "eun1" | "br1" | "la1" | "la2" | "oc1"
  | "tr1" | "ru" | "jp1";

export type DpmTimeframe = "7days" | "30days";

/** Display labels (rendered in the rank selector). Order = dpm.lol's order. */
export const DPM_TIER_LABELS: Record<DpmTier, string> = {
  challenger: "Challenger",
  grandmaster: "Grandmaster",
  master_plus: "Master+",
  master: "Master",
  diamond_plus: "Diamond+",
  diamond: "Diamond",
  emerald_plus: "Emerald+",
  emerald: "Emerald",
  platinum_plus: "Platinum+",
  platinum: "Platinum",
  gold_plus: "Gold+",
  gold: "Gold",
  silver_plus: "Silver+",
  silver: "Silver",
  bronze: "Bronze",
  iron: "Iron",
  all: "All ranks",
};

export const DPM_TIER_ORDER: DpmTier[] = [
  "challenger", "grandmaster", "master_plus", "master",
  "diamond_plus", "diamond", "emerald_plus", "emerald",
  "platinum_plus", "platinum", "gold_plus", "gold",
  "silver_plus", "silver", "bronze", "iron", "all",
];

export const DPM_PLATFORM_LABELS: Record<DpmPlatform, string> = {
  euw1: "EUW", kr: "Korea", na1: "NA", eun1: "EUNE", br1: "Brazil",
  la1: "LAN", la2: "LAS", oc1: "OCE", tr1: "Turkey", ru: "Russia",
  jp1: "Japan",
};

interface DpmEntry {
  name: string;
  championId: number;
  role: Role;
  tier: "S+" | "S" | "A" | "B" | "C" | "D";
  tierScore: number;
  winRate: number;   // 0-1
  pickRate: number;  // 0-1
  banRate: number;   // 0-1
  count: number;
}

interface DpmResponse {
  tier: DpmTier;
  platform: DpmPlatform;
  timeframe: DpmTimeframe;
  totalMatches: number | null;
  entries: DpmEntry[];
}

/**
 * Fetch the dpm.lol tier list for a specific (tier, platform, timeframe)
 * bucket. Returns the app's MetaTier[] shape with championKey mapped from
 * the data-dragon ID via the passed lookup.
 *
 * Returns empty array on failure so the rest of the pipeline can fall back
 * to op.gg / our own aggregates without throwing.
 */
export async function fetchDpmMeta(
  tier: DpmTier,
  platform: DpmPlatform,
  timeframe: DpmTimeframe,
  nameToKey: Map<string, string>
): Promise<MetaTier[]> {
  const proxyUrl = getRiotProxyUrl();
  if (!proxyUrl) {
    // eslint-disable-next-line no-console
    console.warn("[dpm] no proxy configured — skipping");
    return [];
  }
  const url =
    `${proxyUrl}/dpm/tierlist?tier=${encodeURIComponent(tier)}` +
    `&platform=${encodeURIComponent(platform)}` +
    `&timeframe=${encodeURIComponent(timeframe)}`;
  try {
    // Retry 3x on transient errors — dpm.lol scraping via worker can flake
    // on cold starts. 4xx are programmer errors and stop retry early.
    const data = await fetchProxyJson<DpmResponse>(url);

    const out: MetaTier[] = [];
    let unknown = 0;
    for (const e of data.entries) {
      // dpm.lol uses data-dragon ID style names ("LeeSin", "MasterYi", "MonkeyKing"…)
      // — they match what fetchChampions() returns as `c.id`, so the
      // nameToKey lookup built in championDb covers them.
      const key = nameToKey.get(e.name);
      if (!key) {
        unknown++;
        continue;
      }
      out.push({
        championKey: key,
        role: e.role,
        tier: e.tier,
        winRate: e.winRate,
        pickRate: e.pickRate,
        banRate: e.banRate,
      });
    }
    // eslint-disable-next-line no-console
    console.log(
      `[dpm] ${tier}/${platform}/${timeframe}: ${out.length} entries` +
        (unknown > 0 ? ` (${unknown} unknown names)` : "") +
        (data.totalMatches ? ` — ${data.totalMatches.toLocaleString()} matches` : "")
    );
    return out;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[dpm] fetch failed:", e);
    emitFetchFailure("dpm.lol tier list", e);
    return [];
  }
}
