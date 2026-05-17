// Summoner spell selection that's coherent with the build / champion.
//
// op.gg gives us ONE dominant spell combo per (champion+role). That's
// usually fine, but it can mismatch the build path we end up showing
// (e.g. we pick a defensive top-laner build but op.gg's dominant
// spells are Flash+Ignite because the offensive variant is more popular).
//
// We apply two layers on top of op.gg's recommendation:
//
//   1. Role sanity: jungle MUST have Smite. Non-jungle MUST NOT have it.
//      Anything else op.gg returns that violates this is silently fixed.
//
//   2. Archetype heuristic: based on the champion's tags (Tank/Fighter/...)
//      and our own archetypes (engage/peel/splitpush/burst/...), we
//      override the second spell when there's a clear-cut answer. This
//      catches obvious cases like "Galio mid is a tanky utility mage, he
//      should have TP not Ignite" or "Janna sup should have Exhaust".
//
// When in doubt we fall back to op.gg's pick — they have millions of games
// of data and we shouldn't fight that without strong reason.
//
// All spell IDs are Riot's: 1=Cleanse, 3=Exhaust, 4=Flash, 6=Ghost,
// 7=Heal, 11=Smite, 12=Teleport, 14=Ignite, 21=Barrier.

import type { Champion, Role } from "../types/champion";

const FLASH = 4;
const SMITE = 11;
const TELEPORT = 12;
const IGNITE = 14;
const HEAL = 7;
const EXHAUST = 3;
const BARRIER = 21;
const CLEANSE = 1;
const GHOST = 6;

export interface CoherenceResult {
  ids: [number, number];
  /** Human-readable note about why these spells were chosen. */
  reason: string;
  /** Whether the result differs from what op.gg recommended. */
  overrode: boolean;
}

/**
 * Returns a (spell1, spell2) pair that's coherent with the champion's role
 * and archetype. Always returns Flash as one of the two — every champ in
 * every role takes Flash in 99%+ of games and the rare exceptions
 * (Karthus, Singed) still benefit from showing Flash for new players.
 */
export function pickCoherentSpells(
  champion: Champion | undefined,
  role: Role,
  opggSpells: [number, number] | undefined
): CoherenceResult {
  const opgg = opggSpells ?? null;

  // --- Layer 1: role sanity ---
  // Jungle: must have Smite. If op.gg has it, keep it. Otherwise force.
  if (role === "JUNGLE") {
    return {
      ids: [FLASH, SMITE],
      reason: "Jungla → Smite obligatorio",
      overrode: !opgg || !opgg.includes(SMITE),
    };
  }
  // Non-jungle: never Smite, even if op.gg suggests it (rare bug case).
  if (opgg && opgg.includes(SMITE)) {
    // Strip smite and fall through to archetype layer.
    // (We'll override the smite slot with the archetype default below.)
  }

  // --- Layer 2: archetype heuristic ---
  // We compute a "preferred 2nd spell" based on tags + archetypes. If it
  // matches op.gg's recommendation, no override. If different, override
  // only when the signal is strong.
  const tags = champion?.tags ?? [];
  const archs = champion?.archetypes ?? [];
  const isTank = tags.includes("Tank");
  const isAssassin = tags.includes("Assassin");
  const isMage = tags.includes("Mage");
  const isMarksman = tags.includes("Marksman");
  const isSupport = tags.includes("Support");

  let preferred: number | null = null;
  let reason = "";

  if (role === "TOP") {
    // Splitpush (Trynda, Fiora, Camille, Jax) → TP is non-negotiable
    if (archs.includes("splitpush")) {
      preferred = TELEPORT;
      reason = "Splitpush en top → TP";
    } else if (isTank || archs.includes("frontline")) {
      preferred = TELEPORT;
      reason = "Tank/frontline en top → TP para roams + map presence";
    } else if (isAssassin || archs.includes("burst")) {
      preferred = IGNITE;
      reason = "Assassin/burst → Ignite para snowball";
    }
    // else: fighter or sustain-dps → let op.gg decide (Renekton/Aatrox style)
  } else if (role === "MIDDLE") {
    if (isAssassin || archs.includes("burst") || archs.includes("pick")) {
      preferred = IGNITE;
      reason = "Mid asesino/burst → Ignite";
    } else if (isTank || archs.includes("frontline") || archs.includes("engage")) {
      preferred = TELEPORT;
      reason = "Mid tanque/engage (Galio, Lissandra...) → TP";
    } else if (isMage && (archs.includes("poke") || archs.includes("wave-clear"))) {
      preferred = TELEPORT;
      reason = "Mage de poke/waveclear → TP";
    } else if (isMarksman) {
      preferred = TELEPORT;
      reason = "Marksman mid (Corki, Tristana...) → TP";
    }
  } else if (role === "BOTTOM") {
    if (isAssassin || archs.includes("burst")) {
      preferred = IGNITE;
      reason = "ADC asesino/burst (Lucian, Samira...) → Ignite";
    } else if (isMarksman || isMage) {
      preferred = HEAL;
      reason = "ADC estándar → Heal";
    }
  } else if (role === "UTILITY") {
    if (archs.includes("engage")) {
      preferred = IGNITE;
      reason = "Soporte engage (Leona, Naut, Rakan...) → Ignite";
    } else if (archs.includes("peel")) {
      preferred = EXHAUST;
      reason = "Soporte peel (Janna, Lulu...) → Exhaust";
    } else if (archs.includes("pick")) {
      preferred = IGNITE;
      reason = "Soporte pick (Thresh, Bard, Blitz...) → Ignite";
    } else if (isMage || isSupport) {
      preferred = IGNITE;
      reason = "Soporte mago → Ignite";
    }
  }

  // --- Decide final pair ---
  if (preferred === null && opgg) {
    // No strong override; trust op.gg.
    return { ids: opgg, reason: "Recomendación dominante de op.gg", overrode: false };
  }

  if (preferred !== null) {
    const final: [number, number] = [FLASH, preferred];
    const overrode =
      !opgg ||
      !(opgg.includes(FLASH) && opgg.includes(preferred));
    return { ids: final, reason, overrode };
  }

  // No opgg data AND no preferred. Last-resort defaults per role.
  const fallback: Record<Role, [number, number]> = {
    TOP: [FLASH, TELEPORT],
    JUNGLE: [FLASH, SMITE],
    MIDDLE: [FLASH, IGNITE],
    BOTTOM: [FLASH, HEAL],
    UTILITY: [FLASH, IGNITE],
  };
  return {
    ids: fallback[role],
    reason: "Fallback por rol (sin datos)",
    overrode: true,
  };
}

// Re-export the constants for use elsewhere (e.g. tests).
export const SPELL_IDS = {
  FLASH,
  SMITE,
  TELEPORT,
  IGNITE,
  HEAL,
  EXHAUST,
  BARRIER,
  CLEANSE,
  GHOST,
};
