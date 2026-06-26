// Classifies a build by its core items into a human-readable archetype
// name + 1-sentence playstyle description + total stats roll-up.
//
// Used in BuildPanel to surface "Lethality Burst" / "Crit DPS" labels
// instead of just listing item icons. Pure derivation from existing
// item-tag data — no API call, no AI cost.

import { ITEM_TAGS, type ItemSignal } from "../data/itemTags";
import { i18n } from "../i18n";

export type BuildArchetype =
  | "Lethality"
  | "Crit DPS"
  | "On-hit"
  | "Bruiser"
  | "Tank"
  | "Burst AP"
  | "DPS AP"
  | "Sustain Fighter"
  | "Enchanter"
  | "Otro";

export interface BuildClassification {
  archetype: BuildArchetype;
  /** Short label like "Lethality Burst" — used as the build's tab title. */
  name: string;
  /** Single-sentence playstyle hint. */
  description: string;
  /** Aggregated stats from the core item bundle. */
  stats: BuildStats;
  /** Tier inferred from variant winrate (S+/S/A/B/C) — caller supplies WR. */
  tier?: "S+" | "S" | "A" | "B" | "C";
}

export interface BuildStats {
  ad: number;
  ap: number;
  hp: number;
  armor: number;
  mr: number;
  /** Count of crit-providing items (signals AD carry build). */
  critItems: number;
  /** Count of healing items (lifesteal / omnivamp / vamp). */
  healItems: number;
  /** Count of shield/conversion items. */
  shieldItems: number;
}

const LETHALITY_IDS = new Set([
  3142, // Youmuu's
  6701, // Serylda's
  6694, // Serpent's Fang
  6692, // Eclipse
  3814, // Edge of Night
  3147, // Duskblade (legacy patches)
  6333, // Death's Dance (also lethality bruiser)
]);

const ONHIT_IDS = new Set([
  3124, // Guinsoo's Rageblade
  3115, // Nashor's Tooth
  3091, // Wit's End
  6675, // Navori Quickblades (some on-hit comps)
  3153, // Blade of the Ruined King
  3748, // Titanic Hydra (on-hit bruiser)
]);

const TANK_IDS = new Set([
  3068, // Sunfire
  3084, // Heartsteel
  3110, // Frozen Heart
  3075, // Thornmail
  3143, // Randuin's
  3083, // Warmog's
  3193, // Gargoyle
  3742, // Dead Man's
  6665, // Jak'Sho
]);

const BRUISER_IDS = new Set([
  3074, // Ravenous Hydra
  6630, // Goredrinker
  6610, // Sundered Sky
  3053, // Sterak's
  3071, // Black Cleaver
  6333, // Death's Dance
  6629, // Stridebreaker
]);

const BURST_AP_IDS = new Set([
  3089, // Rabadon's
  3152, // Hextech Rocketbelt
  4645, // Shadowflame
  3157, // Zhonya's
  4646, // Stormsurge
  6655, // Luden's
]);

const DPS_AP_IDS = new Set([
  3115, // Nashor's
  3124, // Rageblade
  4633, // Riftmaker
  6653, // Liandry's
]);

const ENCHANTER_IDS = new Set([
  3504, // Ardent
  6617, // Moonstone
  3107, // Redemption
  3222, // Mikael's
  3011, // Chemtech (legacy)
  3001, // Abyssal Mask (rare for enchanters but sometimes built)
]);

/**
 * Aggregate raw stats from a set of item IDs using the curated ITEM_TAGS
 * map. Items not in the map contribute 0 — which is fine, we only care
 * about the dominant signal for classification + display.
 */
export function aggregateBuildStats(itemIds: number[]): BuildStats {
  const stats: BuildStats = {
    ad: 0,
    ap: 0,
    hp: 0,
    armor: 0,
    mr: 0,
    critItems: 0,
    healItems: 0,
    shieldItems: 0,
  };
  for (const id of itemIds) {
    const t: ItemSignal | undefined = ITEM_TAGS[id];
    if (!t) continue;
    stats.ad += t.ad ?? 0;
    stats.ap += t.ap ?? 0;
    stats.hp += t.hp ?? 0;
    stats.armor += t.armor ?? 0;
    stats.mr += t.mr ?? 0;
    if (t.crit) stats.critItems++;
    if (t.heal) stats.healItems++;
    if (t.shield) stats.shieldItems++;
  }
  return stats;
}

/**
 * Classify core build → archetype label + playstyle description.
 *
 * Priority order matters: crit > lethality > on-hit > bruiser > tank > AP
 * variants > enchanter > unknown. First matching bucket wins. Tuned so
 * "ADC with 2 crit items" classifies as Crit DPS even if it also has a
 * single lethality piece.
 */
export function classifyBuild(coreItemIds: number[]): BuildClassification {
  const stats = aggregateBuildStats(coreItemIds);
  const idSet = new Set(coreItemIds);

  let lethalHits = 0;
  let onhitHits = 0;
  let tankHits = 0;
  let bruiserHits = 0;
  let burstApHits = 0;
  let dpsApHits = 0;
  let enchanterHits = 0;
  for (const id of coreItemIds) {
    if (LETHALITY_IDS.has(id)) lethalHits++;
    if (ONHIT_IDS.has(id)) onhitHits++;
    if (TANK_IDS.has(id)) tankHits++;
    if (BRUISER_IDS.has(id)) bruiserHits++;
    if (BURST_AP_IDS.has(id)) burstApHits++;
    if (DPS_AP_IDS.has(id)) dpsApHits++;
    if (ENCHANTER_IDS.has(id)) enchanterHits++;
  }

  // Crit DPS — dominant signal for AD carries. >=2 crit items = clear ADC build.
  if (stats.critItems >= 2) {
    return {
      archetype: "Crit DPS",
      name: i18n.t("buildArchetype.critDps.name"),
      description: i18n.t("buildArchetype.critDps.desc"),
      stats,
    };
  }
  // Lethality — assassin / lane bully
  if (lethalHits >= 2) {
    return {
      archetype: "Lethality",
      name: i18n.t("buildArchetype.lethalityBurst.name"),
      description: i18n.t("buildArchetype.lethalityBurst.desc"),
      stats,
    };
  }
  // On-hit (Kog/Varus/Vayne/Teemo style)
  if (onhitHits >= 2) {
    return {
      archetype: "On-hit",
      name: i18n.t("buildArchetype.onhit.name"),
      description: i18n.t("buildArchetype.onhit.desc"),
      stats,
    };
  }
  // Tank — hard tank, high HP + resists
  if (tankHits >= 3 || (tankHits >= 2 && stats.hp >= 800)) {
    return {
      archetype: "Tank",
      name: i18n.t("buildArchetype.tankFrontline.name"),
      description: i18n.t("buildArchetype.tankFrontline.desc"),
      stats,
    };
  }
  // Bruiser — fighter with sustain + bruise items
  if (bruiserHits >= 2) {
    return {
      archetype: "Bruiser",
      name: i18n.t("buildArchetype.bruiserDps.name"),
      description: i18n.t("buildArchetype.bruiserDps.desc"),
      stats,
    };
  }
  // Burst AP — assassin mage
  if (burstApHits >= 2 && stats.ap >= 200) {
    return {
      archetype: "Burst AP",
      name: i18n.t("buildArchetype.burstAp.name"),
      description: i18n.t("buildArchetype.burstAp.desc"),
      stats,
    };
  }
  // DPS AP — battle mage / on-hit AP
  if (dpsApHits >= 2) {
    return {
      archetype: "DPS AP",
      name: i18n.t("buildArchetype.dpsAp.name"),
      description: i18n.t("buildArchetype.dpsAp.desc"),
      stats,
    };
  }
  // Enchanter — support build
  if (enchanterHits >= 2) {
    return {
      archetype: "Enchanter",
      name: i18n.t("buildArchetype.enchanterPeel.name"),
      description: i18n.t("buildArchetype.enchanterPeel.desc"),
      stats,
    };
  }
  // Single-signal heuristics
  if (lethalHits === 1 && idSet.has(3814)) {
    return {
      archetype: "Lethality",
      name: i18n.t("buildArchetype.lethalityHybrid.name"),
      description: i18n.t("buildArchetype.lethalityHybrid.desc"),
      stats,
    };
  }
  if (tankHits >= 2) {
    return {
      archetype: "Tank",
      name: i18n.t("buildArchetype.tankHybrid.name"),
      description: i18n.t("buildArchetype.tankHybrid.desc"),
      stats,
    };
  }
  return {
    archetype: "Otro",
    name: i18n.t("buildArchetype.standard.name"),
    description: i18n.t("buildArchetype.standard.desc"),
    stats,
  };
}

/**
 * Tag indicating what enemy comp this build counters best. Lets the UI
 * label a build "Vs Squishies" or "Vs Tank-heavy" so the user picks the
 * right variant for the matchup at hand.
 */
export function counterSignature(
  enemyAvgHp: number,
  enemyApShare: number,
  enemyAdShare: number
): "Vs Squishies" | "Vs Tanks" | "Vs AP" | "Vs AD" | null {
  if (enemyAvgHp >= 2200) return "Vs Tanks";
  if (enemyAvgHp <= 1900) return "Vs Squishies";
  if (enemyApShare >= 0.6) return "Vs AP";
  if (enemyAdShare >= 0.6) return "Vs AD";
  return null;
}

/**
 * Tier (S+/S/A/B/C) inferred from a single variant's win rate. Mirrors
 * the cutoffs we use elsewhere in the app so the visual language stays
 * consistent. Sample-size guardrails are the caller's responsibility —
 * a 60% WR over 50 games is noise; this function doesn't know that.
 */
export function tierFromWinRate(winRate: number): "S+" | "S" | "A" | "B" | "C" {
  if (winRate >= 0.56) return "S+";
  if (winRate >= 0.53) return "S";
  if (winRate >= 0.51) return "A";
  if (winRate >= 0.49) return "B";
  return "C";
}
