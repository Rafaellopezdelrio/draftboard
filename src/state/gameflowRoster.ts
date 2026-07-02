// Gameflow → draft-board bridge for the loading-screen / early-game gap.
//
// Riot's anonymized champ select can leave the LCU champ-select roster empty,
// so the board (and everything keyed off ally/enemyKeys) has nothing when the
// game starts. The gameflow session (`/lol-gameflow/v1/session`) — which
// useGamePhase ALREADY polls every 5s for the phase — carries the resolved
// teams in `gameData.teamOne/teamTwo` once the game is being created. This
// module extracts them DEFENSIVELY (unknown/anonymized shapes degrade to a
// no-op) and fills the draft store only when the board is empty, bridging the
// window between champ-select end and the Live Client coming up (which App
// then uses via liveRosterKeys).

import { useDraftStore } from "./draftStore";

/** Minimal, defensive view of a gameflow team-member entry. Riot ships many
 *  more fields; we only trust championId + identity for side resolution. */
interface GameflowPlayer {
  championId?: number;
  puuid?: string;
  summonerId?: number;
}

export interface GameflowGameData {
  teamOne?: GameflowPlayer[];
  teamTwo?: GameflowPlayer[];
}

export interface GameflowRoster {
  /** championIds (>0 only) for the local player's team. */
  allyIds: number[];
  enemyIds: number[];
}

/**
 * Extract the two teams' championIds from gameflow gameData, oriented so
 * `allyIds` is the local player's side. Pure + defensive:
 * - returns null when the payload has no teams, no usable championIds, or the
 *   local player can't be found on either team (never guesses the side);
 * - championId <= 0 entries (anonymized/unfilled) are skipped.
 */
export function rosterFromGameflow(
  gameData: GameflowGameData | undefined | null,
  me: { puuid?: string | null; summonerId?: number | null }
): GameflowRoster | null {
  const teamOne = Array.isArray(gameData?.teamOne) ? gameData.teamOne : [];
  const teamTwo = Array.isArray(gameData?.teamTwo) ? gameData.teamTwo : [];
  if (teamOne.length === 0 && teamTwo.length === 0) return null;

  const isMe = (p: GameflowPlayer): boolean =>
    (!!me.puuid && p.puuid === me.puuid) ||
    (!!me.summonerId && p.summonerId === me.summonerId);
  const mineIsOne = teamOne.some(isMe);
  const mineIsTwo = teamTwo.some(isMe);
  // Can't place the local player → don't guess (a flipped roster would feed
  // the comp/matchup engines exactly backwards).
  if (!mineIsOne && !mineIsTwo) return null;

  const ids = (team: GameflowPlayer[]): number[] =>
    team
      .map((p) => p.championId ?? 0)
      .filter((id) => Number.isInteger(id) && id > 0);

  const allyIds = ids(mineIsOne ? teamOne : teamTwo);
  const enemyIds = ids(mineIsOne ? teamTwo : teamOne);
  if (allyIds.length === 0 && enemyIds.length === 0) return null;
  return { allyIds, enemyIds };
}

/**
 * Fill the draft board from a gameflow roster — but ONLY when the board is
 * completely empty (anonymized-select case). A populated board is champ-select
 * truth and must never be overwritten by this bridge.
 * Returns true when it wrote something (for logging/tests).
 */
export function applyGameflowRoster(roster: GameflowRoster | null): boolean {
  if (!roster) return false;
  const store = useDraftStore.getState();
  const boardEmpty =
    store.ally.every((s) => !s.championKey) &&
    store.enemy.every((s) => !s.championKey);
  if (!boardEmpty) return false;

  roster.allyIds.slice(0, 5).forEach((id, idx) => {
    store.setPick("ally", idx, String(id));
  });
  roster.enemyIds.slice(0, 5).forEach((id, idx) => {
    store.setPick("enemy", idx, String(id));
  });
  return roster.allyIds.length > 0 || roster.enemyIds.length > 0;
}
