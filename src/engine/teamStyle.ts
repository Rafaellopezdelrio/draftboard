// Team mode: five friends in one lobby draft as a team. Before champ select
// they agree on a style (all-in engage, poke and zone control...) and the
// picks that fit it are shown first. Solo and duo play keep the usual advice.
// Rafael and the testers, 24/11: "we start picking with no idea what to
// play; better to settle on a style first".

import type { Archetype, Champion } from "../types/champion";

export type TeamStyle = "engage" | "poke" | "protect" | "pick" | "split";

/** Also the tie-break order of the suggestion: the plans easiest to agree on first. */
export const TEAM_STYLES: TeamStyle[] = ["engage", "pick", "protect", "poke", "split"];

/** Champion kinds (tags in the champion data) that carry each style. */
export const STYLE_ARCHETYPES: Record<TeamStyle, Archetype[]> = {
  engage: ["engage", "frontline"],
  poke: ["poke", "wave-clear"],
  protect: ["peel", "sustain-dps"],
  pick: ["pick", "burst"],
  split: ["splitpush"],
};

/** A full premade: five players in the lobby. */
export const TEAM_PARTY_SIZE = 5;
/** Modes without lanes or a real draft: no team style there. */
const NO_TEAM_MODES = new Set(["ARAM", "CHERRY"]);

export interface PartyInfo {
  /** Players in the lobby (the party). */
  size: number;
  /** Lobby game mode ("CLASSIC", "ARAM", "CHERRY"…); null when unknown. */
  gameMode: string | null;
  /** Summoner ids of the lobby members, to read their champions. */
  summonerIds: number[];
}

/** Five together in any Summoner's Rift queue (Flex, Clash, normal draft,
 * customs to practise): ranked solo/duo can never have five. */
export function isTeamParty(party: PartyInfo | null): boolean {
  if (!party || party.size < TEAM_PARTY_SIZE) return false;
  return !party.gameMode || !NO_TEAM_MODES.has(party.gameMode.toUpperCase());
}

export function fitsStyle(champion: Pick<Champion, "archetypes"> | undefined, style: TeamStyle): boolean {
  const kinds = STYLE_ARCHETYPES[style];
  return !!champion?.archetypes?.some((a) => kinds.includes(a));
}

/** The picks that fit the style first, each group keeping its own order:
 * the style decides what comes first, the draft still ranks inside. */
export function orderByStyle<T extends { champion: Pick<Champion, "archetypes"> }>(
  list: T[],
  style: TeamStyle | null
): T[] {
  if (!style) return list;
  const fit = list.filter((s) => fitsStyle(s.champion, style));
  if (fit.length === 0 || fit.length === list.length) return list;
  return [...fit, ...list.filter((s) => !fitsStyle(s.champion, style))];
}

type LaneAware = {
  champion: Pick<Champion, "archetypes">;
  breakdown?: { lane?: { winRate: number } | null };
};

/** Team mode order. Before your lane rival picks: the style first. Once they
 * picked, the matchup leads: first what fits the style AND beats them, then
 * everything else in the usual order (which already weighs the matchup).
 * Tester, 24/11: "advise champions against the rival's pick, to be more
 * comfortable in the matchup". */
export function orderForTeam<T extends LaneAware>(list: T[], style: TeamStyle | null): T[] {
  if (!style) return list;
  if (!list.some((s) => s.breakdown?.lane)) return orderByStyle(list, style);
  const first = (s: T) => fitsStyle(s.champion, style) && (s.breakdown?.lane?.winRate ?? 0) >= 0.5;
  const lead = list.filter(first);
  if (lead.length === 0 || lead.length === list.length) return list;
  return [...lead, ...list.filter((s) => !first(s))];
}

/** The style most of the group can play: for each style, how many players
 * have at least one of their main champions that fits it. The same lobby
 * gives the same answer in every friend's app. Null without enough data. */
export function suggestStyle(pools: Array<Array<Pick<Champion, "archetypes">>>): TeamStyle | null {
  const players = pools.filter((p) => p.length > 0);
  if (players.length < 2) return null;
  let best: TeamStyle | null = null;
  let bestCount = 0;
  for (const style of TEAM_STYLES) {
    const count = players.filter((pool) => pool.some((c) => fitsStyle(c, style))).length;
    if (count > bestCount) {
      best = style;
      bestCount = count;
    }
  }
  return best;
}
