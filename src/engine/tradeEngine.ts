// Suggests champion swaps in champ select that would improve win probability.

import type { ChampionDb, Role } from "../types/champion";
import { suggest } from "./suggestionEngine";

export interface TradeSuggestion {
  currentChampionKey: string;
  proposedChampionKey: string;
  proposedName: string;
  proposedIcon: string;
  scoreDelta: number; // positive = proposed is better
  reason: string;
}

interface ArgsT {
  db: ChampionDb;
  currentPickKey: string | null;
  myRole: Role | null;
  allyKeys: string[];
  enemyKeys: string[];
  bannedKeys: string[];
}

export function suggestTrade(args: ArgsT): TradeSuggestion | null {
  const { db, currentPickKey, myRole } = args;
  if (!currentPickKey || !myRole) return null;

  // Get top suggestion for this draft state (excluding current pick from candidates)
  const top = suggest({
    db,
    role: myRole,
    allyKeys: args.allyKeys.filter((k) => k !== currentPickKey),
    enemyKeys: args.enemyKeys,
    bannedKeys: args.bannedKeys,
    limit: 3,
  });
  if (top.length === 0) return null;
  const best = top[0];
  if (best.champion.key === currentPickKey) return null;

  // Score current pick same way for comparison
  const currentScored = suggest({
    db,
    role: myRole,
    allyKeys: args.allyKeys.filter((k) => k !== currentPickKey),
    enemyKeys: args.enemyKeys,
    bannedKeys: args.bannedKeys.filter((k) => k !== currentPickKey),
    limit: 200,
  }).find((s) => s.champion.key === currentPickKey);

  if (!currentScored) return null;
  const delta = best.score - currentScored.score;
  if (delta < 0.05) return null; // not worth suggesting

  return {
    currentChampionKey: currentPickKey,
    proposedChampionKey: best.champion.key,
    proposedName: best.champion.name,
    proposedIcon: best.champion.iconUrl,
    scoreDelta: delta,
    reason:
      best.reasons[0] ?? "Mejor score combinado vs el draft actual",
  };
}
