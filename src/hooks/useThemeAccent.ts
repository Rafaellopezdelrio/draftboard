// Applies the user's accent-theme preference to the root <html>
// element as `data-accent="mint|sapphire|amber|rose"`. CSS in
// App.css overrides --color-accent based on this attribute, so every
// accent-coloured element re-styles automatically without explicit
// React state plumbing.
//
// Extracted from App.tsx as part of the monolith-split effort —
// keeps the shell file focused on layout + composition instead of
// theme glue.

import { useEffect } from "react";
import { usePrefsStore } from "../state/prefsStore";

/**
 * Mirror `prefs.accentTheme` onto `<html data-accent>` so the CSS
 * variable overrides take effect immediately. SSR-safe (no-op when
 * `document` is undefined).
 */
export function useThemeAccent(): void {
  const accentTheme = usePrefsStore((s) => s.prefs.accentTheme);
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.accent = accentTheme ?? "mint";
  }, [accentTheme]);
}
