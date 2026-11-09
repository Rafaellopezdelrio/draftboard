// Objective spawn projection from the Live Client event log. Shared by
// LiveGamePanel and the in-game OverlayApp, which each used to carry their own
// inline copy of this logic (and they had drifted — the overlay copy skipped
// the EventTime type-guard the panel had). One pure, tested definition now.
//
// 100% derived from Riot's official Live Client Data API event log — no memory
// reads, no OCR. ToS-safe.

import type { LiveGameEvent } from "./liveClient";

// Riot's respawn timers (seconds after kill). Values match the in-game minimap
// timers, sourced from Riot's published patch notes. Tune if a patch changes.
export const DRAGON_RESPAWN_SEC = 5 * 60; // 5min
export const BARON_RESPAWN_SEC = 6 * 60; // 6min (after first spawn at 20min)
export const FIRST_DRAGON_SPAWN_SEC = 5 * 60; // 5min from game start
export const FIRST_BARON_SPAWN_SEC = 20 * 60; // 20min from game start
// The first Baron countdown only shows in the last 3 minutes: a 17-minute
// timer from the start is noise on the panel and overlay.
export const FIRST_BARON_SHOW_SEC = FIRST_BARON_SPAWN_SEC - 3 * 60;
// Elder replaces the elemental drakes once a team has Soul (4 drakes): it
// spawns 6min after the Soul drake and respawns 6min after each Elder kill.
export const ELDER_RESPAWN_SEC = 6 * 60;
/** Live Client gameData.mapNumber for Summoner's Rift. Other maps (Howling
 *  Abyss, Arena, ...) have no dragon/baron. */
export const SUMMONERS_RIFT_MAP = 11;
// Herald respawn (4min, until 20min when Baron spawns) intentionally left out —
// needs separate event tracking we'll add later.

export interface DerivedTimers {
  /** Game time in seconds when the next dragon should be killable. */
  nextDragonAt: number | null;
  nextBaronAt: number | null;
}

/** Seconds → "M:SS". Clamps negatives to 0 so a passed ETA reads "0:00", not
 *  "-1:59". Shared by the live panel + overlay clocks. */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * Project the next dragon/baron spawn from the past kill events. Pure: depends
 * only on the event log + current game time, so it's trivially testable and
 * safe to call every poll.
 */
export function deriveTimers(
  events: LiveGameEvent[],
  gameTime: number,
  opts: {
    /** gameData.mapNumber; when given and not the Rift, there are no timers. */
    mapNumber?: number;
    /** Team-attributed dragon counts (liveClient.attributeObjectives), used to
     *  detect Soul -> Elder (6min) timing. */
    dragonsByTeam?: { ORDER: number; CHAOS: number } | null;
  } = {}
): DerivedTimers {
  if (opts.mapNumber !== undefined && opts.mapNumber !== SUMMONERS_RIFT_MAP) {
    return { nextDragonAt: null, nextBaronAt: null };
  }
  let lastDragonKill: number | null = null;
  let lastDragonElder = false;
  let elementalKills = 0;
  let lastBaronKill: number | null = null;

  // Team attribution of objective kills lives in liveClient.attributeObjectives
  // (joins KillerName -> allPlayers[].team). Here we only need the last-kill
  // timestamps to project the next spawn.
  for (const ev of events) {
    if (ev.EventName === "DragonKill" && typeof ev.EventTime === "number") {
      lastDragonKill = ev.EventTime;
      lastDragonElder = ev.DragonType === "Elder";
      if (!lastDragonElder) elementalKills++;
    } else if (ev.EventName === "BaronKill" && typeof ev.EventTime === "number") {
      lastBaronKill = ev.EventTime;
    }
  }

  // Soul = a team on 4 drakes. Attributed counts can miss kills, so the raw
  // elemental total only rules Soul out (<4) or forces it (>=7, since 3+3 is
  // the most possible without Soul).
  const byTeam = opts.dragonsByTeam;
  const soulClaimed =
    elementalKills >= 7 ||
    (elementalKills >= 4 && !!byTeam && (byTeam.ORDER >= 4 || byTeam.CHAOS >= 4));
  const dragonRespawn =
    lastDragonElder || soulClaimed ? ELDER_RESPAWN_SEC : DRAGON_RESPAWN_SEC;
  const nextDragonAt =
    lastDragonKill !== null
      ? lastDragonKill + dragonRespawn
      : gameTime < FIRST_DRAGON_SPAWN_SEC
        ? FIRST_DRAGON_SPAWN_SEC
        : null;
  const nextBaronAt =
    lastBaronKill !== null
      ? lastBaronKill + BARON_RESPAWN_SEC
      : gameTime >= FIRST_BARON_SHOW_SEC && gameTime < FIRST_BARON_SPAWN_SEC
        ? FIRST_BARON_SPAWN_SEC
        : null;

  return { nextDragonAt, nextBaronAt };
}
