// Lightweight ARAM advisor. On Howling Abyss the SoloQ build/playstyle advice
// is misleading (no recall, forced 5v5 poke war, different item priorities), so
// BuildPanel showed a "ARAM recs coming" banner. This fills that gap: short,
// champion-class-aware ARAM guidance derived from the champion's tags. Curated
// + pure, so it's instant and testable.

import type { Champion } from "../types/champion";

// Champions whose ARAM identity is poke/artillery regardless of the generic
// "Mage" tag (e.g. they out-range and want the poke-war playstyle).
const POKE_NAMES = new Set([
  "Xerath",
  "Ziggs",
  "Vel'Koz",
  "Lux",
  "Jayce",
  "Nidalee",
  "Varus",
  "Caitlyn",
  "Ashe",
  "Senna",
  "Zoe",
  "Karthus",
]);

/** 2–4 ARAM-specific bullets for a champion, as i18n keys (aram.*) resolved by
 *  the panel via t(). First the class-specific line(s), then the universal
 *  Howling Abyss rules. */
export function aramAdvice(champion: Champion): string[] {
  const tags = new Set(champion.tags);
  const tips: string[] = [];

  if (POKE_NAMES.has(champion.name) || tags.has("Mage")) {
    tips.push("aram.poke");
  }
  if (tags.has("Marksman")) {
    tips.push("aram.marksman");
  }
  if (tags.has("Fighter")) {
    tips.push("aram.fighter");
  }
  if (tags.has("Tank")) {
    tips.push("aram.tank");
  }
  if (tags.has("Assassin")) {
    tips.push("aram.assassin");
  }
  if (tags.has("Support") && tips.length === 0) {
    tips.push("aram.support");
  }

  // Universal Howling Abyss rules — always relevant.
  tips.push("aram.universalSustain");
  tips.push("aram.universalTenacity");

  return tips.slice(0, 4);
}
