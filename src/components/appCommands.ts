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

export function buildAppCommands(s: AppCommandSetters): Command[] {
  return [
    { id: "tier", label: "Tier List", action: () => s.setShowTierList(true) },
    { id: "lookup", label: "Buscar jugador (Riot ID)", action: () => s.setShowLookup(true) },
    { id: "pro", label: "Pro Players (LCK / LEC / LCS)", action: () => s.setShowProPlayers(true) },
    { id: "coach", label: "Abrir Coach (post-game)", action: () => s.setShowCoach(true) },
    { id: "lesson", label: "Plan de mejora 7 días", action: () => s.setShowLessonPlan(true) },
    { id: "live", label: "Partida en directo (live)", action: () => s.setShowLiveGame(true) },
    { id: "chat", label: "Hablar con AI Coach", action: () => s.setShowChat(true) },
    { id: "trends", label: "Ver tendencias", action: () => s.setShowTrends(true) },
    { id: "history", label: "Historial", action: () => s.setShowHistory(true) },
    { id: "prefs", label: "Preferencias", action: () => s.setShowPrefs(true) },
    { id: "diag", label: "Diagnóstico de conexión", action: () => s.setShowDiag(true) },
    { id: "privacy", label: "Mis datos / privacidad", action: () => s.setShowPrivacy(true) },
    { id: "settings", label: "Configuración Riot", action: () => s.setShowSettings(true) },
    // Diagnostic: force the overlay window visible regardless of in-game
    // detection. Tells apart "overlay never opened" (Tauri config bug) from
    // "overlay open but hidden under fullscreen-exclusive game" (LoL
    // window-mode issue — user needs Borderless).
    {
      id: "overlay-force",
      label: "🔍 Forzar overlay visible (test)",
      action: async () => {
        // Center-ish position so it can't be off-screen on multi-monitor
        // setups with weird DPI scaling.
        await setOverlayPosition(200, 200);
        await setOverlayVisible(true);
      },
    },
    {
      id: "overlay-hide",
      label: "Ocultar overlay",
      action: () => setOverlayVisible(false),
    },
    { id: "about", label: "ℹ️ Acerca de / Versión / Buscar updates", action: () => s.setShowAbout(true) },
    { id: "shortcuts", label: "⌨️ Atajos de teclado (Ctrl+/)", action: () => s.setShowShortcuts(true) },
    {
      id: "center-window",
      label: "🪟 Centrar ventana principal",
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
