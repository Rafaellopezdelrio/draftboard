// Bridges the telemetryEnabled pref to (a) localStorage for the NEXT
// boot (so error capture can decide to start synchronously before SQLite
// hydrates), (b) the usage counter ("open" once per session) and (c) a
// mid-session shutdown when the user flips the toggle off. Without (c),
// opting out from Settings would only take effect after restart.
//
// Extracted from App.tsx — small effect but pref-side-effect logic
// doesn't belong in the layout shell.

import { useEffect } from "react";
import { forgetInstallId, trackUsage } from "../services/reports";

export function useTelemetryConsent(telemetryEnabled: boolean, prefsLoaded: boolean): void {
  useEffect(() => {
    // Before prefs load the value is just the default (off): acting on it
    // would wipe the install id on every boot.
    if (!prefsLoaded) return;
    try {
      localStorage.setItem(
        "draftboard:telemetry",
        telemetryEnabled ? "true" : "false"
      );
    } catch {
      // localStorage unavailable (private mode) — next boot stays off.
    }
    if (telemetryEnabled) {
      trackUsage("open");
      // Turned on mid-session: start error capture now, not next boot.
      import("../services/sentry").then(({ initSentry }) => initSentry());
      return;
    }
    // Opt-out: drop the install id and stop error capture right away.
    forgetInstallId();
    import("../services/sentry").then(({ shutdownSentry }) => {
      shutdownSentry().catch(() => {});
    });
  }, [telemetryEnabled, prefsLoaded]);
}
