import type { ChampionDb } from "../types/champion";
import { detectMissingArchetypes } from "./suggestionEngine";

interface PredictArgs {
  db: ChampionDb;
  allyKeys: string[];
  enemyKeys: string[];
}

export interface DraftPrediction {
  winrate: number; // 0-1
  reasons: string[];
}

export function predictDraftWinrate({
  db,
  allyKeys,
  enemyKeys,
}: PredictArgs): DraftPrediction {
  const reasons: string[] = [];
  let score = 0.5;

  // Meta tier comparison
  const allyMeta = avgMetaWinrate(db, allyKeys);
  const enemyMeta = avgMetaWinrate(db, enemyKeys);
  if (allyMeta > 0 && enemyMeta > 0) {
    const diff = allyMeta - enemyMeta;
    score += diff * 0.5;
    if (diff > 0.02) reasons.push("Tienes mejor meta tier");
    else if (diff < -0.02) reasons.push("Equipo enemigo más meta");
  }

  // Archetype completeness
  const allyMissing = detectMissingArchetypes(db, allyKeys);
  const enemyMissing = detectMissingArchetypes(db, enemyKeys);
  const archetypeDelta = (enemyMissing.size - allyMissing.size) * 0.03;
  score += archetypeDelta;
  if (allyMissing.size === 0 && enemyMissing.size > 0) {
    reasons.push("Tu comp está completa, la enemiga no");
  } else if (allyMissing.size > 0 && enemyMissing.size === 0) {
    reasons.push("Tu comp tiene huecos");
  }

  // Counter check
  const counterScore = avgCounterScore(db, allyKeys, enemyKeys);
  if (counterScore > 0.5) {
    reasons.push("Buenos matchups");
    score += (counterScore - 0.5) * 0.3;
  } else if (counterScore < 0.5 && counterScore > 0) {
    reasons.push("Matchups desfavorables");
    score += (counterScore - 0.5) * 0.3;
  }

  return { winrate: clamp01(score), reasons };
}

function avgMetaWinrate(db: ChampionDb, keys: string[]): number {
  if (keys.length === 0) return 0;
  let sum = 0;
  let n = 0;
  for (const k of keys) {
    const champ = db.champions[k];
    if (!champ) continue;
    const m = db.meta.find(
      (x) => x.championKey === k && champ.roles.includes(x.role)
    );
    if (m) {
      sum += m.winRate;
      n++;
    }
  }
  return n === 0 ? 0 : sum / n;
}

function avgCounterScore(
  db: ChampionDb,
  allyKeys: string[],
  enemyKeys: string[]
): number {
  if (db.counters.length === 0 || allyKeys.length === 0 || enemyKeys.length === 0)
    return 0;
  let sum = 0;
  let n = 0;
  for (const ak of allyKeys) {
    for (const ek of enemyKeys) {
      const c = db.counters.find(
        (x) => x.championKey === ak && x.vsChampionKey === ek
      );
      if (c) {
        sum += c.winRate;
        n++;
      }
    }
  }
  return n === 0 ? 0 : sum / n;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
