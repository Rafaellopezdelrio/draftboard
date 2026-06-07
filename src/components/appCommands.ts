// Command-palette entries (Ctrl+K) for the main app shell. Extracted from
// App.tsx: it's a static config list, not layout, so it lives next to
// CommandPalette and stays unit-testable (unique ids, real labels, actions
// that hit the right setter). A plain builder — no React hooks — so callers
// pass the modal setters and get back the Command[].

import { setOverlayVisible, setOverlayPosition } from "../services/overlay";
import type { Command } from "./CommandPalette";

/** The modal-open setters the palette toggles. Each opens a view/overlay.
 *  Typed as `(open: boolean) => void` — compatible with useState setters. */
export interface AppCommandSetters {
  setShowTierList: (open: boolean) => void;
  setShowLookup: (open: boolean) => void;
  setShowProPlayers: (open: boolean) => void;
  setShowCoach: (open: boolean) => void;
  setShowLessonPlan: (open: boolean) => void;
  setShowLiveGame: (open: boolean) => void;
  setShowChat: (open: boolean) => void;
  setShowTrends: (open: boolean) => void;
  setShowHistory: (open: boolean) => void;
  setShowPrefs: (open: boolean) => void;
  setShowDiag: (open: boolean) => void;
  setShowPrivacy: (open: boolean) => void;
  setShowSettings: (open: boolean) => void;
  setShowAbout: (open: boolean) => void;
  setShowShortcuts: (open: boolean) => void;
}

/** Translator function — pass i18next's `t` (or an identity stub in tests). */
export type CmdT = (key: string) => string;

export function buildAppCommands(s: AppCommandSetters, t: CmdT): Command[] {
  return [
    { id: "tier", label: t("commands.tier"), action: () => s.setShowTierList(true) },
    { id: "lookup", label: t("commands.lookup"), action: () => s.setShowLookup(true) },
    { id: "pro", label: t("commands.pro"), action: () => s.setShowProPlayers(true) },
    { id: "coach", label: t("commands.coach"), action: () => s.setShowCoach(true) },
    { id: "lesson", label: t("commands.lesson"), action: () => s.setShowLessonPlan(true) },
    { id: "live", label: t("commands.live"), action: () => s.setShowLiveGame(true) },
    { id: "chat", label: t("commands.chat"), action: () => s.setShowChat(true) },
    { id: "trends", label: t("commands.trends"), action: () => s.setShowTrends(true) },
    { id: "history", label: t("commands.history"), action: () => s.setShowHistory(true) },
    { id: "prefs", label: t("commands.prefs"), action: () => s.setShowPrefs(true) },
    { id: "diag", label: t("commands.diag"), action: () => s.setShowDiag(true) },
    { id: "privacy", label: t("commands.privacy"), action: () => s.setShowPrivacy(true) },
    { id: "settings", label: t("commands.settings"), action: () => s.setShowSettings(true) },
    // Diagnostic: force the overlay window visible regardless of in-game
    // detection. Tells apart "overlay never opened" (Tauri config bug) from
    // "overlay open but hidden under fullscreen-exclusive game" (LoL
    // window-mode issue — user needs Borderless).
    {
      id: "overlay-force",
      label: `🔍 ${t("commands.overlayForce")}`,
      action: async () => {
        // Center-ish position so it can't be off-screen on multi-monitor
        // setups with weird DPI scaling.
        await setOverlayPosition(200, 200);
        await setOverlayVisible(true);
      },
    },
    {
      id: "overlay-hide",
      label: t("commands.overlayHide"),
      action: () => setOverlayVisible(false),
    },
    { id: "about", label: `ℹ️ ${t("commands.about")}`, action: () => s.setShowAbout(true) },
    { id: "shortcuts", label: `⌨️ ${t("commands.shortcuts")}`, action: () => s.setShowShortcuts(true) },
    {
      id: "center-window",
      label: `🪟 ${t("commands.centerWindow")}`,
      action: async () => {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("center_main_window");
        } catch {
          /* command may not exist outside Tauri */
        }
      },
    },
  ];
}
