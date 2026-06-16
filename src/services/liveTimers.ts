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
export const BARON_RESPAWN_SEC = 6 * 60; // 6min (after first spawn at 25min)
export const FIRST_DRAGON_SPAWN_SEC = 5 * 60; // 5min from game start
// Herald respawn (4min, until 20min when Baron spawns) intentionally left out —
// needs separate event tracking we'll add later.

export interface DerivedTimers {
  /** Game time in seconds when the next dragon should be killable. */
  nextDragonAt: number | null;
  nextBaronAt: number | null;
}

/**
 * Project the next dragon/baron spawn from the past kill events. Pure: depends
 * only on the event log + current game time, so it's trivially testable and
 * safe to call every poll.
 */
export function deriveTimers(
  events: LiveGameEvent[],
  gameTime: number
): DerivedTimers {
  let lastDragonKill: number | null = null;
  let lastBaronKill: number | null = null;

  // Team attribution of objective kills lives in liveClient.attributeObjectives
  // (joins KillerName -> allPlayers[].team). Here we only need the last-kill
  // timestamps to project the next spawn.
  for (const ev of events) {
    if (ev.EventName === "DragonKill" && typeof ev.EventTime === "number") {
      lastDragonKill = ev.EventTime;
    } else if (ev.EventName === "BaronKill" && typeof ev.EventTime === "number") {
      lastBaronKill = ev.EventTime;
    }
  }

  const nextDragonAt =
    lastDragonKill !== null
      ? lastDragonKill + DRAGON_RESPAWN_SEC
      : gameTime < FIRST_DRAGON_SPAWN_SEC
        ? FIRST_DRAGON_SPAWN_SEC
        : null;
  const nextBaronAt =
    lastBaronKill !== null ? lastBaronKill + BARON_RESPAWN_SEC : null;

  return { nextDragonAt, nextBaronAt };
}
