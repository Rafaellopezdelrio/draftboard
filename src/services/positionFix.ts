// Sanity check for the position Riot reports for a game. Riot's own guess
// (teamPosition, or the old lane field in the client's history) is sometimes
// wrong: a friend's mid Ahri was stored as TOP, and the AI coach then told him
// his "Ahri top" was the problem. We cross-check against the roles a champion
// is usually played in.
//
// The champion-number -> name table comes from the loaded champion list
// (registered at boot), so sync code that only has numbers can use it.

import { CHAMPION_ROLES } from "../data/championRoles";
import type { ChampionDb, Role } from "../types/champion";

const ROLES: readonly Role[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
let idByKey: Record<string, string> = {};

/** Called once the champion list loads. */
export function registerChampionIds(db: Pick<ChampionDb, "champions">): void {
  const next: Record<string, string> = {};
  for (const c of Object.values(db.champions)) next[c.key] = c.id;
  idByKey = next;
}

function normalize(p: string | null | undefined): Role | null {
  const u = (p ?? "").toUpperCase();
  if (u === "MID") return "MIDDLE";
  if (u === "BOT" || u === "ADC") return "BOTTOM";
  if (u === "SUPPORT") return "UTILITY";
  return (ROLES as readonly string[]).includes(u) ? (u as Role) : null;
}

/**
 * Pick the position to keep from Riot's signals, best first.
 *  1. The first signal that fits the champion's usual roles.
 *  2. If none fits and the champion is only ever played in one role, that role
 *     (a one-role champion "played" elsewhere is almost always Riot's mistake).
 *  3. Otherwise the first signal, as Riot reported it.
 * Returns "" when there is no usable signal (ARAM, empty fields).
 */
export function choosePosition(
  signals: Array<string | null | undefined>,
  championKey: number | string
): string {
  const valid = signals.map(normalize).filter((r): r is Role => r !== null);
  if (valid.length === 0) return "";
  const id = idByKey[String(championKey)];
  const usual = id ? CHAMPION_ROLES[id] : undefined;
  if (!usual || usual.length === 0) return valid[0];
  const fitting = valid.find((r) => usual.includes(r));
  if (fitting) return fitting;
  if (usual.length === 1) return usual[0];
  return valid[0];
}

const usualRoles = (championKey: number | string): readonly string[] => {
  const id = idByKey[String(championKey)];
  return (id && CHAMPION_ROLES[id]) || [];
};

/**
 * choosePosition looks at one player; a team needs one of each role. When the
 * choices leave a team with a role twice and another missing, settle it:
 *  - the other player in the doubled role usually plays the missing one →
 *    Riot swapped them, move that player (the mid Ahri labelled TOP case);
 *  - else the player whose Riot position IS the missing role keeps it (a real
 *    off-meta pick: Ezreal top, 23/11 — "ADC" left his team with two ADCs).
 * Returns the final positions, in order. ARAM-like teams (blank) are skipped.
 */
export function settleTeamPositions(
  players: Array<{ teamId: number; championId: number; position: string; riot: string | null | undefined }>
): string[] {
  const out = players.map((p) => p.position);
  for (const teamId of new Set(players.map((p) => p.teamId))) {
    const idx = players.map((p, i) => (p.teamId === teamId ? i : -1)).filter((i) => i >= 0);
    if (idx.length !== 5 || idx.some((i) => !out[i])) continue;
    for (let pass = 0; pass < 5; pass++) {
      const missing = ROLES.filter((r) => !idx.some((i) => out[i] === r));
      const doubled = ROLES.find((r) => idx.filter((i) => out[i] === r).length > 1);
      if (!doubled || missing.length === 0) break;
      const dups = idx.filter((i) => out[i] === doubled);
      const swapped = missing
        .map((m) => ({ m, i: dups.find((i) => normalize(players[i].riot) !== m && usualRoles(players[i].championId).includes(m)) }))
        .find((x) => x.i !== undefined);
      const offMeta = missing
        .map((m) => ({ m, i: dups.find((i) => normalize(players[i].riot) === m) }))
        .find((x) => x.i !== undefined);
      const fix = swapped ?? offMeta;
      if (!fix || fix.i === undefined) break;
      out[fix.i] = fix.m;
    }
  }
  return out;
}

/** Test-only: forget the registered champion table. */
export function __testOnly_resetChampionIds(): void {
  idByKey = {};
}
