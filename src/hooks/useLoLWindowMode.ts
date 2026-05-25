// Polls Tauri's `detect_lol_window_mode` command to surface the LoL
// client's current window mode in React. Drives the overlay-compatibility
// warning shown in Settings + the toast that nags exclusive-fullscreen
// users to switch to Borderless.
//
// Cheap: one Win32 syscall every 5s. Pauses when document hidden.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type LoLWindowMode =
  | "not-running"
  | "windowed"
  | "borderless"
  | "fullscreen-exclusive"
  | "unknown";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Fast poll when LoL is running (mode might change as user toggles
// windowed/borderless mid-session). Slow when LoL closed — the mode
// can't change without LoL being open, so don't waste IPC.
const POLL_FAST_MS = 5_000;
const POLL_SLOW_MS = 30_000;

export function useLoLWindowMode(enabled: boolean = true): LoLWindowMode {
  const [mode, setMode] = useState<LoLWindowMode>("unknown");

  useEffect(() => {
    if (!enabled || !isTauri()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(tick, POLL_SLOW_MS);
        return;
      }
      let detected: LoLWindowMode = "unknown";
      try {
        detected = (await invoke<string>("detect_lol_window_mode")) as LoLWindowMode;
        if (!cancelled) setMode(detected);
      } catch {
        if (!cancelled) setMode("unknown");
      }
      // Slow down when LoL isn't running — no point polling fast when
      // there's nothing to detect.
      const next = detected === "not-running" ? POLL_SLOW_MS : POLL_FAST_MS;
      timer = setTimeout(tick, next);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  return mode;
}

/** Whether the current window mode supports our Win32 overlay technique. */
export function overlayCompatibleMode(m: LoLWindowMode): boolean {
  return m === "windowed" || m === "borderless";
}
