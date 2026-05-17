// Polls Riot's Live Client Data API every 2s and exposes the current match
// state as React state. Stops the timer when out of game; adaptive polling
// (slows down after sustained errors so we're not hammering the localhost
// port when LoL isn't running).

import { useEffect, useRef, useState } from "react";
import {
  fetchLiveGameSnapshot,
  type LiveGameSnapshot,
} from "../services/liveClient";

export interface LiveGameState {
  inGame: boolean;
  snapshot: LiveGameSnapshot | null;
  /** When `inGame` is false, the reason: "not-running" (no LoL process /
   * api refused) or "not-loaded" (we got an empty response). */
  reason: "in-game" | "not-running" | "loading";
}

const POLL_INTERVAL_MS = 2000;
const SLOW_POLL_INTERVAL_MS = 10000; // back off when out-of-game
const SLOW_AFTER_MISSES = 3;

export function useLiveGame(enabled: boolean = true): LiveGameState {
  const [state, setState] = useState<LiveGameState>({
    inGame: false,
    snapshot: null,
    reason: "loading",
  });
  // Track consecutive misses so we can back off the polling interval to
  // avoid hammering localhost when LoL isn't running. Doesn't need to live
  // in React state — only the interval scheduler reads it.
  const missesRef = useRef(0);
  // Stable cancel handle so we can clear/replace the timer on each tick.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState({ inGame: false, snapshot: null, reason: "loading" });
      return;
    }

    let cancelled = false;

    const tick = async () => {
      const snap = await fetchLiveGameSnapshot();
      if (cancelled) return;
      if (snap && snap.gameData?.gameTime !== undefined) {
        missesRef.current = 0;
        setState({ inGame: true, snapshot: snap, reason: "in-game" });
      } else {
        missesRef.current++;
        setState((prev) =>
          prev.inGame
            ? prev // tolerate transient misses while in-game
            : { inGame: false, snapshot: null, reason: "not-running" }
        );
      }
      const next =
        missesRef.current >= SLOW_AFTER_MISSES
          ? SLOW_POLL_INTERVAL_MS
          : POLL_INTERVAL_MS;
      timerRef.current = setTimeout(tick, next);
    };

    // Kick off immediately on mount so the UI updates without waiting one
    // poll interval.
    tick();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled]);

  return state;
}
