// Rune pages pushed to the League client. op.gg ships rune and tree NAMES;
// the client wants numeric ids — this assembles a full 9-perk page.
//
// Every page Draftboard writes starts with RUNE_PAGE_PREFIX: the Rust side
// only ever replaces pages carrying it, never the player's own pages.
import { lookupPerkId } from "../data/runePerkIds";
import type { OpggRunes } from "./opggBuilds";
import type { RunePageInput } from "./lcuService";

export const RUNE_PAGE_PREFIX = "Draftboard";

/** Build the client page name for a Draftboard rune page. */
export function runePageName(label: string): string {
  return `${RUNE_PAGE_PREFIX} · ${label}`;
}

// Tree name (op.gg English or Spanish locale) → perk style id.
const STYLE_IDS: Record<string, number> = {
  precision: 8000,
  "precisión": 8000,
  domination: 8100,
  "dominación": 8100,
  sorcery: 8200,
  "brujería": 8200,
  resolve: 8400,
  valor: 8400,
  inspiration: 8300,
  "inspiración": 8300,
};

// Rune rows per tree (DDragon runesReforged 16.21.1). Row 0 = keystones.
// Used to reject a page the client would refuse: a mistranslated name can
// map to a rune from another tree or row (Axiom Arcanist once pointed at
// First Strike, an Inspiration keystone).
export const RUNE_TREES: Record<number, number[][]> = {
  8000: [[8005, 8008, 8021, 8010], [9101, 9111, 8009], [9104, 9105, 9103], [8014, 8017, 8299]],
  8100: [[8112, 8128, 9923], [8126, 8139, 8143], [8137, 8140, 8141], [8135, 8105, 8106]],
  8200: [[8214, 8229, 8230, 8992], [8224, 8226, 8275], [8210, 8234, 8233], [8237, 8232, 8236]],
  8300: [[8351, 8360, 8369], [8306, 8304, 8321], [8313, 8352, 8345], [8347, 8410, 8316]],
  8400: [[8437, 8439, 8465], [8446, 8463, 8401], [8429, 8444, 8473], [8451, 8453, 8242]],
};

/** True when the 6 rune ids form a page the client accepts. */
export function isLegalRunePage(primaryStyleId: number, subStyleId: number, perks: number[]): boolean {
  const primary = RUNE_TREES[primaryStyleId];
  const sub = RUNE_TREES[subStyleId];
  if (!primary || !sub || primaryStyleId === subStyleId || perks.length < 6) return false;
  // One rune from each primary row, in row order.
  if (!primary.every((row, i) => row.includes(perks[i]))) return false;
  // Two secondary runes from distinct non-keystone rows of the sub tree.
  const rows = perks.slice(4, 6).map((id) => sub.findIndex((row, i) => i > 0 && row.includes(id)));
  return rows.every((r) => r > 0) && rows[0] !== rows[1];
}

/**
 * Turn an op.gg rune entry into a page the client accepts: 4 primary runes,
 * 2 secondary runes, 3 stat shards. Null when anything can't be mapped or
 * the result isn't a legal page — a bad page would be rejected by the client
 * (or worse, applied wrong).
 */
export function opggRunesToPage(r: OpggRunes, label: string): RunePageInput | null {
  const primaryStyleId = STYLE_IDS[(r.primaryPage ?? "").toLowerCase()];
  const subStyleId = STYLE_IDS[(r.secondaryPage ?? "").toLowerCase()];
  if (!primaryStyleId || !subStyleId || primaryStyleId === subStyleId) return null;
  if (r.primaryRunes?.length !== 4 || r.secondaryRunes?.length !== 2 || r.statMods?.length !== 3) {
    return null;
  }
  const perks = [...r.primaryRunes, ...r.secondaryRunes].map((n) => lookupPerkId(n));
  // op.gg sends shard ids as strings today; accept names too, like RuneIcon.
  const shards = r.statMods.map((s) => (/^\d+$/.test(s) ? Number(s) : lookupPerkId(s)));
  if (perks.some((id) => id === null) || shards.some((id) => id === null || id <= 0)) {
    return null;
  }
  if (!isLegalRunePage(primaryStyleId, subStyleId, perks as number[])) return null;
  return {
    name: runePageName(label),
    primaryStyleId,
    subStyleId,
    selectedPerkIds: [...(perks as number[]), ...(shards as number[])],
  };
}
