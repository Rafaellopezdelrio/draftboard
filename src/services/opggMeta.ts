// op.gg tier list — via our Cloudflare Worker proxy (which calls the public
// op.gg MCP server, parses the Python-repr response, returns clean JSON).
//
// Why through the proxy: Tauri's HTTP plugin had issues with op.gg's MCP
// (chunked transfer + JSON-RPC). The CF Worker handles all that complexity
// server-side and returns simple JSON. Plus edge caching makes it fast.
import type { MetaTier, Role } from "../types/champion";
import { getRiotProxyUrl } from "./riotApi";
import { fetchProxyJson } from "./proxyFetch";
import { trackFetch } from "./breadcrumbs";
import { emitFetchFailure } from "./fetchNotify";

interface OpggLaneEntry {
  name: string;
  tier: "S" | "A" | "B" | "C" | "D";
  winRate: number;
  pickRate: number;
  banRate: number;
  kda: number;
  rank: number;
}

interface OpggTierListResponse {
  top: OpggLaneEntry[];
  mid: OpggLaneEntry[];
  jungle: OpggLaneEntry[];
  adc: OpggLaneEntry[];
  support: OpggLaneEntry[];
}

const LANE_TO_ROLE: Record<keyof OpggTierListResponse, Role> = {
  top: "TOP",
  mid: "MIDDLE",
  jungle: "JUNGLE",
  adc: "BOTTOM",
  support: "UTILITY",
};

/**
 * Fetch the full tier list (all 5 roles in one request) via our CF Worker
 * proxy. Maps champion names → numeric Riot keys using the passed map.
 *
 * Returns empty array on failure (silent fallback to other sources).
 */
export async function fetchOpggMetaAllRoles(
  nameToKey: Map<string, string>
): Promise<MetaTier[]> {
  const proxyUrl = getRiotProxyUrl();
  if (!proxyUrl) {
    // eslint-disable-next-line no-console
    console.warn("[opgg] no proxy configured — skipping tier list fetch");
    return [];
  }
  const url = `${proxyUrl}/opgg/tierlist`;
  try {
    // Retry 3x with exp backoff — Cloudflare workers can briefly 5xx
    // during cold starts or origin restarts. A single bad attempt would
    // empty the entire tier-list panel; the wrapped call gives us three
    // honest tries before falling back to the next meta source.
    const data = await fetchProxyJson<OpggTierListResponse>(url);
    const result: MetaTier[] = [];
    let unknownCount = 0;
    for (const laneKey of Object.keys(LANE_TO_ROLE) as Array<keyof OpggTierListResponse>) {
      const role = LANE_TO_ROLE[laneKey];
      const entries = data[laneKey] ?? [];
      for (const e of entries) {
        const key = nameToKey.get(e.name);
        if (!key) {
          unknownCount++;
          continue;
        }
        result.push({
          championKey: key,
          role,
          tier: e.tier,
          winRate: e.winRate,
          pickRate: e.pickRate,
          banRate: e.banRate,
        });
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[opgg] loaded ${result.length} tier entries (${unknownCount} unknown names; worker pre-filtered off-meta picks)`
    );
    if (result.length === 0) {
      // HTTP 200 but 0 parsed entries = op.gg changed the Positions(...) tuple
      // shape and our parser missed. championDb will silently fall back to
      // another meta source; breadcrumb so telemetry reveals the break instead
      // of the user just getting quietly worse data.
      trackFetch("opgg meta", "fail", "scraper 200 but 0 tier entries (op.gg layout change?)");
    }
    return result;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[opgg] fetch failed:", e);
    // Notify the UI so the user sees a toast instead of a silently empty
    // tier list panel. emitFetchFailure throttles per-source so an
    // outage doesn't spam toasts.
    emitFetchFailure("op.gg meta", e);
    return [];
  }
}

/** Longest wait for the per-rank list. A rank the server has not stored yet
 * takes it 12-20 s to build (op.gg slows down under the burst); after that it
 * answers at once. */
export const OPGG_RANK_TIMEOUT_MS = 25_000;

interface OpggRankLaneResponse {
  champions?: Array<OpggLaneEntry & { games: number }>;
}

/**
 * Tier list for ONE rank bracket (op.gg tier names: "gold", "emerald_plus"…).
 * One request per lane — the worker asks op.gg champion by champion, a lane
 * at a time. All five lanes or nothing: a list with a lane missing would look
 * complete and be wrong, so on any gap, failure or timeout this returns []
 * and the caller falls back to the general list.
 */
export async function fetchOpggMetaForRank(
  tier: string,
  nameToKey: Map<string, string>
): Promise<MetaTier[]> {
  const proxyUrl = getRiotProxyUrl();
  if (!proxyUrl) return [];
  const lanes = Object.keys(LANE_TO_ROLE) as Array<keyof OpggTierListResponse>;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const all = Promise.all(
      lanes.map((lane) =>
        fetchProxyJson<OpggRankLaneResponse>(
          `${proxyUrl}/opgg/tierlist-rank?tier=${encodeURIComponent(tier)}&lane=${lane}`
        )
      )
    );
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), OPGG_RANK_TIMEOUT_MS);
    });
    const data = await Promise.race([all, timeout]);
    const result: MetaTier[] = [];
    for (let i = 0; i < lanes.length; i++) {
      const rows = data[i].champions ?? [];
      if (rows.length === 0) return [];
      for (const e of rows) {
        const key = nameToKey.get(e.name);
        if (!key) continue;
        result.push({
          championKey: key,
          role: LANE_TO_ROLE[lanes[i]],
          tier: e.tier,
          winRate: e.winRate,
          pickRate: e.pickRate,
          banRate: e.banRate,
          games: e.games,
        });
      }
    }
    return result;
  } catch (e) {
    // Quiet: the general list takes over and the screen says so.
    trackFetch("opgg rank meta", "fail", String(e).slice(0, 120));
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}
