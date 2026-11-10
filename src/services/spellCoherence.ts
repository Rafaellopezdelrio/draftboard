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
  /** i18n key (build.spellReason.*) for why these spells were chosen. */
  reasonKey: string;
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
  const raw = opggSpells ?? null;

  // --- Layer 1: role sanity ---
  // Jungle: must have Smite. If op.gg has it, keep it. Otherwise force.
  if (role === "JUNGLE") {
    return {
      ids: [FLASH, SMITE],
      reasonKey: "build.spellReason.jungleSmite",
      overrode: !raw || !raw.includes(SMITE),
    };
  }
  // Non-jungle: never Smite, even if op.gg suggests it (rare bug case). A
  // Smite pair is ignored so the archetype or role default applies instead.
  const opgg = raw && !raw.includes(SMITE) ? raw : null;

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
  let reasonKey = "";

  if (role === "TOP") {
    // Splitpush (Trynda, Fiora, Camille, Jax) → TP is non-negotiable
    if (archs.includes("splitpush")) {
      preferred = TELEPORT;
      reasonKey = "build.spellReason.topSplitpush";
    } else if (isTank || archs.includes("frontline")) {
      preferred = TELEPORT;
      reasonKey = "build.spellReason.topTank";
    } else if (isAssassin || archs.includes("burst")) {
      preferred = IGNITE;
      reasonKey = "build.spellReason.topAssassin";
    }
    // else: fighter or sustain-dps → let op.gg decide (Renekton/Aatrox style)
  } else if (role === "MIDDLE") {
    if (isAssassin || archs.includes("burst") || archs.includes("pick")) {
      preferred = IGNITE;
      reasonKey = "build.spellReason.midAssassin";
    } else if (isTank || archs.includes("frontline") || archs.includes("engage")) {
      preferred = TELEPORT;
      reasonKey = "build.spellReason.midTank";
    } else if (isMage && (archs.includes("poke") || archs.includes("wave-clear"))) {
      preferred = TELEPORT;
      reasonKey = "build.spellReason.midPokeMage";
    } else if (isMarksman) {
      preferred = TELEPORT;
      reasonKey = "build.spellReason.midMarksman";
    }
  } else if (role === "BOTTOM") {
    if (isAssassin || archs.includes("burst")) {
      preferred = IGNITE;
      reasonKey = "build.spellReason.botAssassin";
    } else if (isMarksman || isMage) {
      preferred = HEAL;
      reasonKey = "build.spellReason.botStandard";
    }
  } else if (role === "UTILITY") {
    if (archs.includes("engage")) {
      preferred = IGNITE;
      reasonKey = "build.spellReason.supEngage";
    } else if (archs.includes("peel")) {
      preferred = EXHAUST;
      reasonKey = "build.spellReason.supPeel";
    } else if (archs.includes("pick")) {
      preferred = IGNITE;
      reasonKey = "build.spellReason.supPick";
    } else if (isMage || isSupport) {
      preferred = IGNITE;
      reasonKey = "build.spellReason.supMage";
    }
  }

  // --- Decide final pair ---
  if (preferred === null && opgg) {
    // No strong override; trust op.gg.
    return { ids: opgg, reasonKey: "build.spellReason.opgg", overrode: false };
  }

  if (preferred !== null) {
    const final: [number, number] = [FLASH, preferred];
    const overrode =
      !opgg ||
      !(opgg.includes(FLASH) && opgg.includes(preferred));
    return { ids: final, reasonKey, overrode };
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
    reasonKey: "build.spellReason.fallback",
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
