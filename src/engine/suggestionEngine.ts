import type {
  Archetype,
  Champion,
  ChampionDb,
  Role,
} from "../types/champion";
import { counterScore } from "../services/murderBridge";

export interface ScoredSuggestion {
  champion: Champion;
  score: number;
  breakdown: {
    counter: number;
    synergy: number;
    meta: number;
    archetype: number;
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
  limit?: number;
}

const W_COUNTER = 0.4;
const W_SYNERGY = 0.3;
const W_META = 0.2;
const W_ARCHETYPE = 0.1;

export function suggest({
  db,
  role,
  allyKeys,
  enemyKeys,
  bannedKeys,
  limit = 10,
}: SuggestParams): ScoredSuggestion[] {
  const taken = new Set([...allyKeys, ...enemyKeys, ...bannedKeys]);
  const missingArchetypes = detectMissingArchetypes(db, allyKeys);

  const candidates = Object.values(db.champions).filter(
    (c) => !taken.has(c.key) && (role === null || c.roles.includes(role))
  );

  const scored = candidates.map((c) => scoreChampion(c, {
    db,
    role,
    enemyKeys,
    allyKeys,
    missingArchetypes,
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

interface ScoreCtx {
  db: ChampionDb;
  role: Role | null;
  enemyKeys: string[];
  allyKeys: string[];
  missingArchetypes: Set<Archetype>;
}

function scoreChampion(c: Champion, ctx: ScoreCtx): ScoredSuggestion {
  const role = ctx.role ?? c.roles[0];
  const counter = counterScore(c.key, ctx.enemyKeys, role, ctx.db.counters);
  const synergy = synergyScore(c, ctx.allyKeys, ctx.db);
  const meta = metaScore(c.key, role, ctx.db);
  const archetype = archetypeFitScore(c, ctx.missingArchetypes);

  const score =
    W_COUNTER * counter +
    W_SYNERGY * synergy +
    W_META * meta +
    W_ARCHETYPE * archetype;

  const reasons: string[] = [];
  if (counter > 0.55) reasons.push(`countra a enemigos`);
  if (synergy > 0.55) reasons.push(`sinergia con tu equipo`);
  if (meta > 0.55) reasons.push(`fuerte en el meta`);
  if (archetype > 0) reasons.push(`aporta lo que falta`);

  const color: "good" | "meh" | "bad" =
    score >= 0.6 ? "good" : score >= 0.45 ? "meh" : "bad";

  return {
    champion: c,
    score,
    breakdown: { counter, synergy, meta, archetype },
    reasons,
    color,
  };
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
