// Memoised projections of the live draft state — ally/enemy keys,
// numeric enemy IDs, banned key list. Each downstream useMemo depends
// on one or more of these, so centralising them here keeps reference
// stability uniform (same `[ally]` reference => same `allyKeys` array
// reference => stable cache key for the engine call).
//
// Extracted from App.tsx where four useMemo blocks lived inline.

import { useMemo } from "react";
import type { DraftState } from "../state/draftStore";

interface DraftSnapshot {
  ally: DraftState["ally"];
  enemy: DraftState["enemy"];
  bans: DraftState["bans"];
}

interface Derivations {
  /** Champion keys for filled ally slots, in slot order. */
  allyKeys: string[];
  /** Champion keys for filled enemy slots, in slot order. */
  enemyKeys: string[];
  /** Numeric IDs for enemy slots (null for empty). 5-tuple ordered. */
  enemyChampionIds: Array<number | null>;
  /** Flat list of all banned keys (ally + enemy), filtered for truthy. */
  bannedKeys: string[];
}

export function useDraftDerivations({ ally, enemy, bans }: DraftSnapshot): Derivations {
  const allyKeys = useMemo(
    () => ally.map((s) => s.championKey).filter((x): x is string => Boolean(x)),
    [ally]
  );
  const enemyKeys = useMemo(
    () => enemy.map((s) => s.championKey).filter((x): x is string => Boolean(x)),
    [enemy]
  );
  const enemyChampionIds = useMemo(
    () => enemy.map((s) => (s.championKey ? Number(s.championKey) : null)),
    [enemy]
  );
  const bannedKeys = useMemo(
    () =>
      [...bans.ally, ...bans.enemy].filter((x): x is string => Boolean(x)),
    [bans]
  );
  return { allyKeys, enemyKeys, enemyChampionIds, bannedKeys };
}
