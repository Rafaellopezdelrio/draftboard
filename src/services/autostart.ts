// Thin wrappers around the Tauri autostart plugin. Lets us flip the
// "start with Windows" toggle from Settings without exposing the plugin
// API to React components.
//
// Behavior:
//   - enable()  → register HKCU\..\Run with `--minimized` arg
//   - disable() → remove the registry entry
//   - isEnabled() → returns true if the registry entry exists
//
// All ops no-op gracefully outside Tauri (vitest, browser) so the
// settings checkbox still renders + tests pass without mocks.

import {
  enable as tauriEnable,
  disable as tauriDisable,
  isEnabled as tauriIsEnabled,
} from "@tauri-apps/plugin-autostart";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function enableAutostart(): Promise<void> {
  if (!isTauri()) return;
  try {
    await tauriEnable();
  } catch {
    // Permission denied (UAC), policy block, etc. — silent.
  }
}

export async function disableAutostart(): Promise<void> {
  if (!isTauri()) return;
  try {
    await tauriDisable();
  } catch {
    // silent
  }
}

export async function isAutostartEnabled(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    return await tauriIsEnabled();
  } catch {
    return false;
  }
}
