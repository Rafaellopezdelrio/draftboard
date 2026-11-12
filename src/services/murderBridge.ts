import type { CounterEntry, Role } from "../types/champion";

// Counter-pick scoring. The "fetch" side of this module was a long-dead stub
// (always returned []); counter data now flows in from services/enemyCounters
// (live op.gg matchups) + the counter_aggregate table. What remains is the
// pure scorer the suggestion engine actually uses.

/** Fewer games than this on a pair is noise, not a matchup. */
export const MIN_COUNTER_SAMPLE = 50;

export function counterScore(
  championKey: string,
  enemyKeys: string[],
  role: Role,
  counters: CounterEntry[]
): number {
  if (enemyKeys.length === 0) return 0.5;
  let total = 0;
  let n = 0;
  for (const enemy of enemyKeys) {
    // Skip thin pairs: op.gg lists every opponent ever seen in the role, so
    // an off-lane enemy (Darius "mid") brings a 12-game coin flip that drowns
    // the real lane matchup.
    const entry = counters.find(
      (c) =>
        c.championKey === championKey &&
        c.vsChampionKey === enemy &&
        c.role === role &&
        c.sampleSize >= MIN_COUNTER_SAMPLE
    );
    if (entry) {
      total += entry.winRate;
      n++;
    }
  }
  return n === 0 ? 0.5 : total / n;
}
