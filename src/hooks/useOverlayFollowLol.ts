// Anchors the overlay window to the LoL game window's top-left corner +
// follows it across monitors when the user drags LoL around. Replicates
// the auto-positioning Mobalytics/Itero get from the Overwolf SDK using
// pure Win32 reads (FindWindow + GetWindowRect) from Rust.
//
// Behavior contract:
//   1. First time LoL window is detected this session, position overlay
//      at LoL.topLeft + (offsetX, offsetY) — defaults to (24, 24) padding
//      if the user has never dragged it, else uses the stored delta.
//   2. Every 1s while LoL is running, re-check LoL's rect. If it moved,
//      re-position the overlay to maintain the same relative offset.
//   3. If user drags the overlay (data-tauri-drag-region), they're overriding
//      the auto-position — we observe the resulting position and store the
//      new (offsetX, offsetY) so next launch keeps their preferred spot.
//   4. Honors the `overlayFollowLol` pref — false = stop tracking, leave
//      the overlay where the user placed it.

import { useEffect, useRef } from "react";
import {
  getLoLWindowRect,
  isOverlayWindow,
  setOverlayPosition,
} from "../services/overlay";
import { usePrefsStore } from "../state/prefsStore";

// Poll rates: fast when LoL is detected (responsive follow), slow when
// LoL not running (no point hammering FindWindow when there's nothing
// to find). Combined idle savings: ~80% fewer IPC calls.
const POLL_FAST_MS = 1000;
const POLL_SLOW_MS = 5000;
const DEFAULT_OFFSET_X = 24;
const DEFAULT_OFFSET_Y = 24;

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Drive overlay positioning from the LoL window's rect. Mount this once
 * in the MAIN app (not the overlay window) — the main window owns the
 * polling cycle and pushes positions via the Tauri command.
 */
export function useOverlayFollowLol(enabled: boolean): void {
  const follow = usePrefsStore((s) => s.prefs.overlayFollowLol);
  const offsetX = usePrefsStore((s) => s.prefs.overlayOffsetX);
  const offsetY = usePrefsStore((s) => s.prefs.overlayOffsetY);
  const lastLolPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!enabled || !follow || !isTauri()) return;
    // Don't run inside the overlay window itself — only the main window
    // polls. Otherwise we'd reposition ourselves in a loop.
    if (isOverlayWindow()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      // Pause polling when the main window is hidden (minimised, alt-tab
      // away, on another desktop). Saves Win32 IPC + Tauri command cost.
      // We still re-schedule a slow tick so we wake up promptly when
      // visibility flips back on.
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(tick, POLL_SLOW_MS);
        return;
      }
      const rect = await getLoLWindowRect();
      if (cancelled) return;
      let nextDelay = POLL_SLOW_MS;
      if (rect) {
        nextDelay = POLL_FAST_MS;
        const lastPos = lastLolPosRef.current;
        const moved =
          !lastPos || lastPos.x !== rect.x || lastPos.y !== rect.y;
        if (moved) {
          const dx = offsetX ?? DEFAULT_OFFSET_X;
          const dy = offsetY ?? DEFAULT_OFFSET_Y;
          await setOverlayPosition(rect.x + dx, rect.y + dy);
          lastLolPosRef.current = { x: rect.x, y: rect.y };
        }
      } else {
        // LoL closed -> clear anchor + slow down polling. No point
        // checking 60 times a minute for a window that isn't there.
        lastLolPosRef.current = null;
      }
      timer = setTimeout(tick, nextDelay);
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, follow, offsetX, offsetY]);
}
