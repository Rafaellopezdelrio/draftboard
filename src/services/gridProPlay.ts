// Official pro games from Riot Games Open Access powered by GRID, through
// Draftboard's server (which holds the GRID key). Non-commercial data.
//
// GRID's Open Access gives drafts and winners but not lane positions, so each
// team's five champions are assigned to roles with the same best-fit used for
// enemy drafts (inferEnemyRoles).

import { httpFetch } from "./httpClient";
import { fetchProxyJson } from "./proxyFetch";
import { getRiotProxyUrl } from "./riotApi";
import { inferEnemyRoles } from "../data/matchupTips";
import type { ChampionDb, Role } from "../types/champion";

interface GridSeriesList {
  total: number;
  next: string | null;
  series: Array<{ id: string; startsAt: string | null; tournament: string | null }>;
}
interface GridSeriesState {
  id: string;
  finished: boolean;
  games: Array<{ n: number; teams: Array<{ name: string | null; won: boolean; picks: string[]; bans: string[] }> }>;
}

export interface ProPick {
  gameId: string;
  championKey: string;
  role: Role;
  win: boolean;
}
export interface ProGames {
  picks: ProPick[];
  /** championKey → games it was banned in. */
  bans: Map<string, number>;
  games: number;
}

/** Series per sync: bounds the run (and the load on GRID) on a busy month. */
const MAX_SERIES = 250;
/** Spacing between series requests; the server allows 120 requests a minute. */
const SERIES_GAP_MS = 600;

/** "Kai'Sa", "Dr. Mundo", "Nunu & Willump" and "KaiSa" all match. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function championLookup(db: ChampionDb): (name: string) => string | null {
  const byName = new Map<string, string>();
  for (const c of Object.values(db.champions)) {
    byName.set(norm(c.name), c.key);
    byName.set(norm(c.id), c.key);
  }
  // Names GRID/Riot use that match neither DDragon's name nor its id.
  const alias: Record<string, string> = { nunu: "nunuwillump", renataglasc: "renata", wukong: "monkeyking" };
  return (name) => {
    const n = norm(name);
    return byName.get(n) ?? byName.get(alias[n] ?? "") ?? null;
  };
}

/** One GRID series → picks with roles + ban counts. Pure; exported for tests. */
export function readSeries(
  db: ChampionDb,
  state: GridSeriesState,
  find: (name: string) => string | null,
  into: ProGames
): void {
  for (const g of state.games) {
    const gameId = `GRID_${state.id}_${g.n}`;
    let used = false;
    const banned = new Set<string>();
    for (const team of g.teams) {
      const keys = team.picks.map(find);
      const roles = inferEnemyRoles(keys.map((k) => (k ? db.champions[k]?.id : null)));
      keys.forEach((key, i) => {
        const role = roles[i];
        if (!key || !role) return;
        into.picks.push({ gameId, championKey: key, role, win: team.won });
        used = true;
      });
      for (const b of team.bans) {
        const key = find(b);
        if (key) banned.add(key);
      }
    }
    if (!used) continue;
    into.games++;
    for (const key of banned) into.bans.set(key, (into.bans.get(key) ?? 0) + 1);
  }
}

/**
 * Pro games of the last `daysBack` days. Returns null when GRID isn't
 * available (no server, key not set up yet, GRID down) so the caller can use
 * its other source.
 */
export async function fetchGridProGames(
  db: ChampionDb,
  daysBack: number,
  onProgress: (done: number, total: number) => void,
  now: number = Date.now()
): Promise<ProGames | null> {
  const proxy = getRiotProxyUrl();
  if (!proxy) return null;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19) + "Z";
  const window = `from=${iso(now - daysBack * 86_400_000)}&to=${iso(now)}`;

  const ids: string[] = [];
  let after: string | null = null;
  try {
    do {
      const url: string = `${proxy}/grid/series?${window}${after ? `&after=${encodeURIComponent(after)}` : ""}`;
      // One plain attempt: "not set up" (503) must not be retried three times.
      const res = await httpFetch(url, { method: "GET", headers: { Accept: "application/json" } });
      if (!res.ok) return ids.length > 0 ? await readAll() : null;
      const page = (await res.json()) as GridSeriesList;
      ids.push(...page.series.map((s) => s.id));
      after = page.next;
    } while (after && ids.length < MAX_SERIES);
  } catch {
    if (ids.length === 0) return null;
  }
  return readAll();

  async function readAll(): Promise<ProGames | null> {
    const out: ProGames = { picks: [], bans: new Map(), games: 0 };
    const find = championLookup(db);
    const list = ids.slice(0, MAX_SERIES);
    for (let i = 0; i < list.length; i++) {
      onProgress(i, list.length);
      try {
        const state = await fetchProxyJson<GridSeriesState>(`${proxy}/grid/series-state?id=${list[i]}`);
        readSeries(db, state, find, out);
      } catch {
        // One series failing (not started, no data) must not sink the rest.
      }
      if (i < list.length - 1) await new Promise((r) => setTimeout(r, SERIES_GAP_MS));
    }
    return out.games > 0 ? out : null;
  }
}
