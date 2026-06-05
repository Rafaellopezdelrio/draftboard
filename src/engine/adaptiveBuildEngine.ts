// Suggests defensive item adaptations based on enemy team composition.
//
// Reads only the champion `tags` from Data Dragon (Mage/Tank/Marksman/etc.)
// to estimate magic vs physical damage split, and which threats need MR/armor/QSS.

import type { Champion, ChampionDb } from "../types/champion";

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

const AP_ASSASSINS = new Set([
  "Akali",
  "Diana",
  "Ekko",
  "Evelynn",
  "Fizz",
  "Katarina",
  "Kassadin",
  "LeBlanc",
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
  const isMagicScaling = champion.tags.some((t) =>
    ["Mage", "Support", "Assassin"].includes(t)
  );
  const isAdScaling = champion.tags.some((t) =>
    ["Marksman", "Fighter"].includes(t)
  );
  const isSquishy =
    !champion.tags.includes("Tank") && !champion.tags.includes("Fighter");

  // Magic resist vs heavy AP
  if (comp.apShare >= 0.55) {
    out.push({
      itemId: 4644, // Force of Nature (high MR + magic shield)
      itemName: "Force of Nature",
      reason: `Equipo enemigo ${(comp.apShare * 100).toFixed(0)}% AP — necesitas MR`,
      priority: "core",
    });
    if (isSquishy)
      out.push({
        itemId: 3157, // Zhonya's
        itemName: "Zhonya's Hourglass",
        reason: "Squishy contra AP — el stasis cancela burst",
        priority: "situational",
      });
    if (isMagicScaling)
      out.push({
        itemId: 3001, // Abyssal Mask (penetración + MR)
        itemName: "Abyssal Mask",
        reason: "Penetración mágica + MR vs equipo AP",
        priority: "situational",
      });
  }

  // Armor vs heavy AD
  if (comp.adShare >= 0.55) {
    out.push({
      itemId: 3143, // Randuin's Omen
      itemName: "Randuin's Omen",
      reason: `Equipo enemigo ${(comp.adShare * 100).toFixed(0)}% AD — armadura crítica`,
      priority: "core",
    });
    if (isSquishy)
      out.push({
        itemId: 6333, // Death's Dance
        itemName: "Death's Dance",
        reason: "AD pesado y eres squishy — Death's Dance reduce burst físico",
        priority: "situational",
      });
    if (isAdScaling)
      out.push({
        itemId: 3047, // Plated Steelcaps
        itemName: "Plated Steelcaps",
        reason: "Botas de armadura vs comp AD",
        priority: "situational",
      });
  }

  // QSS / Mercurial vs heavy CC
  if (comp.hardCC >= 3) {
    out.push({
      itemId: 6035, // Silvermere Dawn
      itemName: "Silvermere Dawn",
      reason: `${comp.hardCC} hard CC en el equipo enemigo — limpia con QSS upgrade`,
      priority: "core",
    });
  } else if (comp.hardCC >= 2) {
    out.push({
      itemId: 3140, // QSS
      itemName: "Quicksilver Sash",
      reason: `${comp.hardCC} hard CC enemigos — QSS para limpiar el más letal`,
      priority: "situational",
    });
  }

  // Anti-engage / Stopwatch
  if (comp.divers >= 3 && isSquishy) {
    out.push({
      itemId: 2420, // Stopwatch
      itemName: "Stopwatch",
      reason: `${comp.divers} divers/engage — early stopwatch te salva`,
      priority: "situational",
    });
  }

  // Anti-burst (Mercury's vs heavy AP+CC)
  if (comp.apShare >= 0.5 && comp.hardCC >= 2) {
    out.push({
      itemId: 3111, // Mercury's Treads
      itemName: "Mercury's Treads",
      reason: "Mercury's: tenacidad + MR contra AP+CC",
      priority: "core",
    });
  }

  // Grievous Wounds vs heavy sustain. One big healer already warrants the
  // early component; two or more makes a full anti-heal item core. The exact
  // item depends on the SHOPPER's damage type, not the enemy's.
  if (comp.healers >= 1) {
    const core = comp.healers >= 2;
    const plural = comp.healers >= 2 ? `${comp.healers} fuentes de curación` : "curación fuerte";
    const isTanky = champion.tags.includes("Tank");
    if (isTanky) {
      // Tanks/frontliners: Thornmail gives armor and applies Grievous on-hit.
      out.push({
        itemId: 3075, // Thornmail
        itemName: "Thornmail",
        reason: `${plural} enemiga — Thornmail aplica Grievous y da armadura`,
        priority: core ? "core" : "situational",
      });
    } else if (isAdScaling) {
      out.push(
        core
          ? {
              itemId: 3033, // Mortal Reminder
              itemName: "Mortal Reminder",
              reason: `${plural} enemiga — Grievous Wounds de AD`,
              priority: "core",
            }
          : {
              itemId: 3123, // Executioner's Calling
              itemName: "Executioner's Calling",
              reason: `${plural} enemiga — anti-heal temprano barato`,
              priority: "situational",
            }
      );
    } else if (isMagicScaling) {
      out.push(
        core
          ? {
              itemId: 3165, // Morellonomicon
              itemName: "Morellonomicon",
              reason: `${plural} enemiga — Grievous Wounds de AP`,
              priority: "core",
            }
          : {
              itemId: 3916, // Oblivion Orb
              itemName: "Oblivion Orb",
              reason: `${plural} enemiga — anti-heal temprano de AP`,
              priority: "situational",
            }
      );
    } else {
      // Enchanters / non-damage carriers default to Thornmail too.
      out.push({
        itemId: 3075, // Thornmail
        itemName: "Thornmail",
        reason: `${plural} enemiga — Thornmail aplica Grievous y da armadura`,
        priority: core ? "core" : "situational",
      });
    }
  }

  return out;
}
