import { getDb, isTauri } from "../db/client";
import type { MatchSummary } from "./riotApi";

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
     (match_id, champion_id, win, kills, deaths, assists, cs, duration_sec, end_ts_ms, queue_id, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
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
    ]
  );
}

export interface MatchRow extends MatchSummary {}

export async function recentMatches(limit = 50): Promise<MatchRow[]> {
  if (!isTauri()) return [];
  const db = await getDb();
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
    }>
  >(
    "SELECT * FROM matches ORDER BY end_ts_ms DESC LIMIT $1",
    [limit]
  );
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
  }));
}

export interface ChampionPersonalStat {
  championId: number;
  games: number;
  wins: number;
  winRate: number;
}

export async function personalStatsByChampion(): Promise<ChampionPersonalStat[]> {
  if (!isTauri()) return [];
  const db = await getDb();
  const rows = await db.select<
    Array<{ champion_id: number; games: number; wins: number }>
  >(
    `SELECT champion_id, COUNT(*) as games, SUM(win) as wins
     FROM matches GROUP BY champion_id ORDER BY games DESC`
  );
  return rows.map((r) => ({
    championId: r.champion_id,
    games: r.games,
    wins: r.wins,
    winRate: r.games > 0 ? r.wins / r.games : 0,
  }));
}
