// Per-champion totals over the player's stored games, for the "Mis campeones"
// table: games, wins, average K/D/A, CS, gold and vision, and the same split by
// lane opponent. Pure: the view picks the games (queue, season) and passes them.

import type { MatchRow } from "../services/matchRepo";

export interface ChampionLine {
  /** 0 for the "all champions" total. */
  championId: number;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  minutes: number;
  /** Gold and vision are missing on some stored games: kept with their own count. */
  gold: number;
  goldGames: number;
  goldMinutes: number;
  vision: number;
  visionGames: number;
}

/** Queues this table covers: ranked and Clash. */
export const QUEUE_GROUPS = {
  ranked: [420, 440, 700],
  solo: [420],
  flex: [440],
  clash: [700],
} as const;
export type QueueGroup = keyof typeof QUEUE_GROUPS;

function empty(championId: number): ChampionLine {
  return {
    championId,
    games: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    cs: 0,
    minutes: 0,
    gold: 0,
    goldGames: 0,
    goldMinutes: 0,
    vision: 0,
    visionGames: 0,
  };
}

function add(line: ChampionLine, m: MatchRow): void {
  const minutes = m.durationSec / 60;
  line.games += 1;
  if (m.win) line.wins += 1;
  line.kills += m.kills;
  line.deaths += m.deaths;
  line.assists += m.assists;
  line.cs += m.cs;
  line.minutes += minutes;
  if (m.goldEarned != null) {
    line.gold += m.goldEarned;
    line.goldGames += 1;
    line.goldMinutes += minutes;
  }
  if (m.visionScore != null) {
    line.vision += m.visionScore;
    line.visionGames += 1;
  }
}

function group(matches: MatchRow[], keyOf: (m: MatchRow) => number): ChampionLine[] {
  const by = new Map<number, ChampionLine>();
  for (const m of matches) {
    const key = keyOf(m);
    let line = by.get(key);
    if (!line) by.set(key, (line = empty(key)));
    add(line, m);
  }
  // Most played first; ties: better win rate, then id for a stable order.
  return [...by.values()].sort(
    (a, b) => b.games - a.games || b.wins / b.games - a.wins / a.games || a.championId - b.championId
  );
}

/** One line per champion played, plus the total of all of them. */
export function championLines(matches: MatchRow[]): { total: ChampionLine; champions: ChampionLine[] } {
  const total = empty(0);
  for (const m of matches) add(total, m);
  return { total, champions: group(matches, (m) => m.championId) };
}

/** One champion's games split by lane opponent (games without one are left out). */
export function opponentLines(matches: MatchRow[], championId: number): ChampionLine[] {
  return group(
    matches.filter((m) => m.championId === championId && m.opponentChampionId > 0),
    (m) => m.opponentChampionId
  );
}

/** Games in the given queues, optionally from one season (calendar year of the game). */
export function pickGames(matches: MatchRow[], queues: readonly number[], season: number | null): MatchRow[] {
  return matches.filter(
    (m) =>
      queues.includes(m.queueId) &&
      (season === null || new Date(m.gameEndTimestampMs).getFullYear() === season)
  );
}

/** Seasons with stored games in the given queues, newest first. */
export function seasonsIn(matches: MatchRow[], queues: readonly number[]): number[] {
  const years = new Set(
    matches.filter((m) => queues.includes(m.queueId)).map((m) => new Date(m.gameEndTimestampMs).getFullYear())
  );
  return [...years].sort((a, b) => b - a);
}

/** (K + A) / D; a deathless line is "perfect" (null). */
export function kdaRatio(l: ChampionLine): number | null {
  return l.deaths === 0 ? null : (l.kills + l.assists) / l.deaths;
}
