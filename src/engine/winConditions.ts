// Win Conditions engine. Derives a 3-point game plan from the team
// composition + the user's champion. Pure heuristic: classifies both
// teams' damage shape, durability, and engage tools, then emits the
// short tactical bullets that "fit" the comp.
//
// Used by WinConditionsPanel to surface a "Game plan" card at champ
// select. Lets the user enter the game with a clear macro objective
// instead of just a pick recommendation. Gold-standard advice quality
// here is what separates a draft tool from a CS-counter.

import type { Champion, ChampionDb, Role } from "../types/champion";

export type CompArchetype =
  | "engage-front-back"   // tanky frontline + carries behind
  | "poke-siege"          // long-range AP + waveclear
  | "pick-burst"          // assassins + lockdown
  | "scaling-late"        // hyper-carries needing time
  | "early-skirmish"      // dive + bruiser brawl
  | "split-1-4"           // 1 carry pushes side, 4 group
  | "mixed";              // no clear archetype

export interface CompProfile {
  archetype: CompArchetype;
  apShare: number;       // 0-1
  adShare: number;       // 0-1
  trueDmg: number;       // count of champs with significant true damage
  engageScore: number;   // sum of hard-engage tools (0..N)
  diveScore: number;     // sum of dive threats
  rangeScore: number;    // weighted long-range presence
  scaleScore: number;    // weighted hyper-carry presence
}

export interface WinCondition {
  /** i18n key for the tactical objective (winConditions.rules.*). The panel
   *  resolves it via t() so advice is localized, not hardcoded Spanish. */
  key: string;
  /** Optional interpolation params for the key (e.g. champion name). */
  params?: Record<string, string | number>;
  /** Phase of the game this applies to. UI sorts by phase. */
  phase: "early" | "mid" | "late" | "any";
  /** Priority — UI may bold the top 2 and grey the rest. */
  priority: 1 | 2 | 3;
}

// Curated champion → trait sets. Same approach as adaptiveBuildEngine —
// small enough to maintain across patches, large enough to cover most
// SoloQ rosters.
const HARD_ENGAGE = new Set([
  "Leona", "Nautilus", "Malphite", "Sett", "Amumu", "Ashe", "Lissandra",
  "Morgana", "Maokai", "Sejuani", "Rell", "Skarner", "Alistar", "Jarvan IV",
  "Galio", "Ornn", "Kennen", "Hecarim", "Rumble",
]);

const DIVE_THREATS = new Set([
  "Camille", "Hecarim", "Irelia", "Jarvan IV", "Vi", "Diana", "Wukong",
  "Olaf", "Lee Sin", "Kha'Zix", "Talon", "Zed", "Akali", "Kassadin", "Yone",
  "Yasuo", "Master Yi", "Tryndamere",
]);

const LONG_RANGE = new Set([
  "Caitlyn", "Jinx", "Varus", "Lux", "Xerath", "Ziggs", "Vel'Koz", "Karthus",
  "Senna", "Heimerdinger", "Zoe", "Ezreal",
]);

const HYPER_CARRY_LATE = new Set([
  "Vayne", "Kog'Maw", "Twitch", "Kayle", "Nasus", "Veigar", "Senna",
  "Master Yi", "Smolder", "Aphelios",
]);

const TRUE_DMG = new Set(["Vayne", "Kayle", "Camille", "Fiora", "Master Yi"]);

const SPLIT_PUSHERS = new Set([
  "Camille", "Fiora", "Trundle", "Tryndamere", "Jax", "Yorick", "Nasus",
  "Sett", "Riven", "Irelia",
]);

// Exported: CompAnalysis renders the AD/AP/true-damage split from the same
// profile the win-condition engine reasons over (one source of truth).
export function profileTeam(db: ChampionDb, keys: string[]): CompProfile {
  let ap = 0, ad = 0;
  let trueDmg = 0;
  let engageScore = 0;
  let diveScore = 0;
  let rangeScore = 0;
  let scaleScore = 0;

  for (const k of keys) {
    const c = db.champions[k];
    if (!c) continue;
    const tags = new Set(c.tags);
    if (tags.has("Mage") || tags.has("Support")) ap++;
    if (tags.has("Marksman") || tags.has("Fighter")) ad++;
    // Assassins are bi-damage; split by name
    if (tags.has("Assassin")) {
      if (["Akali", "Diana", "Ekko", "Evelynn", "Fizz", "Katarina", "Kassadin", "LeBlanc"].includes(c.name)) ap++;
      else ad++;
    }
    if (TRUE_DMG.has(c.name)) trueDmg++;
    if (HARD_ENGAGE.has(c.name)) engageScore++;
    if (DIVE_THREATS.has(c.name)) diveScore++;
    if (LONG_RANGE.has(c.name)) rangeScore++;
    if (HYPER_CARRY_LATE.has(c.name)) scaleScore += 1.5;
  }
  const total = Math.max(1, ap + ad);
  return {
    archetype: classifyArchetype(engageScore, rangeScore, diveScore, scaleScore),
    apShare: ap / total,
    adShare: ad / total,
    trueDmg,
    engageScore,
    diveScore,
    rangeScore,
    scaleScore,
  };
}

function classifyArchetype(
  engage: number,
  range: number,
  dive: number,
  scale: number
): CompArchetype {
  // Heuristic priority order — first signal that crosses threshold wins.
  if (range >= 3) return "poke-siege";
  if (engage >= 2 && scale >= 2) return "engage-front-back";
  if (dive >= 2 && engage <= 1) return "pick-burst";
  if (scale >= 3) return "scaling-late";
  if (dive >= 3) return "early-skirmish";
  if (dive >= 1 && scale >= 1) return "split-1-4";
  return "mixed";
}

interface DeriveArgs {
  db: ChampionDb;
  myChampionKey: string | null;
  myRole: Role | null;
  allyKeys: string[];
  enemyKeys: string[];
}

/**
 * Returns 3-5 win conditions tailored to the actual comp matchup.
 * Bias toward concrete actions the user can take ("Push waves before
 * Drake spawn") rather than vague platitudes ("play safely"). UI
 * renders them top-priority first.
 */
export function deriveWinConditions({
  db,
  myChampionKey,
  myRole,
  allyKeys,
  enemyKeys,
}: DeriveArgs): WinCondition[] {
  const myChamp: Champion | null =
    myChampionKey ? (db.champions[myChampionKey] ?? null) : null;
  const allies = profileTeam(db, allyKeys.filter((k): k is string => Boolean(k)));
  const enemies = profileTeam(db, enemyKeys.filter((k): k is string => Boolean(k)));
  const conditions: WinCondition[] = [];

  // ---- Macro: when to fight based on comp shape ----
  if (enemies.archetype === "poke-siege") {
    conditions.push({ key: "winConditions.rules.enemyPokeSiege", phase: "mid", priority: 1 });
  } else if (enemies.archetype === "engage-front-back") {
    conditions.push({ key: "winConditions.rules.enemyEngageFrontBack", phase: "mid", priority: 1 });
  } else if (enemies.archetype === "pick-burst") {
    conditions.push({ key: "winConditions.rules.enemyPickBurst", phase: "mid", priority: 1 });
  } else if (enemies.archetype === "scaling-late") {
    conditions.push({ key: "winConditions.rules.enemyScalingLate", phase: "early", priority: 1 });
  } else if (enemies.archetype === "early-skirmish") {
    conditions.push({ key: "winConditions.rules.enemyEarlySkirmish", phase: "early", priority: 1 });
  } else if (enemies.archetype === "split-1-4") {
    conditions.push({ key: "winConditions.rules.enemySplit14", phase: "mid", priority: 2 });
  }

  // ---- Ally-side game plan ----
  if (allies.archetype === "scaling-late") {
    conditions.push({ key: "winConditions.rules.allyScalingLate", phase: "early", priority: 1 });
  }
  if (allies.archetype === "engage-front-back" && allies.engageScore >= 2) {
    conditions.push({ key: "winConditions.rules.allyEngageHard", phase: "mid", priority: 2 });
  }
  if (allies.archetype === "split-1-4" || (myChamp && SPLIT_PUSHERS.has(myChamp.name))) {
    conditions.push({ key: "winConditions.rules.allySplitPush", phase: "late", priority: 2 });
  }

  // ---- Damage type vs enemy durability ----
  if (enemies.apShare >= 0.55 && allies.adShare >= 0.6) {
    conditions.push({ key: "winConditions.rules.dmgApVsAd", phase: "mid", priority: 2 });
  }
  if (enemies.adShare >= 0.55 && allies.apShare >= 0.6) {
    conditions.push({ key: "winConditions.rules.dmgAdVsAp", phase: "mid", priority: 2 });
  }

  // ---- True damage threat ----
  if (enemies.trueDmg >= 2) {
    conditions.push({ key: "winConditions.rules.trueDmg", phase: "late", priority: 2 });
  }

  // ---- My champion-specific late game ----
  if (myChamp && HYPER_CARRY_LATE.has(myChamp.name)) {
    conditions.push({
      key: "winConditions.rules.myHypercarry",
      params: { name: myChamp.name },
      phase: "late",
      priority: 1,
    });
  }
  if (myChamp && LONG_RANGE.has(myChamp.name) && enemies.diveScore >= 2) {
    conditions.push({ key: "winConditions.rules.myLongRangeVsDive", phase: "mid", priority: 2 });
  }

  // ---- Role-specific, comp-tied tip (uses myRole) ----
  const roleTip = roleCondition(myRole, myChamp, allies, enemies);
  if (roleTip) conditions.push(roleTip);

  // ---- Default if comp is mixed ----
  if (conditions.length === 0) {
    conditions.push({ key: "winConditions.rules.defaultMixed", phase: "any", priority: 2 });
  }

  // Sort by priority asc, then by phase order
  const phaseOrder = { early: 0, mid: 1, late: 2, any: 3 };
  conditions.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return phaseOrder[a.phase] - phaseOrder[b.phase];
  });

  // Cap at 4 — too many bullets and the user stops reading.
  return conditions.slice(0, 4);
}

/**
 * One role-specific win condition, tied to the comp shape so it stays a
 * concrete read ("ward flanks vs their pick comp") instead of a platitude
 * ("play safe"). Returns null when a more specific condition already covers it.
 */
function roleCondition(
  myRole: Role | null,
  myChamp: Champion | null,
  allies: CompProfile,
  enemies: CompProfile
): WinCondition | null {
  switch (myRole) {
    case "JUNGLE":
      if (allies.archetype === "scaling-late")
        return { key: "winConditions.rules.roleJungleScaling", phase: "early", priority: 2 };
      if (enemies.archetype === "early-skirmish" || enemies.diveScore >= 2)
        return { key: "winConditions.rules.roleJungleEarly", phase: "early", priority: 2 };
      return { key: "winConditions.rules.roleJungleDefault", phase: "any", priority: 3 };
    case "UTILITY":
      if (enemies.archetype === "pick-burst" || enemies.diveScore >= 2)
        return { key: "winConditions.rules.roleSupportPick", phase: "mid", priority: 2 };
      if (allies.engageScore >= 2)
        return { key: "winConditions.rules.roleSupportEngage", phase: "mid", priority: 2 };
      return { key: "winConditions.rules.roleSupportDefault", phase: "any", priority: 3 };
    case "MIDDLE":
      if (enemies.archetype === "poke-siege")
        return { key: "winConditions.rules.roleMidPoke", phase: "mid", priority: 3 };
      return { key: "winConditions.rules.roleMidDefault", phase: "mid", priority: 3 };
    case "BOTTOM":
      if (enemies.diveScore >= 2 || enemies.archetype === "pick-burst")
        return { key: "winConditions.rules.roleAdcDive", phase: "late", priority: 1 };
      return { key: "winConditions.rules.roleAdcDefault", phase: "late", priority: 2 };
    case "TOP":
      // Split tip already covered when the champ is a split pusher.
      if (myChamp && SPLIT_PUSHERS.has(myChamp.name)) return null;
      if (enemies.diveScore >= 2)
        return { key: "winConditions.rules.roleTopDive", phase: "mid", priority: 2 };
      return { key: "winConditions.rules.roleTopDefault", phase: "mid", priority: 3 };
    default:
      return null;
  }
}
