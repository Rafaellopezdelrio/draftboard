// Thin wrappers around the Tauri overlay-window commands. The overlay
// is a separate transparent always-on-top window declared in tauri.conf
// (label: "overlay"). These functions only flip visibility / click-through —
// the React side (OverlayApp) drives the content.

import { invoke } from "@tauri-apps/api/core";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function setOverlayVisible(visible: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("overlay_set_visible", { visible });
  } catch {
    // silent — overlay window may not exist in older builds
  }
}

/**
 * When `enabled` is true, the cursor passes THROUGH the overlay to the
 * window underneath (the game). The overlay still RENDERS — you just
 * can't click on it. We flip this OFF briefly when the user hovers a
 * known interactive element (drag handle, close button) so they can
 * actually use it.
 */
export async function setOverlayClickthrough(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("overlay_set_clickthrough", { enabled });
  } catch {
    // silent
  }
}

export async function setOverlayPosition(x: number, y: number): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("overlay_set_position", { x, y });
  } catch {
    // silent
  }
}

/**
 * Shrink-wrap the overlay window to the rendered chip's bounding box.
 * Pixels outside the new size are no longer part of any window, so the
 * game receives clicks there naturally — no per-pixel hit-test needed.
 *
 * Width/height in LOGICAL pixels (Tauri converts to physical via DPI).
 */
export async function setOverlaySize(width: number, height: number): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("overlay_set_size", {
      width: Math.max(40, Math.round(width)),
      height: Math.max(40, Math.round(height)),
    });
  } catch {
    // silent
  }
}

export interface LoLWindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Read the screen-space rect of the running LoL window. Returns null when
 * the client isn't running, isn't visible, or is minimised. Used by the
 * overlay-follow logic to anchor the widget to LoL's top-left corner +
 * track it when the user moves the game window.
 */
export async function getLoLWindowRect(): Promise<LoLWindowRect | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<LoLWindowRect | null>("get_lol_window_rect");
  } catch {
    return null;
  }
}

/**
 * Re-assert HWND_TOPMOST on the overlay window. Tauri's `set_always_on_top`
 * only fires once; Windows drops the topmost flag whenever LoL takes focus.
 * Without periodic re-assertion, the overlay disappears behind the game
 * after the first click into LoL. Mirrors what Mobalytics/Itero do via
 * the Overwolf SDK.
 *
 * Cheap: ~50µs per call. Safe to fire every 1s while the overlay is shown.
 */
export async function assertOverlayTopmost(): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("overlay_assert_topmost");
  } catch {
    // silent — older builds without the command, or platform mismatch
  }
}

/** Returns true when this is the overlay window (vs the main app). */
export function isOverlayWindow(): boolean {
  return new URLSearchParams(window.location.search).get("overlay") === "1";
}
