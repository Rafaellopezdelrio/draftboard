// Pro-play meta aggregator. Pulls picks/bans/wins from Leaguepedia (lol.fandom.com)
// using their public Cargo MediaWiki API. No auth required.
//
// Tables of interest:
// - ScoreboardGames — one row per game, has DateTime_UTC, Patch, Tournament, etc.
// - ScoreboardPlayers — per-player picks with Role + Champion + PlayerWin
//
// We filter to major regions (LCK, LEC, LCS, LPL, LCP, MSI, Worlds) and the most
// recent N days. Aggregate to populate `meta_aggregate` (championId, position).

import { httpFetch } from "./httpClient";
import { getDb, isTauri } from "../db/client";
import { buildBatchInserts } from "../db/batchInsert";
import { i18n } from "../i18n";
import type { ChampionDb } from "../types/champion";

const LEAGUEPEDIA_API = "https://lol.fandom.com/api.php";

const MAJOR_TOURNAMENTS_LIKE = [
  "LCK%", "LEC%", "LCS%", "LPL%", "LCP%", "LCK CL%", "LEC Winter%",
  "Worlds%", "MSI%", "First Stand%", "EWC%",
];

interface CargoRow {
  GameId?: string;
  Player?: string;
  PlayerWin?: string; // "Yes" / "No"
  Champion?: string; // ddragon-ish name
  Role?: string; // "Top", "Jungle", "Mid", "Bot", "Support"
  Tournament?: string;
  Patch?: string;
  DateTime_UTC?: string;
}

interface CargoResponse {
  cargoquery?: Array<{ title: CargoRow }>;
  warnings?: unknown;
  error?: { info?: string };
}

const ROLE_TO_POSITION: Record<string, string> = {
  Top: "TOP",
  Jungle: "JUNGLE",
  Mid: "MIDDLE",
  Bot: "BOTTOM",
  Support: "UTILITY",
};

export interface ProAggregateProgress {
  phase: string;
  done: number;
  total: number;
}

/**
 * Pull recent pro picks (last `daysBack` days) and aggregate by champion+role.
 * Writes into meta_aggregate with patch="proplay-<currentPatch>".
 */
export async function aggregateFromProPlay(
  db: ChampionDb,
  patch: string,
  daysBack: number,
  onProgress: (p: ProAggregateProgress) => void
): Promise<{ rows: number; games: number }> {
  if (!isTauri()) return { rows: 0, games: 0 };

  // Build a champion-name → key map (Leaguepedia uses display names with spaces).
  const nameToKey = new Map<string, string>();
  for (const c of Object.values(db.champions)) {
    nameToKey.set(c.name.toLowerCase(), c.key);
    nameToKey.set(c.id.toLowerCase(), c.key);
  }

  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  onProgress({ phase: "Buscando partidas pro recientes", done: 0, total: 1 });

  // Fetch in batches of 500 (Leaguepedia limit per call)
  const allRows: CargoRow[] = [];
  let offset = 0;
  const PAGE = 500;
  const tournamentClause = MAJOR_TOURNAMENTS_LIKE.map(
    (t) => `Tournament LIKE "${t}"`
  ).join(" OR ");

  for (let page = 0; page < 6; page++) {
    const params = new URLSearchParams({
      action: "cargoquery",
      tables: "ScoreboardPlayers=SP, ScoreboardGames=SG",
      fields: [
        "SP.GameId",
        "SP.Player",
        "SP.PlayerWin",
        "SP.Champion",
        "SP.Role",
        "SG.Tournament",
        "SG.Patch",
        "SG.DateTime_UTC",
      ].join(","),
      where: `(${tournamentClause}) AND SG.DateTime_UTC >= "${since}"`,
      join_on: "SP.GameId=SG.GameId",
      order_by: "SG.DateTime_UTC DESC",
      limit: String(PAGE),
      offset: String(offset),
      format: "json",
    });
    onProgress({
      phase: "Descargando datos pro",
      done: page,
      total: 6,
    });
    // Throttle: Leaguepedia (Fandom) rate-limits aggressive scraping. Wait
    // ~2s between pages and retry with exponential backoff on 429.
    let resp: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        resp = await httpFetch(`${LEAGUEPEDIA_API}?${params.toString()}`, {
          headers: { "User-Agent": "Draftboard/0.2 (contact: rafael.lopez.serrano.99@gmail.com)" },
        });
      } catch {
        resp = null;
      }
      if (resp && resp.ok) break;
      if (resp && resp.status === 429) {
        const wait = (2 ** attempt) * 3000; // 3s, 6s, 12s, 24s
        onProgress({
          phase: `Rate-limited por Leaguepedia, esperando ${wait / 1000}s...`,
          done: page,
          total: 6,
        });
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      break;
    }
    if (!resp || !resp.ok) break;
    const json = (await resp.json()) as CargoResponse;
    if (json.error) {
      const info = json.error.info ?? "error";
      // Soft-fail on transient errors so partial data is preserved
      // rather than wiping the whole sync. Three known transient
      // signatures:
      //   - rate limit (Fandom throttling)
      //   - MWException (random MediaWiki server hiccup, very common)
      //   - "Internal error" / 5xx from Cargo
      const isTransient =
        /rate limit/i.test(info) ||
        /MWException/i.test(info) ||
        /internal/i.test(info) ||
        /5\d\d/.test(info);
      if (isTransient) {
        onProgress({
          phase:
            allRows.length > 0
              ? `Leaguepedia error transitorio — usando ${allRows.length} partidas descargadas`
              : `Leaguepedia error transitorio (${info.slice(0, 60)}). Reintenta en 1-2 min.`,
          done: page,
          total: 6,
        });
        break;
      }
      throw new Error(`Leaguepedia: ${info}`);
    }
    const batch = (json.cargoquery ?? []).map((x) => x.title);
    allRows.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
    // Inter-page delay — be polite to Fandom
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Aggregate per (championKey, position)
  const counts = new Map<string, { games: number; wins: number }>();
  const games = new Set<string>();
  for (const r of allRows) {
    if (!r.Champion || !r.Role || !r.GameId) continue;
    games.add(r.GameId);
    const key = nameToKey.get(r.Champion.toLowerCase());
    const pos = ROLE_TO_POSITION[r.Role];
    if (!key || !pos) continue;
    const k = `${key}|${pos}`;
    const e = counts.get(k) ?? { games: 0, wins: 0 };
    e.games++;
    if (r.PlayerWin === "Yes") e.wins++;
    counts.set(k, e);
  }

  // Write into meta_aggregate with a "proplay-" patch label so it doesn't
  // overwrite Master+ data if both are configured.
  onProgress({ phase: i18n.t("metaSync.saving"), done: 0, total: counts.size });
  const dbConn = await getDb();
  const proPatch = `proplay-${patch}`;
  await dbConn.execute("DELETE FROM meta_aggregate WHERE patch = $1", [proPatch]);

  let totalGames = 0;
  for (const v of counts.values()) totalGames += v.games;

  // Batch the per-(champion,position) rows into a few multi-row INSERTs instead
  // of one execute() round-trip each (counts can be 200+). Same buildBatchInserts
  // helper metaAggregator uses.
  const now = Date.now();
  const rows: unknown[][] = [];
  for (const [k, v] of counts) {
    const [champKey, pos] = k.split("|");
    const wr = v.games > 0 ? v.wins / v.games : 0;
    const pickRate = totalGames > 0 ? v.games / totalGames : 0;
    rows.push([Number(champKey), pos, v.games, v.wins, wr, pickRate, 0, proPatch, now]);
  }
  const chunks = buildBatchInserts(
    "meta_aggregate",
    ["champion_id", "position", "games", "wins", "win_rate", "pick_rate", "ban_rate", "patch", "updated_ts_ms"],
    rows
  );
  let done = 0;
  for (const chunk of chunks) {
    await dbConn.execute(chunk.sql, chunk.params);
    done = Math.min(done + Math.ceil(counts.size / Math.max(1, chunks.length)), counts.size);
    onProgress({ phase: i18n.t("metaSync.saving"), done, total: counts.size });
  }

  await dbConn.execute(
    `INSERT INTO aggregation_meta (key, value) VALUES ('proplay_last_run', $1)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(Date.now())]
  );
  await dbConn.execute(
    `INSERT INTO aggregation_meta (key, value) VALUES ('proplay_games', $1)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(games.size)]
  );

  onProgress({ phase: "Listo", done: counts.size, total: counts.size });
  return { rows: counts.size, games: games.size };
}

export async function getProPlayLastRun(): Promise<{
  ts: number | null;
  games: number;
}> {
  if (!isTauri()) return { ts: null, games: 0 };
  const db = await getDb();
  const rows = await db.select<Array<{ key: string; value: string }>>(
    "SELECT key, value FROM aggregation_meta WHERE key IN ('proplay_last_run', 'proplay_games')"
  );
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    ts: map.has("proplay_last_run") ? Number(map.get("proplay_last_run")) : null,
    games: map.has("proplay_games") ? Number(map.get("proplay_games")) : 0,
  };
}
