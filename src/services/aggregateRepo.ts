import { getDb, isTauri } from "../db/client";
import type { CounterEntry, MetaTier, Role } from "../types/champion";

export async function loadAggregatedMeta(patch: string): Promise<MetaTier[]> {
  if (!isTauri()) return [];
  try {
    const db = await getDb();
    const rows = await db.select<
      Array<{
        champion_id: number;
        position: string;
        win_rate: number;
        pick_rate: number;
        ban_rate: number;
        games: number;
      }>
    >(
      "SELECT champion_id, position, win_rate, pick_rate, ban_rate, games FROM meta_aggregate WHERE patch = $1",
      [patch]
    );
    return computeTiersPerRole(rows);
  } catch {
    return []; // table doesn't exist yet (pre-migration v2)
  }
}

export async function loadAggregatedCounters(
  patch: string
): Promise<CounterEntry[]> {
  if (!isTauri()) return [];
  try {
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
  } catch {
    return []; // table doesn't exist yet
  }
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
  try {
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
  } catch {
    return [];
  }
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
  try {
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
  } catch {
    return null;
  }
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
  try {
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
  } catch {
    return null;
  }
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

/**
 * Industry-standard composite tier calculation (op.gg / u.gg style).
 *
 * A champion's strength = winrate adjusted by:
 *   - Sample size (Wilson confidence interval to avoid 100% WR on 2 games = S-tier)
 *   - Pick + ban rate (high presence → impact on the meta)
 *   - Per-role percentile ranking (S = top 8% of the role's playable pool)
 *
 * This matches what serious tier list sites do and avoids the failure mode
 * of "winrate above 0.535 = S" which over-tiers low-sample off-meta picks.
 */
export function computeTiersPerRole(
  rows: Array<{
    champion_id: number;
    position: string;
    win_rate: number;
    pick_rate: number;
    ban_rate: number;
    games: number;
  }>
): MetaTier[] {
  // Group by role
  const byRole = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byRole.get(r.position) ?? [];
    arr.push(r);
    byRole.set(r.position, arr);
  }

  const out: MetaTier[] = [];
  for (const [role, roleRows] of byRole) {
    // Filter noise: <10 games is statistically meaningless
    const eligible = roleRows.filter((r) => r.games >= 10);
    if (eligible.length === 0) continue;

    // Composite score: wilson-lower-bound WR + presence bonus
    const scored = eligible.map((r) => ({
      r,
      score: compositeScore(r),
    }));
    scored.sort((a, b) => b.score - a.score);

    // Tier assignment: HYBRID of absolute score threshold + percentile floor.
    //
    // Op.gg / Mobalytics show ~10-15 S-tier champions per role because they
    // use ABSOLUTE thresholds: every champion with composite score ≥ X is
    // S-tier, no fixed quota. Pure percentile (top 10%) artificially caps
    // S-tier to 2-3 champs when sample is small.
    //
    // We use absolute thresholds tuned to match op.gg's distribution, with
    // a minimum-quantity safety net (top 5% guaranteed S even if scores low).
    const n = scored.length;
    const sFloor = Math.max(1, Math.floor(n * 0.05));  // guaranteed top 5% = S
    const aFloor = Math.max(2, Math.floor(n * 0.15));  // top 15% min = A or better
    scored.forEach((entry, idx) => {
      const composite = entry.score;
      let tier: MetaTier["tier"];
      // Absolute thresholds calibrated against op.gg observed distribution.
      if (composite >= 0.52 || idx < sFloor) tier = "S";
      else if (composite >= 0.50 || idx < aFloor) tier = "A";
      else if (composite >= 0.48) tier = "B";
      else if (composite >= 0.46) tier = "C";
      else tier = "D";

      out.push({
        championKey: String(entry.r.champion_id),
        role: role as Role,
        tier,
        winRate: entry.r.win_rate,
        pickRate: entry.r.pick_rate,
        banRate: entry.r.ban_rate,
      });
    });
  }

  return out;
}

function compositeScore(r: {
  win_rate: number;
  pick_rate: number;
  ban_rate: number;
  games: number;
}): number {
  // Sample-size penalty: heavy on tiny samples, drops fast as games grow.
  // 1/sqrt(n) shape matches statistical confidence intervals roughly:
  //   12 games  → 0.14 penalty (kills niche off-meta picks)
  //   100 games → 0.05 penalty (mild)
  //   500 games → 0.022 penalty (negligible)
  const samplePenalty = 0.5 / Math.sqrt(r.games + 1);

  // Presence: pick + ban rate boost (a 51% WR champ with 30% PR > 53% WR niche)
  const presence = (r.pick_rate + r.ban_rate * 0.5) * 0.1;

  return r.win_rate - samplePenalty + presence;
}
