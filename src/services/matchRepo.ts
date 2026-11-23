import { getDb, isTauri } from "../db/client";
import { choosePosition } from "./positionFix";
import type { MatchSummary } from "./riotApi";
import { loadSettings } from "./settingsRepo";

/**
 * Personal stats only read the games of the account the app is on (the one
 * saved in settings, which follows the account logged into the client), so a
 * smurf and the main never mix. Without a saved account: the games stored
 * without one. Appends the condition and its parameter.
 */
async function accountFilter(params: unknown[], column = "account"): Promise<string> {
  const account = (await loadSettings().catch(() => null))?.puuid || null;
  if (!account) return ` AND ${column} IS NULL`;
  params.push(account);
  return ` AND ${column} = $${params.length}`;
}

/** Games stored before games carried an account belong to the account saved
 * at that time. Idempotent; only touches rows without an account. */
export async function claimUnownedMatches(account: string): Promise<void> {
  if (!isTauri() || !account) return;
  const db = await getDb();
  await db.execute("UPDATE matches SET account = $1 WHERE account IS NULL", [account]);
}

/** Deletes the current account's stored games (a full re-download follows);
 * other accounts' games are kept. */
export async function clearAllMatches(): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  const params: unknown[] = [];
  await db.execute("DELETE FROM matches WHERE 1=1" + (await accountFilter(params)), params);
}

export async function existingMatchIds(): Promise<Set<string>> {
  if (!isTauri()) return new Set();
  const db = await getDb();
  const rows = await db.select<Array<{ match_id: string }>>(
    "SELECT match_id FROM matches"
  );
  return new Set(rows.map((r) => r.match_id));
}

/** End time of every stored game, by match id. */
export async function storedMatchEnds(): Promise<Map<string, number>> {
  if (!isTauri()) return new Map();
  const db = await getDb();
  const rows = await db.select<Array<{ match_id: string; end_ts_ms: number }>>(
    "SELECT match_id, end_ts_ms FROM matches"
  );
  return new Map(rows.map((r) => [r.match_id, Number(r.end_ts_ms)]));
}

/** Numeric game id shared by both id forms: "LCU_7412" and "EUW1_7412" → "7412". */
export function gameIdOf(matchId: string): string {
  return matchId.slice(matchId.lastIndexOf("_") + 1);
}

/**
 * The same game can be stored twice: once from the LCU ("LCU_<id>") and once
 * from the Riot API ("<PLATFORM>_<id>"). Drops every LCU row that has a Riot
 * twin (the Riot row is authoritative) and re-points drafts linked to it.
 * Idempotent, so it also cleans up duplicates stored by older versions.
 */
export async function dropLcuTwins(): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  const twinOf = (lcuCol: string) =>
    `SELECT r.match_id FROM matches r
       WHERE r.match_id NOT LIKE 'LCU|_%' ESCAPE '|'
         AND substr(r.match_id, instr(r.match_id, '_') + 1) = substr(${lcuCol}, 5)
       LIMIT 1`;
  await db.execute(
    `UPDATE drafts SET match_id = (${twinOf("drafts.match_id")})
     WHERE match_id LIKE 'LCU|_%' ESCAPE '|' AND EXISTS (${twinOf("drafts.match_id")})`
  );
  await db.execute(
    `DELETE FROM matches
     WHERE match_id LIKE 'LCU|_%' ESCAPE '|' AND EXISTS (${twinOf("matches.match_id")})`
  );
}

/** `account`: Riot puuid of the player the game belongs to (null when unknown). */
export async function saveMatch(m: MatchSummary, account: string | null = null): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO matches
     (match_id, champion_id, win, kills, deaths, assists, cs, duration_sec, end_ts_ms, queue_id, position, opponent_champion_id, vision_score, gold_earned, account)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      m.matchId,
      m.championId,
      m.win ? 1 : 0,
      m.kills,
      m.deaths,
      m.assists,
      m.cs,
      m.durationSec,
      m.gameEndTimestampMs,
      m.queueId,
      m.position,
      m.opponentChampionId,
      m.visionScore ?? null,
      m.goldEarned ?? null,
      account,
    ]
  );
}

export type MatchRow = MatchSummary;

export async function recentMatches(
  limit = 50,
  filters?: { position?: string; queueId?: number }
): Promise<MatchRow[]> {
  if (!isTauri()) return [];
  const db = await getDb();
  const params: unknown[] = [];
  let sql = "SELECT * FROM matches WHERE 1=1" + (await accountFilter(params));
  if (filters?.position) {
    params.push(filters.position);
    sql += ` AND position = $${params.length}`;
  }
  if (filters?.queueId !== undefined) {
    params.push(filters.queueId);
    sql += ` AND queue_id = $${params.length}`;
  }
  params.push(limit);
  sql += ` ORDER BY end_ts_ms DESC LIMIT $${params.length}`;
  const rows = await db.select<
    Array<{
      match_id: string;
      champion_id: number;
      win: number;
      kills: number;
      deaths: number;
      assists: number;
      cs: number;
      duration_sec: number;
      end_ts_ms: number;
      queue_id: number;
      position: string;
      opponent_champion_id: number | null;
      vision_score: number | null;
      gold_earned: number | null;
    }>
  >(sql, params);
  return rows.map((r) => ({
    matchId: r.match_id,
    championId: r.champion_id,
    win: r.win === 1,
    kills: r.kills,
    deaths: r.deaths,
    assists: r.assists,
    cs: r.cs,
    durationSec: r.duration_sec,
    gameEndTimestampMs: r.end_ts_ms,
    queueId: r.queue_id,
    // Games stored before the position check get it on read.
    position: choosePosition([r.position], r.champion_id),
    opponentChampionId: r.opponent_champion_id ?? 0,
    visionScore: r.vision_score ?? null,
    goldEarned: r.gold_earned ?? null,
  }));
}

export interface ChampionPersonalStat {
  championId: number;
  position?: string;
  games: number;
  wins: number;
  winRate: number;
}

export async function personalStatsByChampion(
  filters?: { position?: string }
): Promise<ChampionPersonalStat[]> {
  if (!isTauri()) return [];
  const db = await getDb();
  const params: unknown[] = [];
  let sql = `SELECT champion_id, COUNT(*) as games, SUM(win) as wins
     FROM matches WHERE 1=1` + (await accountFilter(params));
  if (filters?.position) {
    params.push(filters.position);
    sql += ` AND position = $${params.length}`;
  }
  sql += " GROUP BY champion_id ORDER BY games DESC";
  const rows = await db.select<
    Array<{ champion_id: number; games: number; wins: number }>
  >(sql, params);
  return rows.map((r) => ({
    championId: r.champion_id,
    position: filters?.position,
    games: r.games,
    wins: r.wins,
    winRate: r.games > 0 ? r.wins / r.games : 0,
  }));
}

export interface PersonalMatchupStat {
  position: string;
  opponentChampionId: number;
  games: number;
  wins: number;
  winRate: number;
}

export async function personalMatchupsByRole(
  position: string,
  minGames = 2
): Promise<PersonalMatchupStat[]> {
  if (!isTauri()) return [];
  try {
    const db = await getDb();
    const params: unknown[] = [position, minGames];
    const mine = await accountFilter(params);
    const rows = await db.select<
      Array<{ opponent_champion_id: number; games: number; wins: number }>
    >(
      `SELECT opponent_champion_id, COUNT(*) as games, SUM(win) as wins
       FROM matches
       WHERE position = $1 AND opponent_champion_id > 0${mine}
       GROUP BY opponent_champion_id
       HAVING games >= $2
       ORDER BY (CAST(wins AS REAL) / games) ASC, games DESC`,
      params
    );
    return rows.map((r) => ({
      position,
      opponentChampionId: r.opponent_champion_id,
      games: r.games,
      wins: r.wins,
      winRate: r.games > 0 ? r.wins / r.games : 0,
    }));
  } catch {
    return []; // opponent_champion_id column may not exist on old DBs
  }
}
