import { getDb, isTauri } from "../db/client";
import type { MatchSummary } from "./riotApi";

export async function clearAllMatches(): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  await db.execute("DELETE FROM matches");
}

export async function existingMatchIds(): Promise<Set<string>> {
  if (!isTauri()) return new Set();
  const db = await getDb();
  const rows = await db.select<Array<{ match_id: string }>>(
    "SELECT match_id FROM matches"
  );
  return new Set(rows.map((r) => r.match_id));
}

export async function saveMatch(m: MatchSummary): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO matches
     (match_id, champion_id, win, kills, deaths, assists, cs, duration_sec, end_ts_ms, queue_id, position, opponent_champion_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
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
  let sql = "SELECT * FROM matches WHERE 1=1";
  const params: unknown[] = [];
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
    position: r.position,
    opponentChampionId: r.opponent_champion_id ?? 0,
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
  let sql = `SELECT champion_id, COUNT(*) as games, SUM(win) as wins
     FROM matches WHERE 1=1`;
  const params: unknown[] = [];
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
  const db = await getDb();
  const rows = await db.select<
    Array<{ opponent_champion_id: number; games: number; wins: number }>
  >(
    `SELECT opponent_champion_id, COUNT(*) as games, SUM(win) as wins
     FROM matches
     WHERE position = $1 AND opponent_champion_id > 0
     GROUP BY opponent_champion_id
     HAVING games >= $2
     ORDER BY (CAST(wins AS REAL) / games) ASC, games DESC`,
    [position, minGames]
  );
  return rows.map((r) => ({
    position,
    opponentChampionId: r.opponent_champion_id,
    games: r.games,
    wins: r.wins,
    winRate: r.games > 0 ? r.wins / r.games : 0,
  }));
}

export interface PersonalChampionRoleStat extends ChampionPersonalStat {
  position: string;
}

export async function personalStatsByChampionAndRole(): Promise<PersonalChampionRoleStat[]> {
  if (!isTauri()) return [];
  const db = await getDb();
  const rows = await db.select<
    Array<{ champion_id: number; position: string; games: number; wins: number }>
  >(
    `SELECT champion_id, position, COUNT(*) as games, SUM(win) as wins
     FROM matches
     WHERE position != ''
     GROUP BY champion_id, position
     ORDER BY games DESC`
  );
  return rows.map((r) => ({
    championId: r.champion_id,
    position: r.position,
    games: r.games,
    wins: r.wins,
    winRate: r.games > 0 ? r.wins / r.games : 0,
  }));
}
