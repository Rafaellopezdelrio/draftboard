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

import { useEffect, useRef, useState } from "react";
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

export function useLiveGame(enabled: boolean = true): LiveGameState {
  const [state, setState] = useState<LiveGameState>({
    inGame: false,
    snapshot: null,
    reason: "loading",
  });
  const missesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // MAIN window: poll + emit events for other windows to consume.
  useEffect(() => {
    if (!enabled || overlay) return;

    let cancelled = false;
    let emit: ((event: string, payload: unknown) => Promise<void>) | null = null;

    if (isTauri()) {
      import("@tauri-apps/api/event").then((m) => {
        emit = m.emit;
      });
    }

    const tick = async () => {
      // Pause work when this webview isn't visible (window minimised, tab
      // hidden, OS-level hide). Re-schedule a soft retry so we wake up
      // promptly when visibility flips back on. Most of the time the main
      // window IS visible so this is a no-op.
      if (typeof document !== "undefined" && document.hidden) {
        timerRef.current = setTimeout(tick, SLOW_POLL_INTERVAL_MS);
        return;
      }

      const snap = await fetchLiveGameSnapshot();
      if (cancelled) return;
      // gameTime semantics from Riot's Live Client API:
      //   - undefined / no response → LoL not running OR not in a match
      //   - NEGATIVE values (-90..0) → loading screen / minion-spawn countdown.
      //     Players + champions are already populated here, so we used to
      //     flip `inGame = true` during loading. That fires timers, overlays,
      //     and "Live game" panels before champions actually spawn — confusing.
      //   - 0+ → match started, minions on map, real game running.
      // Gate on `gameTime > 0` so panels only activate once the game truly
      // begins. Loading screen now reports `inGame: false`.
      const isLive =
        !!snap &&
        snap.gameData?.gameTime !== undefined &&
        snap.gameData.gameTime > 0;
      const nextState: LiveGameState = isLive
        ? { inGame: true, snapshot: snap!, reason: "in-game", snapshotAt: Date.now() }
        : { inGame: false, snapshot: null, reason: "not-running" };

      if (nextState.inGame) missesRef.current = 0;
      else missesRef.current++;

      // Debounce inGame -> !inGame transition. The Live Client API
      // briefly returns empty during loading screens, network blips,
      // or alt-tab focus changes. Flipping inGame=false on the first
      // miss flickers every overlay/timer/panel that depends on it.
      // Wait for SLOW_AFTER_MISSES (3) consecutive misses before
      // accepting "game ended". Previous version returned `prev`
      // unconditionally on this transition — the app then thought you
      // were in-game forever after a single match.
      setState((prev) => {
        if (
          prev.inGame &&
          !nextState.inGame &&
          missesRef.current < SLOW_AFTER_MISSES
        ) {
          return prev;
        }
        return nextState;
      });

      // Broadcast to other windows (overlay). Never throws — if the event
      // bus isn't ready yet (first tick race) the overlay just misses one
      // update and catches up on the next.
      if (emit && isTauri()) {
        emit(EVENT_NAME, nextState).catch(() => {});
      }

      const next =
        missesRef.current >= SLOW_AFTER_MISSES
          ? SLOW_POLL_INTERVAL_MS
          : POLL_INTERVAL_MS;
      timerRef.current = setTimeout(tick, next);
    };

    tick();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
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
