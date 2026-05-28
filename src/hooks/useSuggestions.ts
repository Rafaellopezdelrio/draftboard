// Memoised suggestion engine call. Returns the top-N champion picks for
// the current role given the live ally/enemy/bans state + personal data
// + mastery + rank tier. Pure useMemo wrapper around suggest() — same
// inputs => same array reference (downstream components rely on this
// for stable rendering).
//
// Personal stats and mastery are gated by user prefs (toggle off and
// the engine sees empty arrays => degrades to meta-only scoring).

import { useMemo } from "react";
import { suggest } from "../engine/suggestionEngine";
type Suggestion = ReturnType<typeof suggest>[number];
import type { ChampionDb, Role } from "../types/champion";
import type { ChampionMasteryDto } from "../services/riotApi";
import type { ChampionPersonalStat } from "../services/matchRepo";

interface Args {
  db: ChampionDb | null;
  role: Role | null;
  allyKeys: string[];
  enemyKeys: string[];
  bannedKeys: string[];
  personalStats: ChampionPersonalStat[];
  masteries: ChampionMasteryDto[];
  rankTier: string | null;
  usePersonalStats: boolean;
  useMastery: boolean;
}

export function useSuggestions(args: Args): Suggestion[] {
  const {
    db,
    role,
    allyKeys,
    enemyKeys,
    bannedKeys,
    personalStats,
    masteries,
    rankTier,
    usePersonalStats,
    useMastery,
  } = args;
  return useMemo(() => {
    if (!db) return [];
    return suggest({
      db,
      role,
      allyKeys,
      enemyKeys,
      bannedKeys,
      personalStats: usePersonalStats ? personalStats : [],
      masteries: useMastery ? masteries : [],
      rankTier,
    });
  }, [
    db,
    role,
    allyKeys,
    enemyKeys,
    bannedKeys,
    personalStats,
    masteries,
    usePersonalStats,
    useMastery,
    rankTier,
  ]);
}
