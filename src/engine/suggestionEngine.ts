import type {
  Archetype,
  Champion,
  ChampionDb,
  Role,
} from "../types/champion";
import { counterScore } from "../services/murderBridge";
import type { ChampionPersonalStat } from "../services/matchRepo";
import type { ChampionMasteryDto } from "../services/riotApi";
import { CHAMPION_ROLES } from "../data/championRoles";

export interface ScoredSuggestion {
  champion: Champion;
  score: number;
  breakdown: {
    counter: number;
    synergy: number;
    meta: number;
    archetype: number;
    /**
     * True when the engine had real enemy/ally picks to evaluate against.
     * UI uses these to render the corresponding bar as "no data" instead
     * of showing the 0.5 placeholder as if it were a real rating.
     */
    hasEnemyData: boolean;
    hasAllyData: boolean;
    /**
     * "Comfort pick" = champ the player actually knows how to play.
     * Threshold is intentionally low (mastery lvl >= 5 OR >=30k points)
     * so it covers picks the user is comfortable with without requiring
     * one-trick devotion. UI uses this to label them in Top Picks.
     */
    isComfort: boolean;
    /**
     * "Pick perfecto" = comfort AND meta-strong (S+/S/A tier).
     * Highlighted with a special badge — represents the IDEAL pick:
     * something you know how to play AND that the meta agrees is strong.
     */
    isPerfectPick: boolean;
    /**
     * Player's mastery level for this champion (1-10 via M1..M10 system).
     * Forwarded raw from LCU /lol-collections so the UI can render a
     * mastery chevron (M5/M6/M7/M10) badge on the champion icon. 0 if
     * the player has never played this champ.
     */
    masteryLevel: number;
  };
  reasons: string[];
  color: "good" | "meh" | "bad";
}

interface SuggestParams {
  db: ChampionDb;
  role: Role | null;
  allyKeys: string[];
  enemyKeys: string[];
  bannedKeys: string[];
  personalStats?: ChampionPersonalStat[];
  masteries?: ChampionMasteryDto[];
  limit?: number;
  /**
   * Player's rank tier (e.g. "GOLD", "DIAMOND"). When null/"UNRANKED",
   * the engine boosts mastery's weight because that's the most reliable
   * personal signal we have when the player has no rank to calibrate
   * against. Forwarded from coachEloBucket prefs.
   */
  rankTier?: string | null;
}

// Engine weights — re-balanced so champion mastery + personal winrate
// have real impact (was 0.05/0.15 → too weak to surface mains).
const RANKED_WEIGHTS = {
  counter: 0.20,
  synergy: 0.10,
  meta: 0.20,
  archetype: 0.10,
  personal: 0.20,
  mastery: 0.20,
} as const;

// For unranked players we lean harder on mastery and lighter on
// personal winrate (often 0 entries) and meta (which is calibrated to
// emerald+ play patterns the unranked player might not match yet).
// Mastery is the most reliable "what champ this person actually knows".
const UNRANKED_WEIGHTS = {
  counter: 0.20,
  synergy: 0.10,
  meta: 0.15,
  archetype: 0.10,
  personal: 0.10,
  mastery: 0.35,
} as const;

function isUnranked(rankTier?: string | null): boolean {
  if (!rankTier) return true;
  const t = rankTier.toUpperCase();
  return t === "UNRANKED" || t === "UNRANK" || t === "NONE" || t === "";
}

export function suggest({
  db,
  role,
  allyKeys,
  enemyKeys,
  bannedKeys,
  personalStats = [],
  masteries = [],
  limit = 10,
  rankTier = null,
}: SuggestParams): ScoredSuggestion[] {
  const weights = isUnranked(rankTier) ? UNRANKED_WEIGHTS : RANKED_WEIGHTS;
  const taken = new Set([...allyKeys, ...enemyKeys, ...bannedKeys]);
  const missingArchetypes = detectMissingArchetypes(db, allyKeys);
  const personalById = new Map<number, ChampionPersonalStat>();
  for (const p of personalStats) personalById.set(p.championId, p);
  const masteryById = new Map<number, ChampionMasteryDto>();
  for (const m of masteries) masteryById.set(m.championId, m);

  const candidates = Object.values(db.champions).filter(
    (c) => !taken.has(c.key) && (role === null || isPlayableInRole(c, role, db))
  );

  const scored = candidates.map((c) => scoreChampion(c, {
    db,
    role,
    enemyKeys,
    allyKeys,
    missingArchetypes,
    personalById,
    masteryById,
    weights,
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

interface EngineWeights {
  counter: number;
  synergy: number;
  meta: number;
  archetype: number;
  personal: number;
  mastery: number;
}

interface ScoreCtx {
  db: ChampionDb;
  role: Role | null;
  enemyKeys: string[];
  allyKeys: string[];
  missingArchetypes: Set<Archetype>;
  personalById: Map<number, ChampionPersonalStat>;
  masteryById: Map<number, ChampionMasteryDto>;
  weights: EngineWeights;
}

function scoreChampion(c: Champion, ctx: ScoreCtx): ScoredSuggestion {
  const role = ctx.role ?? c.roles[0];
  const counter = counterScore(c.key, ctx.enemyKeys, role, ctx.db.counters);
  const synergy = synergyScore(c, ctx.allyKeys, ctx.db);
  const meta = metaScore(c.key, role, ctx.db);
  const archetype = archetypeFitScore(c, ctx.missingArchetypes);
  const champIdNum = Number(c.key);
  const personal = personalScore(champIdNum, ctx.personalById);
  const mastery = masteryScore(champIdNum, ctx.masteryById);

  const w = ctx.weights;
  let score =
    w.counter * counter +
    w.synergy * synergy +
    w.meta * meta +
    w.archetype * archetype +
    w.personal * personal +
    w.mastery * mastery;

  // "Main dominance" boost: a true one-trick (M10+ AND 100k+ pts AND personal WR≥50% if known)
  // gets a flat +12% bump so it ranks above generic S-tier meta picks. This reflects
  // what the user expects: "if I main this champion, suggest it first".
  const masteryEntry = ctx.masteryById.get(Number(c.key));
  const isOneTrick = !!(masteryEntry &&
    masteryEntry.championLevel >= 10 &&
    masteryEntry.championPoints >= 100000);
  const personalEntry = ctx.personalById.get(Number(c.key));
  const personalNotBad = !personalEntry || personalEntry.winRate >= 0.45;
  if (isOneTrick && personalNotBad) {
    score += 0.12;
  }

  // "Comfort pick" — lower threshold than one-trick. Covers champs the
  // user is familiar with: mastery level 5+ OR 30k+ points. Used both
  // for UI labelling and the "pick perfecto" detection below.
  const isComfort = !!(masteryEntry &&
    (masteryEntry.championLevel >= 5 || masteryEntry.championPoints >= 30000));
  // "Pick perfecto" — comfort AND meta-strong. We read the MetaTier label
  // directly because the meta score is already 0-1 normalised and we lose
  // the original S+/S/A distinction. Anything from A-tier upwards counts.
  const metaEntry = ctx.db.meta.find(
    (m) => m.championKey === c.key && m.role === role
  );
  const isMetaStrong =
    metaEntry?.tier === "S+" ||
    metaEntry?.tier === "S" ||
    metaEntry?.tier === "A";
  const isPerfectPick = isComfort && isMetaStrong;

  const reasons: string[] = [];
  // "Pick perfecto" is the highest praise — show it first when present.
  if (isPerfectPick) reasons.push(`pick perfecto`);
  if (mastery >= 0.95) reasons.push(`tu main`);
  else if (mastery > 0.75) reasons.push(`lo dominas`);
  else if (isComfort) reasons.push(`comfort`);
  if (personal > 0.6) reasons.push(`tu winrate ${(personal * 100).toFixed(0)}%`);
  if (counter > 0.55) reasons.push(`countra a enemigos`);
  if (synergy > 0.55) reasons.push(`sinergia con tu equipo`);
  if (meta > 0.55) reasons.push(`fuerte en el meta`);
  if (archetype > 0) reasons.push(`aporta lo que falta`);

  const color: "good" | "meh" | "bad" =
    score >= 0.6 ? "good" : score >= 0.45 ? "meh" : "bad";

  return {
    champion: c,
    score,
    breakdown: {
      counter,
      synergy,
      meta,
      archetype,
      hasEnemyData: ctx.enemyKeys.length > 0,
      hasAllyData: ctx.allyKeys.length > 0,
      isComfort,
      isPerfectPick,
      masteryLevel: masteryEntry?.championLevel ?? 0,
    },
    reasons,
    color,
  };
}

/**
 * Strict role check. Multi-layer ordering:
 *   1. Hardcoded authoritative champion-role map (CHAMPION_ROLES) — covers
 *      ~170 champions with their actual current-meta playable roles.
 *   2. Synced meta data with min playrate (when available).
 *   3. Loose tag-based inference (last resort for brand-new champions).
 *
 * Fixes the "Zilean appears in MID" and "Lee Sin appears in MID" bugs.
 */
function isPlayableInRole(c: Champion, role: Role, db: ChampionDb): boolean {
  // 1) Authoritative hardcoded list (curated per patch)
  const authoritativeRoles = CHAMPION_ROLES[c.id];
  if (authoritativeRoles) {
    return authoritativeRoles.includes(role);
  }
  // 2) Synced meta data with min playrate
  const champEntries = db.meta.filter((m) => m.championKey === c.key);
  if (champEntries.length > 0) {
    const inRole = champEntries.find((m) => m.role === role);
    return !!inRole && (inRole.pickRate ?? 0) >= 0.003;
  }
  // 3) Brand-new champion not yet in our list — loose tag fallback
  return c.roles.includes(role);
}

function personalScore(
  championId: number,
  personalById: Map<number, ChampionPersonalStat>
): number {
  const p = personalById.get(championId);
  if (!p || p.games < 3) return 0.5;
  return p.winRate;
}

function masteryScore(
  championId: number,
  masteryById: Map<number, ChampionMasteryDto>
): number {
  const m = masteryById.get(championId);
  if (!m) return 0.2; // unknown champion → low signal (was 0.3, slightly more punishing)
  // Combine level + points. M7+ with 100k+ = top one-trick territory.
  let score = 0.4;
  if (m.championLevel >= 10) score = 1.0;
  else if (m.championLevel >= 7) score = 0.85;
  else if (m.championLevel >= 5) score = 0.7;
  else if (m.championLevel >= 3) score = 0.55;
  // Bonus for high points (one-trick)
  if (m.championPoints >= 200000) score = Math.min(1.0, score + 0.1);
  else if (m.championPoints >= 100000) score = Math.min(1.0, score + 0.05);
  return score;
}

function synergyScore(
  c: Champion,
  allyKeys: string[],
  db: ChampionDb
): number {
  if (allyKeys.length === 0) return 0.5;
  const myArch = new Set(c.archetypes);
  let overlap = 0;
  for (const k of allyKeys) {
    const ally = db.champions[k];
    if (!ally) continue;
    for (const a of ally.archetypes) if (myArch.has(a)) overlap++;
  }
  // Some overlap = synergy; too much = redundancy. Sweet spot around 1-2.
  if (overlap === 0) return 0.4;
  if (overlap <= 2) return 0.7;
  return 0.5;
}

function metaScore(key: string, role: Role, db: ChampionDb): number {
  const m = db.meta.find((x) => x.championKey === key && x.role === role);
  if (!m) return 0.5;
  switch (m.tier) {
    case "S+":
      // dpm.lol-only top bucket — tierScore >= 60. Stronger signal than S.
      return 0.98;
    case "S":
      return 0.95;
    case "A":
      return 0.8;
    case "B":
      return 0.6;
    case "C":
      return 0.4;
    case "D":
      return 0.2;
    default:
      // Defensive: scrapers normalise tier to S+/S/A/B/C/D, but a future
      // source change must never yield undefined here → NaN score → broken
      // sort. Neutral 0.5 keeps the champ rankable.
      return 0.5;
  }
}

function archetypeFitScore(c: Champion, missing: Set<Archetype>): number {
  if (missing.size === 0) return 0;
  for (const a of c.archetypes) if (missing.has(a)) return 1;
  return 0;
}

const ARCHETYPE_GOALS: Archetype[] = ["engage", "frontline", "peel"];

export function detectMissingArchetypes(
  db: ChampionDb,
  allyKeys: string[]
): Set<Archetype> {
  const present = new Set<Archetype>();
  for (const k of allyKeys) {
    const c = db.champions[k];
    if (!c) continue;
    for (const a of c.archetypes) present.add(a);
  }
  const missing = new Set<Archetype>();
  for (const a of ARCHETYPE_GOALS) if (!present.has(a)) missing.add(a);
  return missing;
}
