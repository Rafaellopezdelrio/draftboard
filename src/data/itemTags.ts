// Curated item → defensive/offensive properties map. Only items whose
// presence is a strong *signal* to adapt your own build (heavy armor,
// heavy MR, heavy healing, heavy HP, heavy crit). Used by the in-game
// build adapter to react to what the enemy actually bought, not just
// their champion tags.
//
// IDs come from Riot's Data Dragon item catalog. Patch-stable for the
// items we care about; values are rough magnitudes (not exact stats)
// since we only need ordinal "is this a big armor/MR/HP piece" signal.
//
// Keep this small — every item added is a maintenance cost across
// patches. Add only when its presence meaningfully changes counter-play.

export interface ItemSignal {
  /** Bonus armor granted (rough). */
  armor?: number;
  /** Bonus magic resist granted (rough). */
  mr?: number;
  /** Bonus health granted (rough). */
  hp?: number;
  /** Has lifesteal / omnivamp / spellvamp / healing-on-hit. */
  heal?: boolean;
  /** Has shielding / damage-conversion mechanic (Sterak's, Maw, Riftmaker). */
  shield?: boolean;
  /** Provides crit chance (AD carry indicator). */
  crit?: boolean;
  /** Provides AP. */
  ap?: number;
  /** Provides AD. */
  ad?: number;
}

export const ITEM_TAGS: Record<number, ItemSignal> = {
  // --- ARMOR PIECES (high → low) ---
  3143: { armor: 80, hp: 250 },              // Randuin's Omen
  3075: { armor: 80, hp: 350 },              // Thornmail
  3110: { armor: 70 },                       // Frozen Heart
  3068: { armor: 50, hp: 500 },              // Sunfire Aegis
  3742: { armor: 45, hp: 300 },              // Dead Man's Plate
  6662: { armor: 50, hp: 400 },              // Iceborn Gauntlet
  6665: { armor: 50, mr: 50, hp: 350 },      // Jak'Sho, The Protean
  3047: { armor: 25 },                       // Plated Steelcaps
  3193: { armor: 30, mr: 30, hp: 350 },      // Gargoyle Stoneplate
  3190: { armor: 30, mr: 30, hp: 200 },      // Locket of the Iron Solari
  3084: { armor: 25, hp: 1000 },             // Heartsteel

  // --- MR PIECES (high → low) ---
  4644: { mr: 70, hp: 350 },                 // Force of Nature
  3065: { mr: 50, hp: 450 },                 // Spirit Visage
  3102: { mr: 50, hp: 450 },                 // Banshee's Veil
  3091: { mr: 50, ad: 50 },                  // Wit's End
  3156: { mr: 50, ad: 65, shield: true },    // Maw of Malmortius
  3111: { mr: 25 },                          // Mercury's Treads
  3001: { mr: 50, hp: 400, ap: 65 },         // Abyssal Mask
  3814: { mr: 35, ad: 60 },                  // Edge of Night
  3139: { mr: 30, ad: 55 },                  // Mercurial Scimitar
  6035: { mr: 30, ad: 50 },                  // Silvermere Dawn
  3157: { mr: 0, ap: 100, armor: 50 },       // Zhonya's (also armor!)

  // --- HP / TANK STACKS ---
  3083: { hp: 850 },                         // Warmog's
  4401: { hp: 200, armor: 20, mr: 20 },      // Force of Nature components... skip
  3211: { hp: 250, mr: 30 },                 // Spectre's Cowl (also has Hollow Radiance? leave as is)
  3071: { hp: 400, ad: 55 },                 // Black Cleaver — armor shred + rage, no lifesteal

  // --- HEAL / LIFESTEAL (triggers grievous wounds rec) ---
  3072: { ad: 80, heal: true },              // Bloodthirster
  6333: { ad: 55, armor: 55, heal: true },   // Death's Dance
  6630: { ad: 60, heal: true },              // Goredrinker
  3074: { ad: 65, heal: true },              // Ravenous Hydra
  6673: { ad: 50, hp: 400, shield: true, heal: true }, // Immortal Shieldbow (lifesteal + shield)
  1053: { ad: 15, heal: true },              // Vampiric Scepter
  3877: { heal: true },                      // Bloodsong (support)
  6610: { ad: 55, heal: true },              // Sundered Sky
  // (6675 = Navori Quickblades — see crit section below; removed dup)
  4633: { ap: 80, hp: 350, shield: true, heal: true }, // Riftmaker
  3152: { ap: 80, hp: 200, shield: true },   // Hextech Rocketbelt (no heal, just AP/HP/shield)

  // --- SHIELD-FOCUSED ---
  3053: { ad: 0, hp: 400, shield: true },    // Sterak's Gage

  // --- CRIT (signals AD carry threat) ---
  3031: { ad: 70, crit: true },              // Infinity Edge
  3046: { ad: 0, crit: true },               // Phantom Dancer
  3095: { ad: 55, crit: true },              // Stormrazor
  6671: { ad: 60, crit: true },              // Essence Reaver
  3094: { ad: 35, crit: true },              // Rapid Firecannon
  3036: { ad: 35, crit: true },              // Lord Dominik's Regards
  3033: { ad: 35, crit: true },              // Mortal Reminder (also grievous wounds itself)
  6676: { ad: 60, crit: true },              // The Collector
  3508: { ad: 60, crit: true },              // Essence Reaver alt
  6675: { ad: 60, crit: true },              // Navori Quickblades

  // --- AP THREATS (only for awareness; AP enemies already counted via tags) ---
  3089: { ap: 120 },                         // Rabadon's Deathcap
  3115: { ap: 80 },                          // Nashor's Tooth
  4645: { ap: 80 },                          // Shadowflame
};

/**
 * Aggregate enemy build signals into thresholds the engine can react to.
 * Returns sums so the caller can decide cut-offs (e.g. armor > 300 → buy
 * armor pen, heal count >= 2 → buy grievous wounds, etc).
 */
export interface EnemyBuildAggregate {
  totalArmor: number;
  totalMr: number;
  totalHp: number;
  healers: number;     // count of enemies with heal/lifesteal
  shielders: number;   // count with shield/conversion
  crits: number;       // count of crit-stacking enemies
  totalAd: number;
  totalAp: number;
}

export function aggregateEnemyItems(
  enemies: Array<{ items: Array<{ itemID: number }> }>
): EnemyBuildAggregate {
  let totalArmor = 0;
  let totalMr = 0;
  let totalHp = 0;
  let healers = 0;
  let shielders = 0;
  let crits = 0;
  let totalAd = 0;
  let totalAp = 0;

  for (const e of enemies) {
    let perPlayerHeal = false;
    let perPlayerShield = false;
    let perPlayerCrit = false;
    for (const slot of e.items ?? []) {
      const tag = ITEM_TAGS[slot.itemID];
      if (!tag) continue;
      totalArmor += tag.armor ?? 0;
      totalMr += tag.mr ?? 0;
      totalHp += tag.hp ?? 0;
      totalAd += tag.ad ?? 0;
      totalAp += tag.ap ?? 0;
      if (tag.heal) perPlayerHeal = true;
      if (tag.shield) perPlayerShield = true;
      if (tag.crit) perPlayerCrit = true;
    }
    if (perPlayerHeal) healers++;
    if (perPlayerShield) shielders++;
    if (perPlayerCrit) crits++;
  }

  return { totalArmor, totalMr, totalHp, healers, shielders, crits, totalAd, totalAp };
}
