// Suggests defensive item adaptations based on enemy team composition.
//
// Reads only the champion `tags` from Data Dragon (Mage/Tank/Marksman/etc.)
// to estimate magic vs physical damage split, and which threats need MR/armor/QSS.

import type { Champion, ChampionDb } from "../types/champion";
import { i18n } from "../i18n";

/** Plain-language reason, in the UI language at compute time. */
const why = (key: string, params?: Record<string, number>) => i18n.t(`build.adapt.${key}`, params);

export interface BuildAdaptation {
  itemId: number;
  itemName: string;
  reason: string;
  priority: "core" | "situational";
}

export interface CompProfile {
  apShare: number; // 0-1
  adShare: number; // 0-1
  hardCC: number; // count of champs with reliable hard CC
  burstThreats: number; // assassins / mages
  divers: number; // tanks/fighters that engage
  healers: number; // champs whose kit leans on heavy heal/lifesteal sustain
}

export function profileEnemyComp(
  db: ChampionDb,
  enemyKeys: string[]
): CompProfile {
  let ap = 0;
  let ad = 0;
  let cc = 0;
  let burst = 0;
  let dive = 0;
  let heal = 0;

  for (const k of enemyKeys) {
    const c = db.champions[k];
    if (!c) continue;
    const t = new Set(c.tags);
    // Damage source heuristic
    if (t.has("Mage") || t.has("Support")) ap++;
    if (t.has("Marksman") || t.has("Fighter")) ad++;
    if (t.has("Assassin")) {
      // assassins can be either; bias by name list
      if (AP_ASSASSINS.has(c.id)) ap++;
      else ad++;
      burst++;
    }
    // CC heuristic (manually curated for the worst offenders)
    if (HARD_CC.has(c.id)) cc++;
    // Diver/engage
    if (
      t.has("Tank") ||
      (t.has("Fighter") && DIVERS.has(c.id))
    )
      dive++;
    // Heavy sustain — flags the need for Grievous Wounds
    if (HEALERS.has(c.id)) heal++;
  }
  const total = Math.max(1, ap + ad);
  return {
    apShare: ap / total,
    adShare: ad / total,
    hardCC: cc,
    burstThreats: burst,
    divers: dive,
    healers: heal,
  };
}

export const AP_ASSASSINS = new Set([
  "Akali",
  "Diana",
  "Ekko",
  "Evelynn",
  "Fizz",
  "Katarina",
  "Kassadin",
  "Leblanc", // DDragon id casing
]);
const HARD_CC = new Set([
  "Leona",
  "Nautilus",
  "Malphite",
  "Sett",
  "Amumu",
  "Ashe",
  "Lissandra",
  "Morgana",
  "Maokai",
  "Sejuani",
  "Veigar",
  "RekSai",
  "Rell",
  "Skarner",
]);
const DIVERS = new Set([
  "Camille",
  "Hecarim",
  "Irelia",
  "JarvanIV",
  "Vi",
  "Diana",
  "Wukong",
  "Olaf",
]);
// Champions whose kit leans hard on healing / lifesteal sustain — these are the
// matchups where buying Grievous Wounds swings the fight. Curated (c.id form).
const HEALERS = new Set([
  "Soraka",
  "Aatrox",
  "Vladimir",
  "DrMundo",
  "Sylas",
  "Swain",
  "Warwick",
  "Nasus",
  "Yuumi",
  "Sona",
  "Briar",
  "Fiddlesticks",
  "Zac",
  "Kayn",
  "Illaoi",
  "Renekton",
  "Volibear",
]);

interface SuggestArgs {
  db: ChampionDb;
  champion: Champion;
  enemyKeys: string[];
}

export function suggestBuildAdaptations({
  champion,
  enemyKeys,
  db,
}: SuggestArgs): BuildAdaptation[] {
  const out: BuildAdaptation[] = [];
  if (enemyKeys.length === 0) return out;
  const comp = profileEnemyComp(db, enemyKeys);
  const tags = new Set(champion.tags);
  // Damage type comes from the id for assassins: Kha'Zix/Zed/Talon are tagged
  // only "Assassin" but build AD. "Support" alone says nothing about damage.
  const isApAssassin = tags.has("Assassin") && AP_ASSASSINS.has(champion.id);
  const isMagicScaling = tags.has("Mage") || isApAssassin;
  const isAdScaling =
    !isApAssassin &&
    (tags.has("Marksman") ||
      tags.has("Fighter") ||
      // Ahri/Sylas/Nidalee are Mage+Assassin and build AP.
      (tags.has("Assassin") && !tags.has("Mage")));
  // Tank/Fighter frontliners are the only ones Force of Nature / Randuin's fit.
  const isSquishy = !tags.has("Tank") && !tags.has("Fighter");
  // DDragon lists the primary class first: Soraka/Janna/Lulu are
  // ["Support","Mage"], Lux/Zyra are ["Mage","Support"]. Pyke (Assassin) and
  // Senna (Marksman) are Support-tagged but deal AD.
  const isEnchanter =
    champion.tags[0] === "Support" &&
    !tags.has("Assassin") &&
    !tags.has("Marksman");

  // Magic resist vs heavy AP
  if (comp.apShare >= 0.55) {
    if (!isSquishy)
      out.push({
        itemId: 4401, // Force of Nature (high MR + magic shield)
        itemName: "Force of Nature",
        reason: why("needMr", { pct: Math.round(comp.apShare * 100) }),
        priority: "core",
      });
    else if (isAdScaling)
      out.push({
        itemId: 3156, // Maw of Malmortius
        itemName: "Maw of Malmortius",
        reason: why("magicShield"),
        priority: "situational",
      });
    else if (isMagicScaling)
      out.push(
        {
          itemId: 3157, // Zhonya's
          itemName: "Zhonya's Hourglass",
          reason: why("stasis"),
          priority: "situational",
        },
        {
          itemId: 3102, // Banshee's Veil
          itemName: "Banshee's Veil",
          reason: why("spellBlock"),
          priority: "situational",
        }
      );
    if (isMagicScaling)
      out.push({
        itemId: 8020, // Abyssal Mask (penetración + MR)
        itemName: "Abyssal Mask",
        reason: why("abyssal"),
        priority: "situational",
      });
  }

  // Armor vs heavy AD
  if (comp.adShare >= 0.55) {
    if (!isSquishy)
      out.push({
        itemId: 3143, // Randuin's Omen
        itemName: "Randuin's Omen",
        reason: why("needArmor", { pct: Math.round(comp.adShare * 100) }),
        priority: "core",
      });
    else if (tags.has("Marksman"))
      out.push({
        itemId: 3026, // Guardian Angel
        itemName: "Guardian Angel",
        reason: why("secondLife"),
        priority: "situational",
      });
    else if (isAdScaling)
      out.push({
        itemId: 6333, // Death's Dance
        itemName: "Death's Dance",
        reason: why("lessBurst"),
        priority: "situational",
      });
    else if (isMagicScaling && !out.some((a) => a.itemId === 3157))
      out.push({
        itemId: 3157, // Zhonya's (armor + stasis)
        itemName: "Zhonya's Hourglass",
        reason: why("stasis"),
        priority: "situational",
      });
    if (isAdScaling)
      out.push({
        itemId: 3047, // Plated Steelcaps
        itemName: "Plated Steelcaps",
        reason: why("armorBoots"),
        priority: "situational",
      });
  }

  // QSS / Mercurial vs heavy CC
  if (comp.hardCC >= 3) {
    out.push({
      // Silvermere Dawn was removed: the full QSS upgrade is Mercurial
      // Scimitar, an AD item; everyone else gets the Sash itself as core.
      itemId: isAdScaling ? 3139 : 3140,
      itemName: isAdScaling ? "Mercurial Scimitar" : "Quicksilver Sash",
      reason: why("cleanse", { count: comp.hardCC }),
      priority: "core",
    });
  } else if (comp.hardCC >= 2) {
    out.push({
      itemId: 3140, // QSS
      itemName: "Quicksilver Sash",
      reason: why("cleanse", { count: comp.hardCC }),
      priority: "situational",
    });
  }

  // Anti-engage: something that saves you once (Stopwatch no longer gives
  // stasis; Zhonya's for mages, Guardian Angel for the rest).
  if (comp.divers >= 3 && isSquishy) {
    out.push({
      itemId: isMagicScaling ? 3157 : 3026,
      itemName: isMagicScaling ? "Zhonya's Hourglass" : "Guardian Angel",
      reason: why("divers", { count: comp.divers }),
      priority: "situational",
    });
  }

  // Anti-burst (Mercury's vs heavy AP+CC)
  if (comp.apShare >= 0.5 && comp.hardCC >= 2) {
    out.push({
      itemId: 3111, // Mercury's Treads
      itemName: "Mercury's Treads",
      reason: why("mercs"),
      priority: "core",
    });
  }

  // Grievous Wounds vs heavy sustain. One big healer already warrants the
  // early component; two or more makes a full anti-heal item core. The exact
  // item depends on the SHOPPER's damage type, not the enemy's.
  if (comp.healers >= 1) {
    const core = comp.healers >= 2;
    const isTanky = tags.has("Tank");
    if (isTanky || isEnchanter) {
      // Tanks/frontliners and enchanters (no AD/AP scaling): Thornmail gives
      // armor and applies Grievous on-hit.
      out.push({
        itemId: 3075, // Thornmail
        itemName: "Thornmail",
        reason: why("antiHealArmor"),
        priority: core ? "core" : "situational",
      });
    } else if (isAdScaling) {
      out.push(
        core
          ? {
              itemId: 3033, // Mortal Reminder
              itemName: "Mortal Reminder",
              reason: why("antiHeal"),
              priority: "core",
            }
          : {
              itemId: 3123, // Executioner's Calling
              itemName: "Executioner's Calling",
              reason: why("antiHealCheap"),
              priority: "situational",
            }
      );
    } else if (isMagicScaling) {
      out.push(
        core
          ? {
              itemId: 3165, // Morellonomicon
              itemName: "Morellonomicon",
              reason: why("antiHeal"),
              priority: "core",
            }
          : {
              itemId: 3916, // Oblivion Orb
              itemName: "Oblivion Orb",
              reason: why("antiHealCheap"),
              priority: "situational",
            }
      );
    } else {
      // Enchanters / non-damage carriers default to Thornmail too.
      out.push({
        itemId: 3075, // Thornmail
        itemName: "Thornmail",
        reason: why("antiHealArmor"),
        priority: core ? "core" : "situational",
      });
    }
  }

  return out;
}
