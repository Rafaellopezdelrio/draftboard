import type { ChampionDb, CounterEntry } from "../types/champion";
import { detectMissingArchetypes } from "./suggestionEngine";
import { i18n } from "../i18n";

interface PredictArgs {
  db: ChampionDb;
  allyKeys: string[];
  enemyKeys: string[];
  /** Broad op.gg matchup counters (candidate vs enemy), fetched live for the
   *  current enemies. Merged ahead of the sparse personal db.counters so the
   *  counter factor reflects real matchup data instead of a flat 0. */
  liveCounters?: CounterEntry[];
}

export interface DraftPrediction {
  winrate: number; // 0-1
  reasons: string[];
}

export function predictDraftWinrate({
  db,
  allyKeys,
  enemyKeys,
  liveCounters = [],
}: PredictArgs): DraftPrediction {
  const reasons: string[] = [];
  let score = 0.5;
  // Prefer broad op.gg matchup data (dense) over the sparse personal
  // db.counters — same merge the suggestion engine uses, so the counter
  // factor below isn't dead when the user has little personal history.
  const counters: CounterEntry[] =
    liveCounters.length > 0 ? [...liveCounters, ...db.counters] : db.counters;

  // Meta tier comparison
  const allyMeta = avgMetaWinrate(db, allyKeys);
  const enemyMeta = avgMetaWinrate(db, enemyKeys);
  if (allyMeta > 0 && enemyMeta > 0) {
    const diff = allyMeta - enemyMeta;
    // Calibration: draft is a real but bounded factor (player skill dominates),
    // so the combined swing across all factors targets ~±0.18 → a 32–68% range
    // for lopsided drafts instead of the old mushy ~45–55% that always read 50%.
    score += diff * 0.8;
    if (diff > 0.02) reasons.push(i18n.t("engine.betterMetaTier"));
    else if (diff < -0.02) reasons.push(i18n.t("engine.enemyMoreMeta"));
  }

  // Archetype completeness
  const allyMissing = detectMissingArchetypes(db, allyKeys);
  const enemyMissing = detectMissingArchetypes(db, enemyKeys);
  const archetypeDelta = (enemyMissing.size - allyMissing.size) * 0.04;
  score += archetypeDelta;
  if (allyMissing.size === 0 && enemyMissing.size > 0) {
    reasons.push(i18n.t("engine.compComplete"));
  } else if (allyMissing.size > 0 && enemyMissing.size === 0) {
    reasons.push(i18n.t("engine.compGaps"));
  }

  // Counter check
  const counterScore = avgCounterScore(counters, allyKeys, enemyKeys);
  if (counterScore > 0.5) {
    reasons.push(i18n.t("engine.goodMatchups"));
    score += (counterScore - 0.5) * 0.6;
  } else if (counterScore < 0.5 && counterScore > 0) {
    reasons.push(i18n.t("engine.badMatchups"));
    score += (counterScore - 0.5) * 0.6;
  }

  return { winrate: clamp01(score), reasons };
}

function avgMetaWinrate(db: ChampionDb, keys: string[]): number {
  if (keys.length === 0) return 0;
  let sum = 0;
  let n = 0;
  for (const k of keys) {
    if (!db.champions[k]) continue;
    // We don't know the champ's drafted role here (only keys), so take its
    // MOST-PLAYED meta entry. The old `.find` against tag-inferred roles
    // grabbed an arbitrary lane — or missed entirely when the champ's real
    // lane wasn't among its DDragon-tag roles, silently dropping it from
    // the team average.
    let best: { winRate: number; pickRate?: number } | null = null;
    for (const x of db.meta) {
      if (x.championKey !== k) continue;
      if (!best || (x.pickRate ?? 0) > (best.pickRate ?? 0)) best = x;
    }
    if (best) {
      sum += best.winRate;
      n++;
    }
  }
  return n === 0 ? 0 : sum / n;
}

function avgCounterScore(
  counters: CounterEntry[],
  allyKeys: string[],
  enemyKeys: string[]
): number {
  if (counters.length === 0 || allyKeys.length === 0 || enemyKeys.length === 0)
    return 0;
  let sum = 0;
  let n = 0;
  for (const ak of allyKeys) {
    for (const ek of enemyKeys) {
      const c = counters.find(
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
  // Guard NaN / Infinity so a bad upstream stat can't surface as "NaN%" in
  // the winrate badge — degrade to the neutral 0.5 instead.
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
