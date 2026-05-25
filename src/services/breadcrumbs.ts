// Lightweight breadcrumb helpers — track user actions and key state
// transitions so when Sentry captures a crash, the report shows the
// last ~20 things that happened. Critical for diagnosing "user clicked
// this then crashed" vs "background fetch timed out".
//
// We re-export Sentry's addBreadcrumb so callers don't import @sentry/react
// directly. The wrappers add consistent category names + payloads so
// the Sentry UI groups events cleanly.

import { addBreadcrumb as sentryAddBreadcrumb } from "./sentry";

type Category =
  | "ui.click"
  | "draft.pick"
  | "draft.ban"
  | "draft.role"
  | "lcu.event"
  | "live-game"
  | "overlay"
  | "navigation"
  | "fetch"
  | "config";

type Level = "info" | "warning" | "error";

/** Drop a structured breadcrumb. Last ~100 are sent with the next event. */
export function trackEvent(
  category: Category,
  message: string,
  data?: Record<string, unknown>,
  level: Level = "info"
): void {
  try {
    sentryAddBreadcrumb({
      category,
      message,
      data,
      level,
      timestamp: Date.now() / 1000,
    });
  } catch {
    // Sentry not initialised (telemetry opt-out) — no-op.
  }
}

/** Common shortcut for "user clicked X". Standardises the verb. */
export function trackClick(label: string, data?: Record<string, unknown>): void {
  trackEvent("ui.click", label, data);
}

/** A fetch finished. Useful when a downstream crash happens after a slow
 * or failed network call — the breadcrumb tells us what was loading. */
export function trackFetch(
  url: string,
  status: "ok" | "fail",
  detail?: string
): void {
  trackEvent(
    "fetch",
    `${status.toUpperCase()} ${url.replace(/^https?:\/\//, "")}`,
    { detail },
    status === "ok" ? "info" : "warning"
  );
}
