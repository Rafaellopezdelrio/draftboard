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

// Keep the parser exported for tests (still used in test suite to validate
// the worker's parser logic locally).
// NOTE: this is now legacy — the production code path doesn't use it.
// It's here purely so existing tests continue to validate the parsing logic.
export function parseOpggResponse(text: string, role: Role): MetaTier[] {
  const positionsStart = text.indexOf("Positions(");
  if (positionsStart < 0) return [];
  const contentStart = positionsStart + "Positions(".length;
  const contentEnd = findMatchingParen(text, contentStart - 1);
  if (contentEnd < 0) return [];
  const positionsContent = text.slice(contentStart, contentEnd);
  const lanes = splitTopLevelLanes(positionsContent);
  if (lanes.length < 5) return [];
  const roleIndex =
    role === "TOP" ? 0 :
    role === "MIDDLE" ? 1 :
    role === "JUNGLE" ? 2 :
    role === "BOTTOM" ? 3 : 4;
  const laneContent = lanes[roleIndex];
  const entries: MetaTier[] = [];
  const entryRegex = /\w+\("([^"]+)",(true|false),([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = entryRegex.exec(laneContent)) !== null) {
    const fields = m[3].split(",").map((s) => s.trim());
    if (fields.length < 11) continue;
    const winRate = parseFloat(fields[3]);
    const pickRate = parseFloat(fields[4]);
    const banRate = parseFloat(fields[6]);
    const tierNum = parseInt(fields[8], 10);
    // Tier mapping calibrated against Mobalytics' tier distribution.
    // op.gg internal: 0=OP, 1=S, 2=top-A, 3=A, 4=B, 5=C.
    // We collapse 0+1+2 → S so the S row has ~10-12 champs per role (matches
    // mobalytics high-elo S volume).
    const tier: MetaTier["tier"] =
      tierNum <= 2 ? "S" :
      tierNum === 3 ? "A" :
      tierNum === 4 ? "B" :
      tierNum === 5 ? "C" : "D";
    entries.push({
      championKey: m[1],
      role,
      tier,
      winRate: isFinite(winRate) ? winRate : 0.5,
      pickRate: isFinite(pickRate) ? pickRate : 0,
      banRate: isFinite(banRate) ? banRate : 0,
    });
  }
  return entries;
}

function findMatchingParen(text: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevelLanes(content: string): string[] {
  const lanes: string[] = [];
  let depth = 0;
  let laneStart = -1;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (c === "[") {
      if (depth === 0) laneStart = i + 1;
      depth++;
    } else if (c === "]") {
      depth--;
      if (depth === 0 && laneStart >= 0) {
        lanes.push(content.slice(laneStart, i));
        laneStart = -1;
      }
    } else if (c === "(") depth++;
    else if (c === ")") depth--;
  }
  return lanes;
}
