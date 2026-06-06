// Rune / shard tweaks tuned to the enemy composition. The build panel already
// shows the aggregate recommended runes; this adds the situational layer —
// what to swap given who you're up against (MR vs heavy AP, armor + Bone
// Plating vs heavy AD, tenacity vs lockdown comps, Second Wind vs poke).
// Curated + pure, so it's instant and testable.

import type { Champion } from "../types/champion";

const ENGAGE_CC = new Set([
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
  "Rell",
  "Skarner",
  "Alistar",
  "Jarvan IV",
  "Galio",
  "Ornn",
  "Hecarim",
  "Rammus",
  "Zac",
]);

const POKE = new Set([
  "Xerath",
  "Ziggs",
  "Vel'Koz",
  "Lux",
  "Jayce",
  "Nidalee",
  "Varus",
  "Caitlyn",
  "Zoe",
  "Ezreal",
  "Karthus",
  "Senna",
]);

interface CompCount {
  ap: number;
  ad: number;
  cc: number;
  poke: number;
}

function countComp(enemies: Champion[]): CompCount {
  let ap = 0;
  let ad = 0;
  let cc = 0;
  let poke = 0;
  for (const c of enemies) {
    const tags = new Set(c.tags);
    if (tags.has("Mage") || tags.has("Support")) ap++;
    if (tags.has("Marksman") || tags.has("Fighter")) ad++;
    // Assassins split by the same name list the rest of the app uses elsewhere.
    if (tags.has("Assassin")) {
      if (["Akali", "Diana", "Ekko", "Evelynn", "Fizz", "Katarina", "Kassadin", "LeBlanc"].includes(c.name)) ap++;
      else ad++;
    }
    if (ENGAGE_CC.has(c.name)) cc++;
    if (POKE.has(c.name)) poke++;
  }
  return { ap, ad, cc, poke };
}

/** Up to 3 rune/shard tweaks for the enemy comp, as i18n keys (runeAdvice.*)
 *  resolved by the panel via t(). Empty when there are no enemies yet (early
 *  draft) so the panel shows nothing instead of noise. */
export function runeAdvice(myChampion: Champion, enemies: Champion[]): string[] {
  if (enemies.length === 0) return [];
  const { ap, ad, cc, poke } = countComp(enemies);
  const squishy =
    !myChampion.tags.includes("Tank") && !myChampion.tags.includes("Fighter");
  const tips: string[] = [];

  if (ap >= 3) {
    tips.push("runeAdvice.apHeavy");
  } else if (ad >= 3) {
    tips.push("runeAdvice.adHeavy");
  }
  if (poke >= 2) {
    tips.push("runeAdvice.poke");
  }
  if (cc >= 2 && squishy) {
    tips.push("runeAdvice.ccHeavy");
  }
  if (tips.length === 0) {
    tips.push("runeAdvice.balanced");
  }
  return tips.slice(0, 3);
}
