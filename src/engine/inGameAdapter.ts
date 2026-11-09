// In-game contextual build adapter. Reads enemy item snapshots from the
// Live Client API and suggests counter purchases — Grievous Wounds when
// enemies stack healing, armor pen when they stack armor, etc.
//
// Distinct from `adaptiveBuildEngine.ts` which only sees champion tags
// at draft time. This one fires DURING the match and reacts to actual
// item builds, so its recommendations change as the enemy itemises.

import type { Champion } from "../types/champion";
import { aggregateEnemyItems } from "../data/itemTags";
import { i18n } from "../i18n";

export interface InGameSuggestion {
  itemId: number;
  itemName: string;
  /** `reasonKey` resolved with the active UI language at compute time. */
  reason: string;
  /** i18n key (inGameAdapt.*) + params, for callers that re-resolve via t(). */
  reasonKey?: string;
  reasonParams?: Record<string, number>;
  priority: "core" | "situational";
  /** Stable key for dedup in UI (e.g. across two polls returning same suggestion). */
  key: string;
}

interface SuggestArgs {
  champion: Champion;
  enemyPlayers: Array<{ items: Array<{ itemID: number }> }>;
  /** Game time in seconds. Used to suppress early-game noise (item snapshots
   *  are mostly Doran's pre-10min, no real signal yet). */
  gameTime: number;
  /** My own items so we don't suggest something I already built. */
  myItems?: Array<{ itemID: number }>;
}

// Magic numbers tuned against typical mid-game (15-25min) enemy builds:
//   - 1 full armor item ≈ 50-80 armor → threshold 200 = "at least 3 enemies
//     building armor or 2 heavy stacks"
//   - Same logic for MR.
//   - Healers/shielders/crits count = headcount, not stacks.
const ARMOR_HEAVY = 200;
const MR_HEAVY = 200;
const HEAL_THRESHOLD = 2;
const SHIELD_THRESHOLD = 2;
const CRIT_THRESHOLD = 2;
const MIN_GAME_TIME = 8 * 60; // 8min — before this snapshots are basically Doran's

/** Items we never re-suggest if the player already owns them. */
function buildOwned(myItems?: Array<{ itemID: number }>): Set<number> {
  const s = new Set<number>();
  for (const i of myItems ?? []) s.add(i.itemID);
  return s;
}

function reason(
  reasonKey: string,
  reasonParams?: Record<string, number>
): Pick<InGameSuggestion, "reason" | "reasonKey" | "reasonParams"> {
  return { reason: i18n.t(reasonKey, reasonParams), reasonKey, reasonParams };
}

export function suggestInGameAdaptations({
  champion,
  enemyPlayers,
  gameTime,
  myItems,
}: SuggestArgs): InGameSuggestion[] {
  if (gameTime < MIN_GAME_TIME) return [];
  if (enemyPlayers.length === 0) return [];

  const agg = aggregateEnemyItems(enemyPlayers);
  const owned = buildOwned(myItems);
  const out: InGameSuggestion[] = [];

  const tags = champion.tags;
  const isMarksman = tags.includes("Marksman");
  const isTank = tags.includes("Tank");
  // AD: physical classes not tagged Mage (Zed/Talon are Assassin-only).
  // AP: mages and enchanters, never tanks (Leona/Braum are Tank+Support).
  const isAdScaling =
    tags.some((t) => ["Marksman", "Fighter", "Assassin"].includes(t)) &&
    !tags.includes("Mage");
  // (AD supports like Senna/Pyke are not AP either.)
  const isApScaling =
    tags.some((t) => ["Mage", "Support"].includes(t)) && !isTank && !isAdScaling;
  const isSupportMain = tags[0] === "Support";

  // --- Grievous Wounds vs healing ---
  if (agg.healers >= HEAL_THRESHOLD) {
    if (isAdScaling && !owned.has(3033) && !owned.has(6609)) {
      // Mortal Reminder for marksmen; Chempunk Chainsword for melee AD.
      out.push({
        itemId: isMarksman ? 3033 : 6609,
        itemName: isMarksman ? "Mortal Reminder" : "Chempunk Chainsword",
        ...reason("inGameAdapt.gwAd", { healers: agg.healers }),
        priority: "core",
        key: "gw-ad",
      });
    } else if (isApScaling && !owned.has(3165)) {
      out.push({
        itemId: 3165,
        itemName: "Morellonomicon",
        ...reason("inGameAdapt.gwAp", { healers: agg.healers }),
        priority: "core",
        key: "gw-ap",
      });
    } else if (!owned.has(3076)) {
      out.push({
        itemId: 3076,
        itemName: "Bramble Vest",
        ...reason("inGameAdapt.gwTank", { healers: agg.healers }),
        priority: "situational",
        key: "gw-tank",
      });
    }
  }

  // --- Armor pen vs heavy armor stack ---
  if (agg.totalArmor >= ARMOR_HEAVY && isAdScaling) {
    if (!owned.has(3036) && !owned.has(6694)) {
      out.push({
        itemId: 3036,
        itemName: "Lord Dominik's Regards",
        ...reason("inGameAdapt.armpenCrit", { armor: agg.totalArmor }),
        priority: "core",
        key: "armpen-crit",
      });
    }
    if (!owned.has(6694)) {
      out.push({
        itemId: 6694,
        itemName: "Serylda's Grudge",
        ...reason("inGameAdapt.armpenBruiser"),
        priority: "situational",
        key: "armpen-bruiser",
      });
    }
  }

  // --- Magic pen vs heavy MR stack ---
  // Enchanters (Support as main class) don't build magic pen.
  if (agg.totalMr >= MR_HEAVY && isApScaling && !isSupportMain) {
    if (!owned.has(3135) && !owned.has(3020)) {
      out.push({
        itemId: 3135,
        itemName: "Void Staff",
        ...reason("inGameAdapt.magpen", { mr: agg.totalMr }),
        priority: "core",
        key: "magpen",
      });
    }
    if (!owned.has(3020)) {
      out.push({
        itemId: 3020,
        itemName: "Sorcerer's Shoes",
        ...reason("inGameAdapt.sorcs"),
        priority: "situational",
        key: "sorcs",
      });
    }
  }

  // --- Anti-crit vs crit AD carry threat ---
  if (agg.crits >= CRIT_THRESHOLD) {
    // Randuin's is a tank/bruiser item; squishies can't use it.
    if (!owned.has(3143) && (isTank || tags.includes("Fighter"))) {
      out.push({
        itemId: 3143,
        itemName: "Randuin's Omen",
        ...reason("inGameAdapt.antiCrit", { crits: agg.crits }),
        priority: "core",
        key: "anti-crit",
      });
    }
  }

  // --- Anti-shield: Sterak's/Maw/Riftmaker users get healed too,
  //     but the dominant signal is "they have a damage-conversion shield".
  //     We only flag it as a hint, not a hard rec, since you can't
  //     directly "counter" a shield with one item. ---
  //     Edge of Night is a lethality item: AD assassins only.
  if (
    agg.shielders >= SHIELD_THRESHOLD &&
    isAdScaling &&
    tags.includes("Assassin") &&
    !isMarksman &&
    !owned.has(3814)
  ) {
    out.push({
      itemId: 3814,
      itemName: "Edge of Night",
      ...reason("inGameAdapt.antiShield", { shielders: agg.shielders }),
      priority: "situational",
      key: "anti-shield",
    });
  }

  return out;
}
