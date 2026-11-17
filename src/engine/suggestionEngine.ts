import type {
  Archetype,
  Champion,
  ChampionDb,
  CounterEntry,
  Role,
} from "../types/champion";
import { MIN_COUNTER_SAMPLE } from "../services/murderBridge";
import type { ChampionPersonalStat } from "../services/matchRepo";
import type { ChampionMasteryDto } from "../services/riotApi";
import { CHAMPION_ROLES } from "../data/championRoles";
import { inferEnemyRoles } from "../data/matchupTips";
import { AP_ASSASSINS, profileEnemyComp, type CompProfile } from "./adaptiveBuildEngine";
import { useDraftStore } from "../state/draftStore";

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
    /** How well the pick fits this game (matchups, enemy comp, own team,
     * meta), comfort aside. 0-1. Picks the "best for this game" entry. */
    fit: number;
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
  /**
   * Broad op.gg matchup counters (candidate vs enemy) fetched live for the
   * current enemies — see services/enemyCounters. Merged on top of the
   * user's sparse personal `db.counters` so the counter dimension actually
   * differentiates picks instead of returning a flat neutral 0.5.
   */
  liveCounters?: CounterEntry[];
  /**
   * The local player's own hovered/locked champion. The LCU sync writes it
   * into the player's ally slot, so it arrives inside `allyKeys`; it is
   * dropped here so your own hover stays a candidate and is not scored as a
   * teammate. Defaults to the draft store's selection; pass null to disable.
   */
  selfKey?: string | null;
}

// How a pick is chosen (owner, 2026-11-17): the champions you play filter,
// the game in front of you decides. "Your most played" is not "the right
// pick for this draft". Before, comfort was a weighted dimension like the
// rest and in practice swamped the draft: mastery could move a pick by 0.28,
// a 45% vs 55% matchup by 0.02.
//
//   score = draft fit (matchups, enemy comp, own team) + meta + comfort step
//
// Comfort is a STEP, not a slope: inside your pool comfort differences do not
// decide, the draft does. A pick outside it needs a clearly better game.
const DRAFT_WEIGHTS = {
  ranked: { context: 0.5, meta: 0.25 },
  // Meta is calibrated on ranked play; unranked leans on the draft instead.
  unranked: { context: 0.6, meta: 0.15 },
} as const;
const POOL_BONUS = 0.25; // a champion you play now
const KNOWN_BONUS = 0.12; // one you have played some, or a while ago
// Inside the draft fit: the lane matchup first, then what the enemy team
// does, then your own team.
const CONTEXT_PARTS = { counter: 0.55, comp: 0.2, synergy: 0.1, archetype: 0.15 } as const;
/** Matchup win rates sit around 45-55%: stretch so ±10 points spans 0..1. */
const COUNTER_STRETCH = 5;
/** The lane opponent counts double against the other enemies. */
const LANE_OPPONENT_WEIGHT = 2;
/** "Best for this game" only when it fits clearly better than your #1
 * (about a 2-point better matchup plus a grade, or more). In a check on the
 * owner's jungle drafts it showed in 8 of 56. */
const BEST_FOR_DRAFT_MARGIN = 0.05;

function isUnranked(rankTier?: string | null): boolean {
  if (!rankTier) return true;
  const t = rankTier.toUpperCase();
  return t === "UNRANKED" || t === "UNRANK" || t === "NONE" || t === "";
}

export function suggest({
  db,
  role,
  allyKeys: allyKeysWithSelf,
  enemyKeys,
  bannedKeys,
  personalStats = [],
  masteries = [],
  limit = 10,
  rankTier = null,
  liveCounters = [],
  selfKey,
}: SuggestParams): ScoredSuggestion[] {
  const self =
    selfKey !== undefined
      ? selfKey
      : (() => {
          const s = useDraftStore.getState();
          return s.myChampionLocked ?? s.myChampionIntent;
        })();
  const allyKeys = self
    ? allyKeysWithSelf.filter((k) => k !== self)
    : allyKeysWithSelf;
  const weights = isUnranked(rankTier) ? DRAFT_WEIGHTS.unranked : DRAFT_WEIGHTS.ranked;
  const taken = new Set([...allyKeys, ...enemyKeys, ...bannedKeys]);
  // Who plays the same lane on the other side (guessed from the champions in
  // champ select), and what their team as a whole does.
  const enemyRoles = role ? inferEnemyRoles(enemyKeys.map((k) => db.champions[k]?.id)) : [];
  const laneOpponent = role ? (enemyKeys[enemyRoles.indexOf(role)] ?? null) : null;
  const enemyComp = enemyKeys.length > 0 ? profileEnemyComp(db, enemyKeys) : null;
  const enemyArchetypes = countArchetypes(db, enemyKeys);
  const allyDamage = damageSplit(db, allyKeys);
  // With fewer than 2 teammates picked nothing is "missing" yet: every gap
  // would count and reward any tank or peeler regardless of the team.
  const missingArchetypes = allyKeys.length >= 2 ? detectMissingArchetypes(db, allyKeys) : new Set<Archetype>();
  const personalById = new Map<number, ChampionPersonalStat>();
  for (const p of personalStats) personalById.set(p.championId, p);
  const masteryById = new Map<number, ChampionMasteryDto>();
  for (const m of masteries) masteryById.set(m.championId, m);

  // Live op.gg matchup counters take priority over the user's sparse personal
  // counters: concatenating with liveCounters FIRST means counterScore's
  // `.find` hits a broad-data entry before the personal one for the same pair.
  const counters: CounterEntry[] =
    liveCounters.length > 0 ? [...liveCounters, ...db.counters] : db.counters;

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
    counters,
    laneOpponent,
    enemyComp,
    enemyArchetypes,
    allyDamage,
  }));

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  // "Best for this game": the strongest draft fit when it is not one of your
  // champions, shown (and labelled) even if your pool fills the list — the
  // ideal pick next to what you play. Only with enemies on the board, where
  // "this game" means something.
  if (enemyKeys.length > 0 && top.length > 0) {
    const best = scored.reduce((a, b) => (b.breakdown.fit > a.breakdown.fit ? b : a));
    if (best !== top[0] && !best.breakdown.isComfort && best.breakdown.fit - top[0].breakdown.fit >= BEST_FOR_DRAFT_MARGIN) {
      best.reasons.unshift("suggestions.reason.bestForDraft");
      if (!top.includes(best)) top[top.length - 1] = best;
    }
  }
  return top;
}

/** Average matchup win rate that counts as "good against them" / "hard lane". */
const COUNTER_GOOD = 0.52;
const COUNTER_BAD = 0.48;

interface EngineWeights {
  context: number;
  meta: number;
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
  counters: CounterEntry[];
  laneOpponent: string | null;
  enemyComp: CompProfile | null;
  enemyArchetypes: Map<Archetype, number>;
  allyDamage: { magic: number; physical: number };
}

function scoreChampion(c: Champion, ctx: ScoreCtx): ScoredSuggestion {
  const role = ctx.role ?? c.roles[0];
  // Raw matchup win rate (lane opponent counted double) for labels and the
  // UI bar; stretched for the score so a 45% vs 55% lane actually matters.
  const counter = laneWeightedCounter(c.key, ctx.enemyKeys, ctx.laneOpponent, role, ctx.counters);
  const counterEdge = clamp01(0.5 + (counter - 0.5) * COUNTER_STRETCH);
  const synergy = synergyScore(c, ctx.allyKeys, ctx.db);
  const meta = metaScore(c.key, role, ctx.db);
  const archetype = archetypeFitScore(c, ctx.missingArchetypes);
  const comp = compFitScore(c, ctx);
  const champIdNum = Number(c.key);
  const personal = personalScore(champIdNum, ctx.personalById);
  const mastery = masteryScore(champIdNum, ctx.masteryById);
  const masteryEntry = ctx.masteryById.get(champIdNum);

  const context =
    CONTEXT_PARTS.counter * counterEdge +
    CONTEXT_PARTS.comp * comp +
    CONTEXT_PARTS.synergy * synergy +
    CONTEXT_PARTS.archetype * archetype;
  const w = ctx.weights;
  // How well the pick fits THIS game, comfort aside (0-1).
  const fit = (w.context * context + w.meta * meta) / (w.context + w.meta);
  const tier = comfortTier(mastery, ctx.personalById.get(champIdNum));
  const score = Math.min(
    1,
    w.context * context + w.meta * meta + (tier === "pool" ? POOL_BONUS : tier === "known" ? KNOWN_BONUS : 0)
  );

  // "Comfort pick" = a champion of your current pool (played now: recent
  // mastery or several games). Used for UI labelling and "pick perfecto".
  const isComfort = tier === "pool";
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

  // Reasons are i18n KEYS (suggestions.reason.*) resolved by the panel via t(),
  // except the winrate line which is a language-neutral literal ("WR 65%") that
  // passes through t() unchanged. The panel also matches keys for logic (e.g.
  // the one-trick crown checks for suggestions.reason.main).
  const reasons: string[] = [];
  if (isPerfectPick) reasons.push("suggestions.reason.perfectPick");
  if (mastery >= 0.95) reasons.push("suggestions.reason.main");
  else if (mastery > 0.75) reasons.push("suggestions.reason.youKnowIt");
  else if (isComfort) reasons.push("suggestions.reason.comfort");
  if (personal > 0.6) reasons.push(`WR ${(personal * 100).toFixed(0)}%`);
  // Real matchup win rates sit around 47-53%: 52+ is already a clear edge
  // (the old 55% bar almost never fired, so "good against them" never showed).
  if (counter >= COUNTER_GOOD) reasons.push("suggestions.reason.counters");
  // Surface the trade-off: a pick can top the list on meta/mastery yet have a
  // losing lane. Flag it so "best overall" doesn't read as "best matchup".
  else if (counter <= COUNTER_BAD) reasons.push("suggestions.reason.hardMatchup");
  if (synergy > 0.55) reasons.push("suggestions.reason.synergy");
  if (comp >= 0.65) reasons.push("suggestions.reason.answersComp");
  if (meta > 0.55) reasons.push("suggestions.reason.strongMeta");
  if (archetype > 0) reasons.push("suggestions.reason.fillsGap");

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
      fit,
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

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Average matchup win rate of `key` against the enemies with real data
 * (op.gg pairs under MIN_COUNTER_SAMPLE games are noise), the lane opponent
 * counted LANE_OPPONENT_WEIGHT times. 0.5 with no data.
 */
function laneWeightedCounter(
  key: string,
  enemyKeys: string[],
  laneOpponent: string | null,
  role: Role,
  counters: CounterEntry[]
): number {
  let total = 0;
  let weight = 0;
  for (const enemy of enemyKeys) {
    const entry = counters.find(
      (c) => c.championKey === key && c.vsChampionKey === enemy && c.role === role && c.sampleSize >= MIN_COUNTER_SAMPLE
    );
    if (!entry) continue;
    const w = enemy === laneOpponent ? LANE_OPPONENT_WEIGHT : 1;
    total += entry.winRate * w;
    weight += w;
  }
  return weight === 0 ? 0.5 : total / weight;
}

type DamageKind = "magic" | "physical" | null;
/** Main damage of a champion, from its class tags (same reading as builds). */
function damageKind(c: Champion): DamageKind {
  const t = new Set(c.tags);
  if (t.has("Assassin")) return AP_ASSASSINS.has(c.id) || t.has("Mage") ? "magic" : "physical";
  if (t.has("Mage")) return "magic";
  if (t.has("Marksman") || t.has("Fighter")) return "physical";
  return null; // tanks and enchanters: not a damage source to balance
}

function damageSplit(db: ChampionDb, keys: string[]): { magic: number; physical: number } {
  const out = { magic: 0, physical: 0 };
  for (const k of keys) {
    const c = db.champions[k];
    const kind = c ? damageKind(c) : null;
    if (kind) out[kind]++;
  }
  return out;
}

function countArchetypes(db: ChampionDb, keys: string[]): Map<Archetype, number> {
  const out = new Map<Archetype, number>();
  for (const k of keys) for (const a of db.champions[k]?.archetypes ?? []) out.set(a, (out.get(a) ?? 0) + 1);
  return out;
}

/**
 * Does the pick answer what the enemy team does, and balance your own
 * damage? 0.5 = nothing to say. Kept to plain draft rules:
 *  - enemy dives / engages a lot (3+) → peel or frontline helps
 *  - enemy pokes (2+) → engage closes the gap
 *  - enemy has 2+ assassins → frontline or peel helps survive them
 *  - your team already deals mostly one damage type (3+ sources, ≥75%) →
 *    the other type helps, more of the same hurts (one resist item counters it)
 */
function compFitScore(c: Champion, ctx: ScoreCtx): number {
  let s = 0.5;
  const mine = new Set(c.archetypes);
  const e = ctx.enemyComp;
  const enemyEngage = (ctx.enemyArchetypes.get("engage") ?? 0) + (e?.divers ?? 0);
  if (enemyEngage >= 3 && (mine.has("peel") || mine.has("frontline"))) s += 0.15;
  if ((ctx.enemyArchetypes.get("poke") ?? 0) >= 2 && mine.has("engage")) s += 0.15;
  if ((e?.burstThreats ?? 0) >= 2 && (mine.has("frontline") || mine.has("peel"))) s += 0.1;
  const { magic, physical } = ctx.allyDamage;
  const sources = magic + physical;
  const kind = damageKind(c);
  if (sources >= 3 && kind) {
    const heavy = magic / sources >= 0.75 ? "magic" : physical / sources >= 0.75 ? "physical" : null;
    if (heavy) s += kind === heavy ? -0.15 : 0.2;
  }
  return clamp01(s);
}

type ComfortTier = "pool" | "known" | null;
/**
 * Whether you play a champion NOW. Pool: recent mastery (score ≥ 0.7, e.g.
 * M5 played this month, M7 within 90 days) or 3+ games in this role. Known:
 * some mastery or a game. Losing a lot on it (shrunk win rate under 42%
 * over 5+ games) drops a pool pick to known.
 */
function comfortTier(mastery: number, p: ChampionPersonalStat | undefined): ComfortTier {
  const games = p?.games ?? 0;
  const shrunk = p ? (p.wins + 2.5) / (p.games + 5) : 0.5;
  let tier: ComfortTier = null;
  if (games >= 3 || mastery >= 0.7) tier = "pool";
  else if (games >= 1 || mastery >= 0.5) tier = "known";
  if (tier === "pool" && games >= 5 && shrunk < 0.42) tier = "known";
  return tier;
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
  // Mastery is lifetime: a champion mained two years ago and not touched since
  // kept topping every draft. What counts is what the player plays now.
  return 0.2 + (score - 0.2) * masteryRecency(m.lastPlayTime);
}

/**
 * Share of a champion's mastery that still counts, by how long ago it was
 * last played: full within 30 days, 85% within 90, 60% within a year, 40%
 * beyond. No date (0 or missing) → full, as before.
 */
export function masteryRecency(lastPlayTime: number | undefined, now = Date.now()): number {
  if (!lastPlayTime) return 1;
  const days = (now - lastPlayTime) / 86_400_000;
  if (days <= 30) return 1;
  if (days <= 90) return 0.85;
  if (days <= 365) return 0.6;
  return 0.4;
}

// Complementary archetype pairings — established comp synergies where one side
// sets up or protects the other: engage enables burst/dps, a peeler protects a
// hypercarry dps, a frontline lets backline carries deal damage safely. This
// replaces the old "shared archetype = synergy" rule, which wrongly rewarded
// REDUNDANCY (two engage tanks scored as synergistic).
const SYNERGY_PAIRS: ReadonlyArray<readonly [Archetype, Archetype]> = [
  ["engage", "burst"],
  ["engage", "sustain-dps"],
  ["peel", "sustain-dps"],
  ["frontline", "sustain-dps"],
  ["frontline", "poke"],
];

function synergyScore(
  c: Champion,
  allyKeys: string[],
  db: ChampionDb
): number {
  if (allyKeys.length === 0) return 0.5;
  const mine = new Set(c.archetypes);
  let pairings = 0;
  for (const k of allyKeys) {
    const ally = db.champions[k];
    if (!ally) continue;
    const theirs = new Set(ally.archetypes);
    for (const [a, b] of SYNERGY_PAIRS) {
      if ((mine.has(a) && theirs.has(b)) || (mine.has(b) && theirs.has(a))) {
        pairings++;
        break; // count each ally once — don't over-reward a multi-tag ally
      }
    }
  }
  // Neutral 0.5; each ally this pick complements nudges up. Bounded so synergy
  // (a 0.10-weight dimension) can't swamp meta/counter.
  return Math.min(0.85, 0.5 + pairings * 0.1);
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
