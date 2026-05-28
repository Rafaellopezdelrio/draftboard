// Memoised draft winrate prediction. Returns null until both teams have
// at least one pick — the engine needs that minimum signal to score.
//
// Cheap wrapper around predictDraftWinrate(); kept as a hook for parity
// with useSuggestions + so the App shell doesn't accumulate useMemo
// blocks inline.

import { useMemo } from "react";
import { predictDraftWinrate } from "../engine/draftWinrateEngine";
import type { ChampionDb } from "../types/champion";

export function useDraftPrediction(
  db: ChampionDb | null,
  allyKeys: string[],
  enemyKeys: string[]
): ReturnType<typeof predictDraftWinrate> | null {
  return useMemo(() => {
    if (!db || allyKeys.length === 0 || enemyKeys.length === 0) return null;
    return predictDraftWinrate({ db, allyKeys, enemyKeys });
  }, [db, allyKeys, enemyKeys]);
}
