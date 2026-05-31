// Fetches live op.gg matchup counters for the current enemies and feeds them
// to the suggestion engine (see services/enemyCounters + useSuggestions).
//
// Async + cancel-guarded so a fast enemy change (or unmount) can't let an
// older fetch clobber newer results. Keyed on the joined enemy-key string so
// it only refetches when the actual enemy SET changes, not on every render
// (the enemyKeys array identity churns each tick).

import { useEffect, useState } from "react";
import { fetchEnemyCounters } from "../services/enemyCounters";
import { opggTierForRank } from "../services/opggMatchups";
import type { ChampionDb, CounterEntry, Role } from "../types/champion";

export function useEnemyCounters(
  db: ChampionDb | null,
  enemyKeys: string[],
  role: Role | null,
  rankTier?: string | null
): CounterEntry[] {
  const [counters, setCounters] = useState<CounterEntry[]>([]);
  const enemyKey = enemyKeys.join(",");
  // Fetch matchups at the player's own elo bracket (falls back to emerald_plus
  // when unranked) so counter WRs reflect the games they actually play.
  const tier = opggTierForRank(rankTier);

  useEffect(() => {
    const keys = enemyKey ? enemyKey.split(",") : [];
    if (!db || !role || keys.length === 0) {
      setCounters([]);
      return;
    }
    let cancelled = false;
    fetchEnemyCounters(db, keys, role, tier)
      .then((c) => {
        if (!cancelled) setCounters(c);
      })
      .catch(() => {
        if (!cancelled) setCounters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [db, role, enemyKey, tier]);

  return counters;
}
