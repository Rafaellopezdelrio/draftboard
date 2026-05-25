// Riot Live Client Data API — read-only access to the current LoL match.
//
// While you're in-game (after loading screen completes) Riot exposes an HTTP
// server on `https://127.0.0.1:2999/` that serves live match data: scores,
// items, runes, summoner spells, events (drake/baron/turret kills), and a
// running game timer. Self-signed cert, no auth, localhost only.
//
// This is the API Blitz/Mobalytics/Porofessor use for their in-game overlay
// data. Officially permitted by Riot's third-party policy (read-only, doesn't
// touch the game memory or client).
//
// We poll it from a single hook (`useLiveGame`) every 2s and emit a
// derived "is in game" boolean + the parsed payload. Polling stops when
// we get repeated errors (game over / not in game).

import { invoke } from "@tauri-apps/api/core";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// ---- Types mirroring Riot's response. Conservative — we only declare the
// fields we actually consume. Unknown fields stay typed as `unknown`.

export interface LiveGameRunes {
  keystone?: { displayName: string; id: number };
  primaryRuneTree?: { displayName: string; id: number };
  secondaryRuneTree?: { displayName: string; id: number };
}

export interface LiveGameItem {
  itemID: number;
  count: number;
  slot: number;
  price: number;
  canUse: boolean;
  displayName: string;
  consumable: boolean;
}

export interface LiveGameScores {
  assists: number;
  creepScore: number;
  deaths: number;
  kills: number;
  wardScore: number;
}

export interface LiveGameSummonerSpell {
  displayName: string;
  rawDescription: string;
}

export interface LiveGamePlayer {
  championName: string;
  isBot: boolean;
  isDead: boolean;
  level: number;
  position: string; // TOP | JUNGLE | MIDDLE | BOTTOM | UTILITY | "" (ARAM)
  rawChampionName: string;
  respawnTimer?: number;
  riotIdGameName?: string;
  riotIdTagLine?: string;
  scores: LiveGameScores;
  skinID: number;
  summonerName: string;
  summonerSpells: {
    summonerSpellOne: LiveGameSummonerSpell;
    summonerSpellTwo: LiveGameSummonerSpell;
  };
  team: "ORDER" | "CHAOS";
  items: LiveGameItem[];
}

export interface LiveGameActivePlayer {
  abilities?: unknown;
  championStats?: {
    currentHealth: number;
    maxHealth: number;
    resourceMax: number;
    resourceValue: number;
  };
  currentGold: number;
  fullRunes?: LiveGameRunes;
  level: number;
  summonerName: string;
  riotIdGameName?: string;
  riotIdTagLine?: string;
  teamRelativeColors?: boolean;
}

/** Discrete in-game event with timestamp. EventName covers a lot of values; we
 * only react to a handful but keep the shape open for future use. */
export interface LiveGameEvent {
  EventID: number;
  EventName: string;
  EventTime: number;
  // Common per-event fields. Optional because Riot's payload is polymorphic.
  KillerName?: string;
  VictimName?: string;
  Assisters?: string[];
  TurretKilled?: string;
  DragonType?: string;
  Stolen?: string;
  InhibKilled?: string;
}

export interface LiveGameData {
  gameMode: string;
  gameTime: number; // seconds since GameStart
  mapName?: string;
  mapNumber: number;
  mapTerrain?: string;
}

export interface LiveGameSnapshot {
  activePlayer: LiveGameActivePlayer | null;
  allPlayers: LiveGamePlayer[];
  events: LiveGameEvent[];
  gameData: LiveGameData;
}

/**
 * Find the local player inside `allPlayers`. Riot's payload uses several
 * name fields that don't always agree across patches:
 *
 *   - `activePlayer.summonerName` may be just gameName (older) or
 *     `gameName#tagLine` (newer).
 *   - `allPlayers[].summonerName` likewise varies, and on Riot ID accounts
 *     can be `gameName#tagLine` while activePlayer's is just `gameName`.
 *   - `riotIdGameName` / `riotIdTagLine` are split fields, usually set on
 *     both sides after the Riot ID migration.
 *
 * When the two sides disagree, naive `===` matching returns null and
 * downstream code (team detection, my-stats) falls back to the wrong team.
 * In ARAM this looked like "no detecta a los campeones rivales" — when
 * `myTeam` defaults to ORDER but the user is on CHAOS, the overlay shows
 * enemies under the "Aliados" header and vice versa.
 *
 * This matcher tries every reasonable comparison before giving up.
 */
export function findMyPlayer(
  active: LiveGameActivePlayer | null | undefined,
  allPlayers: LiveGamePlayer[]
): LiveGamePlayer | null {
  if (!active) return null;
  const norm = (s: string | undefined | null): string =>
    (s ?? "").toLowerCase().replace(/\s+/g, "").trim();
  const stripTag = (s: string | undefined | null): string => {
    const n = norm(s);
    const hash = n.indexOf("#");
    return hash >= 0 ? n.slice(0, hash) : n;
  };
  const aSummoner = norm(active.summonerName);
  const aSummonerNoTag = stripTag(active.summonerName);
  const aGame = norm(active.riotIdGameName);
  const aFull = active.riotIdGameName && active.riotIdTagLine
    ? norm(`${active.riotIdGameName}#${active.riotIdTagLine}`)
    : "";

  for (const p of allPlayers) {
    const pSummoner = norm(p.summonerName);
    const pSummonerNoTag = stripTag(p.summonerName);
    const pGame = norm(p.riotIdGameName);
    const pFull = p.riotIdGameName && p.riotIdTagLine
      ? norm(`${p.riotIdGameName}#${p.riotIdTagLine}`)
      : "";
    if (aSummoner && pSummoner && aSummoner === pSummoner) return p;
    if (aFull && pFull && aFull === pFull) return p;
    if (aGame && pGame && aGame === pGame) return p;
    if (aSummonerNoTag && pSummonerNoTag && aSummonerNoTag === pSummonerNoTag) return p;
    if (aSummonerNoTag && pGame && aSummonerNoTag === pGame) return p;
    if (aGame && pSummonerNoTag && aGame === pSummonerNoTag) return p;
  }
  return null;
}

/**
 * One-shot fetch of the current game data. Resolves `null` if we're not in a
 * game (connection refused / 404) — that's the EXPECTED state most of the
 * time and shouldn't surface as an error.
 */
export async function fetchLiveGameSnapshot(): Promise<LiveGameSnapshot | null> {
  if (!isTauri()) return null;
  try {
    const raw = await invoke<Record<string, unknown>>("live_client_all_game_data");
    if (!raw || typeof raw !== "object") return null;
    // Normalise: events list is nested under `events.Events` in the Riot
    // payload; flatten for ergonomic consumption.
    const eventsList = (raw.events as { Events?: LiveGameEvent[] } | undefined)?.Events;
    return {
      activePlayer: (raw.activePlayer as LiveGameActivePlayer | undefined) ?? null,
      allPlayers: (raw.allPlayers as LiveGamePlayer[] | undefined) ?? [],
      events: eventsList ?? [],
      gameData: (raw.gameData as LiveGameData | undefined) ?? {
        gameMode: "",
        gameTime: 0,
        mapNumber: 0,
      },
    };
  } catch {
    // Connection refused / 404 / timeout = not in a game. Silent.
    return null;
  }
}
