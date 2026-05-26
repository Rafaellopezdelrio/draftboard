// Polls Riot's Live Client Data API every 2s and exposes the current match
// state as React state.
//
// Performance design (matters because two windows mount this hook):
//
//   1. Single source of truth — ONLY the main window polls the localhost
//      endpoint. After each tick the main window emits a Tauri event with
//      the snapshot. The overlay window subscribes to that event and never
//      polls itself. Result: one fetch per cycle regardless of how many
//      windows are open.
//
//   2. Pause when hidden — if the window's webview is not visible
//      (document.hidden or Tauri window hidden), we skip the tick entirely.
//      No CPU spent rendering or fetching for an unseen webview.
//
//   3. Backoff on misses — out-of-game ticks back off to 10s polling so
//      we're not hammering localhost when LoL isn't running.

import { useEffect, useState } from "react";
import {
  fetchLiveGameSnapshot,
  type LiveGameSnapshot,
} from "../services/liveClient";
import { isOverlayWindow } from "../services/overlay";

export interface LiveGameState {
  inGame: boolean;
  snapshot: LiveGameSnapshot | null;
  /** When `inGame` is false, the reason: "not-running" (no LoL process /
   * api refused) or "not-loaded" (we got an empty response). */
  reason: "in-game" | "not-running" | "loading";
  /** Wall-clock timestamp when this snapshot was received. Lets the UI
   * interpolate the in-game timer between polls so the displayed seconds
   * tick down smoothly every 1s instead of jumping every 2s poll. */
  snapshotAt?: number;
}

const POLL_INTERVAL_MS = 2000;
const SLOW_POLL_INTERVAL_MS = 10000;
const SLOW_AFTER_MISSES = 3;
const EVENT_NAME = "live-game:update";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/* ──────────────────────────────────────────────────────────────────────
 * Singleton poll loop for the MAIN window.
 *
 * Multiple components (BuildPanel, LiveGamePanel, TrackingStatusBar,
 * InGameTimers) call useLiveGame independently. Previously each one
 * spun up its own setInterval — 4 components = 4x localhost:2999
 * requests every 2s. This module hoists the poll loop OUT of the hook
 * so one shared loop services every subscriber. Components register
 * via subscribeMainState; cleanup is automatic on unmount.
 * ────────────────────────────────────────────────────────────────────── */
const mainSubscribers = new Set<(s: LiveGameState) => void>();
let mainState: LiveGameState = {
  inGame: false,
  snapshot: null,
  reason: "loading",
};
let mainPollerActive = false;
// Timer handle kept for future cleanup hook — currently the poller
// runs for the lifetime of the renderer, so we never clear it.
let mainPollerTimer: ReturnType<typeof setTimeout> | null = null;
let mainPollerMisses = 0;
// Defensive: silence unused-var warning while the cleanup path is
// deferred. Marked as void so eslint stays happy without removing
// the binding (we'll wire it once we need teardown).
void mainPollerTimer;
let mainPollerPrevInGame = false;
let mainEmit:
  | ((event: string, payload: unknown) => Promise<void>)
  | null = null;

function startMainPoller(): void {
  if (mainPollerActive) return;
  mainPollerActive = true;
  if (isTauri()) {
    import("@tauri-apps/api/event").then((m) => {
      mainEmit = m.emit;
    });
  }

  const tick = async () => {
    // Pause work when this webview isn't visible (window minimised, tab
    // hidden, OS-level hide). Re-schedule a soft retry so we wake up
    // promptly when visibility flips back on.
    if (typeof document !== "undefined" && document.hidden) {
      mainPollerTimer = setTimeout(tick, SLOW_POLL_INTERVAL_MS);
      return;
    }

    const snap = await fetchLiveGameSnapshot();
    const nowInGame =
      !!snap &&
      snap.gameData?.gameTime !== undefined &&
      snap.gameData.gameTime > 0;
    if (nowInGame !== mainPollerPrevInGame) {
      mainPollerPrevInGame = nowInGame;
      // eslint-disable-next-line no-console
      console.log(
        `[useLiveGame] transition inGame=${nowInGame}${snap?.gameData ? ` mode=${snap.gameData.gameMode} t=${snap.gameData.gameTime?.toFixed(0)}s` : ""}`
      );
    }

    const isLive =
      !!snap &&
      snap.gameData?.gameTime !== undefined &&
      snap.gameData.gameTime > 0;
    const nextState: LiveGameState = isLive
      ? {
          inGame: true,
          snapshot: snap!,
          reason: "in-game",
          snapshotAt: Date.now(),
        }
      : { inGame: false, snapshot: null, reason: "not-running" };

    if (nextState.inGame) mainPollerMisses = 0;
    else mainPollerMisses++;

    // Debounce inGame -> !inGame transition (3 consecutive misses before
    // accepting "game ended"). Same logic as the previous in-hook version.
    if (
      !(
        mainState.inGame &&
        !nextState.inGame &&
        mainPollerMisses < SLOW_AFTER_MISSES
      )
    ) {
      mainState = nextState;
      for (const cb of mainSubscribers) {
        try {
          cb(mainState);
        } catch {
          /* never let one subscriber crash the loop */
        }
      }
    }

    if (mainEmit && isTauri()) {
      mainEmit(EVENT_NAME, nextState).catch(() => {});
    }

    const next =
      mainPollerMisses >= SLOW_AFTER_MISSES
        ? SLOW_POLL_INTERVAL_MS
        : POLL_INTERVAL_MS;
    mainPollerTimer = setTimeout(tick, next);
  };

  tick();
}

function subscribeMainState(cb: (s: LiveGameState) => void): () => void {
  mainSubscribers.add(cb);
  // Replay current state immediately so the new subscriber gets data
  // without waiting up to 2s for the next tick.
  try {
    cb(mainState);
  } catch {
    /* ignore */
  }
  startMainPoller();
  return () => {
    mainSubscribers.delete(cb);
    // Note: we don't stop the poller when the last subscriber leaves
    // because the cost of a single 2s poll is negligible and components
    // re-mount frequently. Avoids start/stop thrash on view switches.
  };
}

export function useLiveGame(enabled: boolean = true): LiveGameState {
  const [state, setState] = useState<LiveGameState>({
    inGame: false,
    snapshot: null,
    reason: "loading",
  });
  const overlay = isOverlayWindow();

  // OVERLAY window: subscribe to events emitted by the main window. No
  // polling — the main window owns the network call so we never duplicate.
  // Overlay still gets snapshotAt populated because we forward the full
  // nextState (which includes snapshotAt) via the Tauri event.
  useEffect(() => {
    if (!enabled || !overlay || !isTauri()) return;

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const unsub = await listen<LiveGameState>(EVENT_NAME, (e) => {
        if (cancelled) return;
        setState(e.payload);
      });
      unlisten = unsub;
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [enabled, overlay]);

  // MAIN window: subscribe to the singleton poller. Previously each
  // hook instance opened its own setInterval — with 5 consumers
  // (BuildPanel, LiveGamePanel, TrackingStatusBar, InGameTimers,
  // overlay subscription) that meant 5x localhost:2999 requests every
  // 2 seconds. The singleton subscribeMainState shares one poll loop
  // across all subscribers; each component still gets reactive state
  // updates via the cb path. Replaces ~80 lines of duplicated polling
  // logic with a single subscribe call.
  useEffect(() => {
    if (!enabled || overlay) return;
    return subscribeMainState(setState);
  }, [enabled, overlay]);

  return state;
}

/**
 * Smooth 1-second ticker for in-game timer interpolation. The base poll
 * happens every 2s (network), so the gameTime in the snapshot is stale by
 * up to 2s. Components that show countdowns (Drake, Baron) call this hook
 * to get a `liveGameTime` value that ticks down every wall-clock second:
 *
 *   liveGameTime = snapshot.gameTime + (now - snapshotAt) / 1000
 *
 * Re-renders the caller every 1s while in-game. When out-of-game or no
 * snapshot, returns the fallback (last seen gameTime) without a ticker.
 */
export function useLiveGameTime(state: LiveGameState): number {
  const [, force] = useState(0);
  useEffect(() => {
    if (!state.inGame || !state.snapshotAt) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [state.inGame, state.snapshotAt]);

  const base = state.snapshot?.gameData.gameTime ?? 0;
  if (!state.snapshotAt) return base;
  return base + (Date.now() - state.snapshotAt) / 1000;
}
