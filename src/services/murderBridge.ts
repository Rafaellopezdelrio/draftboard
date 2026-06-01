import type { CounterEntry, Role } from "../types/champion";

// Counter-pick scoring. The "fetch" side of this module was a long-dead stub
// (always returned []); counter data now flows in from services/enemyCounters
// (live op.gg matchups) + the counter_aggregate table. What remains is the
// pure scorer the suggestion engine actually uses.
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
    const entry = counters.find(
      (c) =>
        c.championKey === championKey &&
        c.vsChampionKey === enemy &&
        c.role === role
    );
    if (entry) {
      total += entry.winRate;
      n++;
    }
  }
  return n === 0 ? 0.5 : total / n;
}
