import type { CounterEntry, MetaTier, Role } from "../types/champion";

// MurderBridge / community endpoints often change. We wrap the call so the
// rest of the app does not care if we swap the source.
//
// For now: stub that returns empty arrays so the rest of the engine can run.
// Phase 2.1 will wire up the real source (likely a community JSON mirror or
// a small backend that scrapes op.gg).
export async function fetchCounters(_patch: string): Promise<CounterEntry[]> {
  return [];
}

export async function fetchMeta(_patch: string): Promise<MetaTier[]> {
  return [];
}

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
