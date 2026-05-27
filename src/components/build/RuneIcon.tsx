// Rune icon + helpers — resolves a string rune name (e.g. "Conqueror",
// "Triunfo") or numeric stat-shard ID to a perk ID, then renders the
// real perk image via the perks.json manifest loader. Falls back to a
// styled text chip when the name isn't mappable + a faded placeholder
// when the manifest URL itself 404s.
//
// Tooltip uses a styled custom popup instead of native `title` because
// the OS-level tooltip kept overlapping adjacent rune icons (visible
// in Sentry-reported regressions).
//
// Extracted from BuildPanel.tsx so the rune cluster owns its own
// resolution + render in one file. Also exports `translateTree` since
// it's adjacent — both are used by the parent's rune block.

import { useEffect, useState } from "react";
import { lookupPerkId } from "../../data/runePerkIds";
import { getPerkIconUrl, subscribeToPerkIcons } from "../../services/perkIcons";

/**
 * Spanish translations for op.gg's English tree names. Falls through
 * the input string when already in Spanish or unknown.
 */
const TREE_NAMES_ES: Record<string, string> = {
  Precision: "Precisión",
  Domination: "Dominación",
  Sorcery: "Hechicería",
  Resolve: "Determinación",
  Inspiration: "Inspiración",
};

export function translateTree(name: string | undefined): string {
  if (!name) return "";
  const direct = TREE_NAMES_ES[name];
  if (direct) return direct;
  for (const k of Object.keys(TREE_NAMES_ES)) {
    if (k.toLowerCase() === name.toLowerCase()) return TREE_NAMES_ES[k];
  }
  return name;
}

/**
 * Resolve a rune string to a perk ID.
 *   1. Numeric string → use directly (op.gg ships statMods as raw IDs).
 *   2. Named string → lookup via RUNE_NAME_TO_PERK_ID.
 *   3. Anything else → null (caller renders text fallback).
 */
function resolveRuneId(name: string): number | null {
  if (!name) return null;
  if (/^\d+$/.test(name)) {
    const n = parseInt(name, 10);
    if (n > 0) return n;
  }
  return lookupPerkId(name);
}

interface Props {
  name: string;
  /** Highlight the keystone with a larger size + glow. */
  keystone?: boolean;
  /** Stat-shard variant (smaller). */
  small?: boolean;
}

export function RuneIcon({ name, keystone = false, small = false }: Props) {
  const perkId = resolveRuneId(name);
  const size = keystone ? "w-12 h-12" : small ? "w-6 h-6" : "w-8 h-8";

  // Re-render once perks.json finishes loading so the placeholder URL
  // swaps to the proper per-perk image automatically.
  const [, force] = useState(0);
  useEffect(() => {
    return subscribeToPerkIcons(() => force((n) => n + 1));
  }, []);

  if (perkId === null) {
    // Unknown rune name — render a styled text chip rather than a
    // broken icon. Tooltip preserves the original name for debug.
    return (
      <span
        className={`inline-flex items-center justify-center px-1.5 ${keystone ? "py-1 text-[10px]" : "py-0.5 text-[9px]"} bg-bg-card/60 ring-1 ring-border-subtle rounded text-white/70`}
        title={`Sin icono: ${name}`}
      >
        {name}
      </span>
    );
  }

  const src = getPerkIconUrl(perkId);
  return (
    <span className="relative inline-block group/rune" aria-label={name}>
      <img
        src={src}
        alt={name}
        className={`${size} rounded ${keystone ? "ring-2 ring-accent/70 shadow-[0_0_8px_rgba(78,205,196,0.45)] bg-black/40 p-0.5" : "ring-1 ring-border-subtle bg-black/30"}`}
        onError={(e) => {
          const img = e.currentTarget;
          img.style.opacity = "0.3";
        }}
      />
      {/* Compact styled tooltip — never bleeds into adjacent runes. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-7 px-1.5 py-0.5 rounded bg-bg-elev/95 border border-border-subtle text-[10px] text-white whitespace-nowrap opacity-0 group-hover/rune:opacity-100 transition-opacity z-30 shadow-md"
      >
        {name}
      </span>
    </span>
  );
}
