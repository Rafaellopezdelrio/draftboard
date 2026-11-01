// Loading-screen enemy scout targets.
//
// Riot's anonymized champ select hides the enemy team (summonerId 0), so the
// enemy scout had nobody to look up in ranked. Once the game is created the
// identities are public: spectator-v5 (official Riot API, one call) lists all
// participants with PUUIDs encrypted for our API key — the only PUUIDs the
// scout's Riot API calls accept. (LCU/gameflow PUUIDs are client-format and
// can't be used against the public API, so gameflow is not a source here.)
//
// Pure extractor + one async refresher driven by useGamePhase's gameflow poll.

import { useDraftStore, type EnemyScoutTarget } from "./draftStore";
import { getCurrentGameByPuuid, type CurrentGameInfo } from "../services/riotApi";
import { loadSettings } from "../services/settingsRepo";

// Encrypted PUUIDs are 78 url-safe base64 chars; anything else (bots' empty
// puuid, client-format UUIDs) can't be looked up, so it's dropped.
const PUUID_RE = /^[A-Za-z0-9_-]{60,100}$/;

function champ(id: unknown): number | null {
  return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null;
}

/** Enemy participants from a spectator-v5 game. [] when I'm not in it or the
 *  game isn't two-sided (Arena: "not my team" would be 14 players). */
export function enemyTargetsFromSpectator(
  game: CurrentGameInfo | null | undefined,
  myPuuid: string
): EnemyScoutTarget[] {
  const parts = Array.isArray(game?.participants) ? game.participants : [];
  const me = parts.find((p) => p.puuid === myPuuid);
  if (!me) return [];
  if (new Set(parts.map((p) => p.teamId)).size !== 2) return [];
  return parts
    .filter((p) => p.teamId !== me.teamId && !p.bot && PUUID_RE.test(p.puuid ?? ""))
    .map((p) => ({
      puuid: p.puuid,
      championId: champ(p.championId),
      hasSmite: p.spell1Id === SMITE || p.spell2Id === SMITE,
    }));
}

// Summoner spell id for Smite.
const SMITE = 11;

// Modes with nobody to scout (spectator 404s or has no human enemies).
const SKIP_MODES = new Set(["PRACTICETOOL", "TFT"]);
// Spectator may 404 for the first seconds of the loading screen; retry on the
// 5s gameflow tick, but stop after this many tries per game.
const MAX_SPECTATOR_TRIES = 12;
let lastGameId: number | null = null;
let spectatorTries = 0;
let resolved = false;
let inFlight = false;
// Bumped by every reset so an answer fetched before it is never accepted,
// even if the same gameId comes back while the request is pending.
let generation = 0;

/** Clear targets + per-game memo (new champ select, account switch). */
export function resetEnemyScoutTargets(): void {
  generation++;
  lastGameId = null;
  spectatorTries = 0;
  resolved = false;
  useDraftStore.getState().setEnemyScoutTargets([]);
}

/**
 * Resolve the enemy team once per game via spectator-v5. Retries while the
 * game isn't listed yet; settles as soon as the game (with me in it) comes
 * back, even with no scoutable enemies (bots), so it never polls a whole
 * match. Never throws — scouting is best-effort.
 */
export async function refreshEnemyScoutTargets(
  gameId: number | undefined,
  gameMode?: string
): Promise<void> {
  if (gameId !== undefined && gameId !== lastGameId) {
    // New game: forget the previous one, including its enemies.
    resetEnemyScoutTargets();
    lastGameId = gameId;
  }
  if (resolved || inFlight || spectatorTries >= MAX_SPECTATOR_TRIES) return;
  if (gameMode && SKIP_MODES.has(gameMode.toUpperCase())) {
    resolved = true;
    return;
  }
  spectatorTries++;
  inFlight = true;
  const startedGen = generation;
  try {
    const cfg = await loadSettings();
    // Same requirement as LiveGameView: the encrypted PUUID saved by Settings.
    // Not "resolved": a Riot ID saved mid-game is picked up on a later try.
    if (!cfg?.puuid) return;
    const game = await getCurrentGameByPuuid(cfg, cfg.puuid);
    // The game changed (or was reset) while we waited: drop this answer.
    if (startedGen !== generation) return;
    if (!game || (gameId !== undefined && game.gameId !== gameId)) return;
    if (!(game.participants ?? []).some((p) => p.puuid === cfg.puuid)) return;
    useDraftStore.getState().setEnemyScoutTargets(enemyTargetsFromSpectator(game, cfg.puuid));
    resolved = true;
  } catch {
    /* spectator down / rate-limited — retried on the next tick */
  } finally {
    inFlight = false;
  }
}
