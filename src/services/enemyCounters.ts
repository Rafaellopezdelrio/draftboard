// Live counter data for the suggestion engine.
//
// The engine's counter dimension reads `db.counters`, which is aggregated
// from the USER's own match history — far too sparse to cover an arbitrary
// (candidate, enemy) pair, so the counter signal was effectively dead. This
// wires in op.gg's broad matchup data instead.
//
// Efficient by design: to score every candidate against the ≤5 known
// enemies, we fetch each ENEMY's full matchup list (≤5 requests, not one per
// candidate) and INVERT it — op.gg gives "enemy vs opponent" win rates, so
// "candidate vs enemy" = 1 - that. One enemy list yields a counter entry for
// every candidate at once.

import { fetchOpggMatchups, ddIdToOpggKey } from "./opggMatchups";
import type { ChampionDb, CounterEntry, Role } from "../types/champion";

/** Map op.gg slug ("leesin") → our numeric ChampionDb key, derived from the
 *  loaded champions so it always matches the current roster. */
function buildSlugToKey(db: ChampionDb): Map<string, string> {
  const m = new Map<string, string>();
  for (const key in db.champions) {
    m.set(ddIdToOpggKey(db.champions[key].id).toLowerCase(), key);
  }
  return m;
}

/**
 * Fetch + invert op.gg matchups for `enemyKeys` into CounterEntry[] of
 * (candidate vs enemy) win rates at `role`. Returns [] when no enemies, no
 * proxy, or every fetch failed — never throws (each enemy fetch already
 * degrades to [] on error). Results feed the engine's counter dimension via
 * `suggest({ liveCounters })`.
 *
 * `role` is the LOCAL player's role: we want the matchup in the lane we're
 * drafting for, so enemies who aren't played in that role simply contribute
 * no entries (op.gg has no data for them there) and the signal self-focuses
 * on the real lane threat.
 */
export async function fetchEnemyCounters(
  db: ChampionDb,
  enemyKeys: string[],
  role: Role,
  tier: string = "emerald_plus"
): Promise<CounterEntry[]> {
  if (enemyKeys.length === 0) return [];
  const slugToKey = buildSlugToKey(db);
  const out: CounterEntry[] = [];

  await Promise.all(
    enemyKeys.map(async (enemyKey) => {
      const enemy = db.champions[enemyKey];
      if (!enemy) return;
      const matchups = await fetchOpggMatchups(enemy.id, role, tier);
      for (const m of matchups) {
        const candidateKey = slugToKey.get(m.championKey.toLowerCase());
        if (!candidateKey || candidateKey === enemyKey) continue;
        // op.gg `winRate` (0-100) is the ENEMY's win rate vs this opponent.
        // Invert for the opponent's (= our candidate's) win rate vs the enemy.
        out.push({
          championKey: candidateKey,
          vsChampionKey: enemyKey,
          role,
          winRate: (100 - m.winRate) / 100,
          sampleSize: m.play,
        });
      }
    })
  );

  return out;
}
