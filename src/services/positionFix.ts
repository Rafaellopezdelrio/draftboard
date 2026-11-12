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

/** Test-only: forget the registered champion table. */
export function __testOnly_resetChampionIds(): void {
  idByKey = {};
}
