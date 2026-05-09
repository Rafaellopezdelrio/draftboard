import { getDb, isTauri } from "../db/client";
import type { CounterEntry, MetaTier, Role } from "../types/champion";

export async function loadAggregatedMeta(patch: string): Promise<MetaTier[]> {
  if (!isTauri()) return [];
  const db = await getDb();
  const rows = await db.select<
    Array<{
      champion_id: number;
      position: string;
      win_rate: number;
      pick_rate: number;
      ban_rate: number;
    }>
  >(
    "SELECT champion_id, position, win_rate, pick_rate, ban_rate FROM meta_aggregate WHERE patch = $1",
    [patch]
  );
  return rows.map((r) => ({
    championKey: String(r.champion_id),
    role: r.position as Role,
    tier: winrateToTier(r.win_rate),
    winRate: r.win_rate,
    pickRate: r.pick_rate,
    banRate: r.ban_rate,
  }));
}

export async function loadAggregatedCounters(
  patch: string
): Promise<CounterEntry[]> {
  if (!isTauri()) return [];
  const db = await getDb();
  const rows = await db.select<
    Array<{
      champion_id: number;
      vs_champion_id: number;
      position: string;
      win_rate: number;
      games: number;
    }>
  >(
    "SELECT champion_id, vs_champion_id, position, win_rate, games FROM counter_aggregate WHERE patch = $1",
    [patch]
  );
  return rows.map((r) => ({
    championKey: String(r.champion_id),
    vsChampionKey: String(r.vs_champion_id),
    role: r.position as Role,
    winRate: r.win_rate,
    sampleSize: r.games,
  }));
}

export interface BuildAgg {
  championId: number;
  position: string;
  itemIds: number[];
  games: number;
  wins: number;
}

export async function loadAggregatedBuilds(
  patch: string,
  championId: number,
  position: string
): Promise<BuildAgg[]> {
  if (!isTauri()) return [];
  const db = await getDb();
  const rows = await db.select<
    Array<{
      champion_id: number;
      position: string;
      item_ids: string;
      games: number;
      wins: number;
    }>
  >(
    `SELECT * FROM build_aggregate
     WHERE patch = $1 AND champion_id = $2 AND position = $3
     ORDER BY (CAST(wins AS REAL) / games) DESC, games DESC LIMIT 5`,
    [patch, championId, position]
  );
  return rows.map((r) => ({
    championId: r.champion_id,
    position: r.position,
    itemIds: r.item_ids.split(",").map((x) => Number(x)),
    games: r.games,
    wins: r.wins,
  }));
}

export interface RuneAgg {
  championId: number;
  position: string;
  primaryStyle: number;
  subStyle: number;
  perks: number[];
  shards: number[];
  games: number;
  wins: number;
}

export async function loadAggregatedRunes(
  patch: string,
  championId: number,
  position: string
): Promise<RuneAgg | null> {
  if (!isTauri()) return null;
  const db = await getDb();
  const rows = await db.select<
    Array<{
      champion_id: number;
      position: string;
      primary_style: number;
      sub_style: number;
      perks: string;
      shards: string;
      games: number;
      wins: number;
    }>
  >(
    `SELECT * FROM rune_aggregate
     WHERE patch = $1 AND champion_id = $2 AND position = $3
     ORDER BY games DESC LIMIT 1`,
    [patch, championId, position]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    championId: r.champion_id,
    position: r.position,
    primaryStyle: r.primary_style,
    subStyle: r.sub_style,
    perks: r.perks.split(",").map((x) => Number(x)),
    shards: r.shards.split(",").map((x) => Number(x)),
    games: r.games,
    wins: r.wins,
  };
}

export interface SkillOrderAgg {
  firstThree: string;
  maxOrder: string;
  games: number;
  wins: number;
}

export async function loadAggregatedSkillOrder(
  patch: string,
  championId: number,
  position: string
): Promise<SkillOrderAgg | null> {
  if (!isTauri()) return null;
  const db = await getDb();
  const rows = await db.select<
    Array<{ first_three: string; max_order: string; games: number; wins: number }>
  >(
    `SELECT first_three, max_order, games, wins FROM skill_order_aggregate
     WHERE patch = $1 AND champion_id = $2 AND position = $3
     ORDER BY games DESC LIMIT 1`,
    [patch, championId, position]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    firstThree: r.first_three,
    maxOrder: r.max_order,
    games: r.games,
    wins: r.wins,
  };
}

export async function getLastAggregationTimestamp(): Promise<number | null> {
  if (!isTauri()) return null;
  const db = await getDb();
  const rows = await db.select<Array<{ value: string }>>(
    "SELECT value FROM aggregation_meta WHERE key = 'last_run'"
  );
  if (rows.length === 0) return null;
  return Number(rows[0].value);
}

function winrateToTier(wr: number): MetaTier["tier"] {
  if (wr >= 0.535) return "S";
  if (wr >= 0.515) return "A";
  if (wr >= 0.49) return "B";
  if (wr >= 0.47) return "C";
  return "D";
}
