// Bridges the telemetryEnabled pref to (a) localStorage for the NEXT
// boot (so Sentry can decide to init synchronously before SQLite
// hydrates) and (b) a mid-session shutdown when the user flips the
// toggle off. Without (b), opting out from Settings would only take
// effect after restart.
//
// Extracted from App.tsx — small effect but pref-side-effect logic
// doesn't belong in the layout shell.

import { useEffect } from "react";

export function useTelemetryConsent(telemetryEnabled: boolean): void {
  useEffect(() => {
    try {
      localStorage.setItem(
        "draftboard:telemetry",
        telemetryEnabled ? "true" : "false"
      );
    } catch {
      // localStorage unavailable (private mode) — next boot defaults on.
    }
    if (!telemetryEnabled) {
      // Shut down running Sentry session immediately so the user's
      // opt-out is honoured before they close the app.
      import("../services/sentry").then(({ shutdownSentry }) => {
        shutdownSentry().catch(() => {});
      });
    }
  }, [telemetryEnabled]);
}
