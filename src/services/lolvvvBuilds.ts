// Pro-player builds from lolvvv.com, via our worker (which scrapes the
// champion's public build page). Pro accounts' soloQ (KR / EUW / NA) +
// esports games over the last ~5 patches: one rune page ready to apply,
// skill order, first three items, boots, starter and spells.
//
// lolvvv only server-renders the champion's PRIMARY position, so `role`
// says which role the data is for — callers hide it on off-role picks.
import { getRiotProxyUrl } from "./riotApi";
import { fetchProxyJson } from "./proxyFetch";
import { emitFetchFailure } from "./fetchNotify";
import type { Role } from "../types/champion";

export interface LolvvvPick {
  pickRate: number;
}

export interface LolvvvBuild {
  championId: number;
  role: Role;
  games: number;
  /** Platform ids ("KR", "EUW1", "NA1", "ESPORT") with their game counts. */
  regions: { id: string; games: number }[];
  spells: ({ ids: [number, number] } & LolvvvPick) | null;
  /** First ten level-ups, e.g. "QEWQQRQEQE". */
  skillOrder: string;
  /** Max priority without the ult, e.g. "QEW". */
  skillMax: string;
  starter: ({ ids: number[] } & LolvvvPick) | null;
  /** Most-bought 1st, 2nd and 3rd completed item. */
  items: ({ id: number } & LolvvvPick)[];
  boots: ({ id: number } & LolvvvPick) | null;
  runePage:
    | ({ primaryStyleId: number; subStyleId: number; selectedPerkIds: number[] } & LolvvvPick)
    | null;
}

const cache = new Map<string, { ts: number; data: LolvvvBuild }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Fetch lolvvv's pro build for a champion.
 *
 * @param championId DDragon id (e.g. "Aatrox", "MonkeyKing").
 */
export async function fetchLolvvvBuild(championId: string): Promise<LolvvvBuild | null> {
  const c = cache.get(championId);
  if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.data;

  const proxyUrl = getRiotProxyUrl();
  if (!proxyUrl) return null;

  const url = `${proxyUrl}/lolvvv/build?champion=${encodeURIComponent(championId)}`;
  try {
    const data = await fetchProxyJson<LolvvvBuild>(url);
    cache.set(championId, { ts: Date.now(), data });
    return data;
  } catch (e) {
    // 404 = no pro games for this champion — an empty state, not a failure.
    if (String((e as Error)?.message ?? "").includes("HTTP 404")) return null;
    // eslint-disable-next-line no-console
    console.error("[lolvvv] fetch failed after retries:", e);
    emitFetchFailure("lolvvv pro builds", e);
    return null;
  }
}
