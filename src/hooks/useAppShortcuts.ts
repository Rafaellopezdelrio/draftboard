// Global keyboard shortcuts for the main app shell. Extracted from App.tsx to
// keep the root component focused on layout — it owned ~30 lines of
// useGlobalShortcut wiring plus the input-guard for the bare-key role hotkeys.
//
// Bindings (mirrors ShortcutsHelp):
//   Ctrl+K  command palette  ·  Ctrl+/  shortcuts help
//   1-5     pick role (TOP..UTILITY)  ·  R  reset draft  ·  Esc  close palette
//
// Bare-key bindings (1-5, R) are suppressed while focus is in a text field so
// they don't fire mid Riot-ID entry.

import type { Role } from "../types/champion";
import { useEscape, useGlobalShortcut } from "./useKeyboardShortcuts";

/** True when focus is in a text-entry field — bare-key shortcuts must no-op
 *  there so typing (e.g. a Riot ID) doesn't swap role or reset the draft. */
export function isTypingTarget(
  el: Element | null = typeof document !== "undefined" ? document.activeElement : null
): boolean {
  const tag = el?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA";
}

interface AppShortcutHandlers {
  setMyRole: (role: Role) => void;
  reset: () => void;
  openPalette: () => void;
  openShortcuts: () => void;
  closePalette: () => void;
  paletteOpen: boolean;
}

export function useAppShortcuts({
  setMyRole,
  reset,
  openPalette,
  openShortcuts,
  closePalette,
  paletteOpen,
}: AppShortcutHandlers): void {
  useGlobalShortcut({ key: "k", ctrl: true }, openPalette);
  useGlobalShortcut({ key: "/", ctrl: true }, openShortcuts);

  // 1-5 → role. New closure per render mirrors the original inline binding.
  const setRoleHotkey = (role: Role) => () => {
    if (isTypingTarget()) return;
    setMyRole(role);
  };
  useGlobalShortcut({ key: "1" }, setRoleHotkey("TOP"));
  useGlobalShortcut({ key: "2" }, setRoleHotkey("JUNGLE"));
  useGlobalShortcut({ key: "3" }, setRoleHotkey("MIDDLE"));
  useGlobalShortcut({ key: "4" }, setRoleHotkey("BOTTOM"));
  useGlobalShortcut({ key: "5" }, setRoleHotkey("UTILITY"));

  useGlobalShortcut({ key: "r" }, () => {
    if (isTypingTarget()) return;
    reset();
  });

  useEscape(closePalette, paletteOpen);
}
