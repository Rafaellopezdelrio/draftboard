// Records a draft snapshot the moment you lock in your champion, capturing
// the ally/enemy/ban state + the engine's suggestion + whether your pick
// matched the top suggestion. personalDataSync later links it to the match
// outcome (see draftsRepo) so we can measure whether following the advice
// correlates with winning.

import { useEffect, useRef } from "react";
import { saveDraft } from "../services/draftsRepo";

interface Args {
  /** Local player's locked champion key (null until lock-in). */
  myChampionLocked: string | null;
  allyKeys: string[];
  enemyKeys: string[];
  bannedKeys: string[];
  /** Top suggestion keys at lock time (suggestedKeys[0] = the #1 pick). */
  suggestedKeys: string[];
}

export function useDraftLogger({
  myChampionLocked,
  allyKeys,
  enemyKeys,
  bannedKeys,
  suggestedKeys,
}: Args): void {
  // Dedupe: log once per lock. Reset when we leave champ select (locked null)
  // so the next game logs fresh.
  const loggedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!myChampionLocked) {
      loggedFor.current = null;
      return;
    }
    if (loggedFor.current === myChampionLocked) return;
    loggedFor.current = myChampionLocked;

    void saveDraft({
      tsMs: Date.now(),
      allyKeys,
      enemyKeys,
      bannedKeys,
      pickedKey: myChampionLocked,
      suggestedKeys,
      followedSuggestion: suggestedKeys[0] === myChampionLocked,
    }).catch(() => {});
  }, [myChampionLocked, allyKeys, enemyKeys, bannedKeys, suggestedKeys]);
}
