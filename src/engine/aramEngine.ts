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

/** 2–4 ARAM-specific bullets for a champion. First the class-specific line(s),
 *  then the universal Howling Abyss rules. */
export function aramAdvice(champion: Champion): string[] {
  const tags = new Set(champion.tags);
  const tips: string[] = [];

  if (POKE_NAMES.has(champion.name) || tags.has("Mage")) {
    tips.push(
      "Poke: castiga a distancia y farmea daño antes de pelear; no entres sin tu combo listo."
    );
  }
  if (tags.has("Marksman")) {
    tips.push(
      "Posiciónate detrás del frontline. Sin recall, prioriza sustain (Shieldbow/ER) sobre glass-cannon."
    );
  }
  if (tags.has("Fighter")) {
    tips.push(
      "Eres frontline: absorbe el poke y busca el all-in cuando el enemigo gaste habilidades."
    );
  }
  if (tags.has("Tank")) {
    tips.push(
      "Engage cuando el rival malgaste su poke. Compra resistencias + anti-heal si tienen curación."
    );
  }
  if (tags.has("Assassin")) {
    tips.push(
      "Espera flancos; no te expongas al poke constante. Un pick limpio gana la teamfight."
    );
  }
  if (tags.has("Support") && tips.length === 0) {
    tips.push(
      "Maximiza peel/escudos y CC en las teamfights — el valor de wards no existe aquí."
    );
  }

  // Universal Howling Abyss rules — always relevant.
  tips.push(
    "Sin recall: usa Reliquia de Vida + poros para sostener. Empuja para presionar la torre."
  );
  tips.push(
    "Compra Tenacidad (Mercuriales/Sterak) vs CC pesado y anti-heal pronto si el enemigo cura."
  );

  return tips.slice(0, 4);
}
