// Centralised constants and runtime config. Single source of truth for
// URLs, polling intervals, thresholds, and feature flags. If you find
// yourself hardcoding a value in two files, move it here.
//
// Rules:
//   - Anything user-visible OR network-bound lives here
//   - Anything tunable for performance/UX lives here
//   - Test thresholds live in test files (not here) — those are
//     intentionally separate so production constants aren't tuned to
//     pass tests.

/** Versioning for the Terms-and-Privacy acceptance. Bump when wording
 * changes materially (new data sources, new permissions, new disclaimers).
 * The `TermsGate` compares this to the stored acceptance and re-prompts
 * when they don't match — GDPR best practice. */
export const TERMS_VERSION = 1;

/** Backend endpoints. All Riot API + scrape proxies route through the
 * Cloudflare Worker so we never need to ship Riot API keys. */
export const WORKER_BASE_URL =
  "https://draftboard-riot-proxy.rafael-lopez-serrano-99.workers.dev";

export const WORKER_HEALTH_URL = `${WORKER_BASE_URL}/health`;
export const WORKER_UPDATER_URL = `${WORKER_BASE_URL}/updater/latest.json`;

/** Polling cadences. Lower = more responsive, higher CPU + cache churn. */
export const POLL_INTERVALS_MS = {
  /** Live Client API (localhost:2999). 2s matches what Mobalytics/Blitz use. */
  liveGame: 2_000,
  /** Slow poll when LoL isn't running — saves CPU at idle. */
  liveGameSlow: 10_000,
  /** Re-assert HWND_TOPMOST on the overlay window. */
  overlayTopmost: 1_000,
  /** Anchor the overlay to LoL window position. */
  overlayFollowLol: 1_000,
  /** LoL window mode detection (windowed/borderless/fullscreen-exclusive). */
  loLWindowMode: 5_000,
  /** Worker /health probe for offline detection. */
  workerHealth: 60_000,
} as const;

/** Network probe timeouts (single request). Aggressive on health checks
 * because the worker is geo-edge — anything >2s means something's off. */
export const NETWORK_TIMEOUTS_MS = {
  healthProbe: 4_000,
  diagnostic: 5_000,
  liveClient: 4_000,
  lcuRequest: 5_000,
} as const;

/** Transient UI feedback durations. Centralised so the whole app feels
 * consistent (don't have one component flash for 1s and another for 3s
 * for the same kind of "action confirmed" feedback). */
export const UI_FEEDBACK_MS = {
  /** "Copied to clipboard" / "Applied" / "Saved" ✓ flash on a button. */
  appliedFlash: 1_500,
  /** Copy-to-clipboard ✓ icon on long-form copy buttons (Diagnostics,
   * error reports). Slightly longer because users need time to verify. */
  clipboardCopy: 2_000,
  /** Network status banner "Reintentar" spinner minimum visible duration.
   * Prevents a flash-of-spinner on instant retry success. */
  retrySpinnerMin: 500,
} as const;

/** Boot-time gates. Hard timeouts so a hung dependency can never block
 * the user from seeing the app. */
export const BOOT_TIMEOUTS_MS = {
  /** prefsStore.load() max wait before falling back to defaults. */
  prefsLoad: 3_000,
  /** Recovery toast probe delay (wait for prefs load to settle). */
  recoveryProbeDelay: 1_500,
} as const;
