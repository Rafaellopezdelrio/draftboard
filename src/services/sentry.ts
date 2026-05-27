// Sentry error tracking — auto-reports crashes from testers without
// requiring them to manually copy/paste stack traces.
//
// DSN is hardcoded because it's not secret (it's a write-only public ID).
// Anyone who decompiles the binary can find it but can't read events.
//
// User creates a free Sentry project at https://sentry.io and pastes the
// DSN into VITE_SENTRY_DSN env var. If empty, Sentry is silently disabled
// (zero overhead for dev or self-hosted builds).

import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
/** Read at build time from package.json via Vite's define injection. The
 * value is the version of the binary the user is actually running, so
 * Sentry can group errors by release in its dashboard. Falls back to a
 * literal when the define isn't injected (dev / vitest). */
const APP_VERSION =
  (typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0-dev");

let initialized = false;

interface InitOptions {
  /** When false, Sentry isn't initialised at all (legal opt-out / GDPR).
   * Default: true. Wire this from `prefs.telemetryEnabled` at call site. */
  enabled?: boolean;
}

export function initSentry(opts: InitOptions = {}): void {
  if (initialized) return;
  if (opts.enabled === false) {
    // eslint-disable-next-line no-console
    console.info("[sentry] telemetry opt-out — error reporting disabled");
    return;
  }
  if (!DSN) {
    // eslint-disable-next-line no-console
    console.info("[sentry] no DSN configured — error reporting disabled");
    return;
  }
  Sentry.init({
    dsn: DSN,
    release: `draftboard@${APP_VERSION}`,
    environment: import.meta.env.MODE, // "development" or "production"
    // Tracing & session replay disabled by default — they cost quota and
    // we want minimal data exfiltration. Enable per-deploy if needed.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Strip personal identifiers before sending + apply custom
    // fingerprinting so the same logical bug doesn't fan out into 5
    // dashboard issues just because the stack frame differs slightly
    // (different champion key in error message, different filename
    // hash from Vite chunks, etc).
    beforeSend(event) {
      // ─── 0. Drop Vite HMR partial-reload noise ───
      // When dev server hot-reloads App.tsx after a hook is added/renamed,
      // React Refresh re-runs the component BEFORE the new module is in
      // scope → transient ReferenceError. Stack frames contain
      // `/@react-refresh` and `performReactRefresh`. Pure dev artifact;
      // never reaches prod users. Drop silently.
      try {
        const frames = event.exception?.values?.[0]?.stacktrace?.frames ?? [];
        const isHmrNoise = frames.some(
          (f) =>
            (f.filename && f.filename.includes("@react-refresh")) ||
            (f.function && f.function.includes("performReactRefresh"))
        );
        if (isHmrNoise) return null;
      } catch {
        // never let filter logic block real errors
      }

      // ─── 1. Group identical errors together (custom fingerprint) ───
      // Sentry's default fingerprint includes the exception message +
      // top stack frame, which over-splits issues like "TypeError:
      // cannot read x of undefined" landing in 10 components. We
      // collapse them by error TYPE + first non-vendor frame file.
      try {
        const ex = event.exception?.values?.[0];
        if (ex && (ex.type || ex.value)) {
          const topFrame = ex.stacktrace?.frames
            ?.slice()
            .reverse()
            .find(
              (f) =>
                f.filename &&
                !f.filename.includes("node_modules") &&
                !f.filename.includes("/vendor/")
            );
          const fileLabel = topFrame?.filename
            ?.replace(/\\/g, "/")
            .split("/")
            .pop()
            ?.replace(/\.[a-f0-9]{6,}\.js$/, ".js") ?? "unknown";
          const errType = ex.type ?? "Error";
          // Normalise the message: strip champion-specific tokens that
          // would over-split otherwise (e.g. "Aatrox not found",
          // "Yasuo not found" → "{champion} not found").
          const msg = (ex.value ?? "")
            .replace(/\b[A-Z][a-z]+[A-Z]?[a-z]*\b/g, "{Name}")
            .replace(/\b\d+\b/g, "{n}")
            .slice(0, 80);
          event.fingerprint = [errType, fileLabel, msg];
        }
      } catch {
        // fingerprint compute failed — let Sentry's default group apply
      }

      // ─── 2. PII scrubbing — never ship identifying data ───
      // Don't ship Riot IDs, API keys, file paths with username
      if (event.request?.url) {
        event.request.url = event.request.url.replace(/RGAPI-[\w-]+/g, "RGAPI-***");
      }
      if (event.user) {
        // Replace identifying user info with anonymous hash
        event.user = {
          id: event.user.id ? hashId(String(event.user.id)) : undefined,
        };
      }
      // Strip Windows username from paths in stack frames
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.stacktrace?.frames) {
            for (const f of ex.stacktrace.frames) {
              if (f.filename) {
                f.filename = f.filename.replace(/\\Users\\[^\\]+\\/g, "\\Users\\***\\");
              }
            }
          }
        }
      }
      return event;
    },
    // Common ignored errors — browser noise that doesn't matter
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "Non-Error promise rejection captured",
      "Network request failed", // user offline
    ],
  });
  initialized = true;
  // eslint-disable-next-line no-console
  console.info("[sentry] initialized — release draftboard@" + APP_VERSION);
}

/** Allow shutdown so the user can flip off telemetry from Settings
 * without restarting the app. */
export function shutdownSentry(): Promise<boolean> {
  if (!initialized) return Promise.resolve(true);
  initialized = false;
  return Sentry.close(2000);
}

/** Attach an anonymous user identifier to subsequent events. Helps group
 * crashes "this user keeps hitting the same bug" without ever knowing
 * who they are. The raw PUUID never leaves the device — we send only
 * its short hash. Safe to call repeatedly; latest hash wins. */
export function setSentryAnonUser(puuid: string | null | undefined): void {
  if (!initialized) return;
  if (!puuid) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: hashId(puuid) });
}

/** Attach app-level tags so dashboard issues can be filtered by patch,
 * region, locale, in-game state. Call when these change (boot, prefs
 * load, LCU connect/disconnect, game start/end). Tags are global +
 * cheap — they ride along with every subsequent event automatically. */
export function setSentryGlobalTags(tags: {
  patch?: string | null;
  region?: string | null;
  locale?: string | null;
  inGame?: boolean;
  lcuConnected?: boolean;
}): void {
  if (!initialized) return;
  try {
    Sentry.getCurrentScope().setTags(
      Object.fromEntries(
        Object.entries(tags).filter(([, v]) => v !== undefined && v !== null)
      ) as Record<string, string | number | boolean>
    );
  } catch {
    // Defence: never let telemetry plumbing break the app.
  }
}

/** Anonymous hash of a string — used so we can correlate sessions without
 * storing the raw identifier. */
function hashId(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return "anon-" + Math.abs(h).toString(36);
}

export const SentryErrorBoundary = Sentry.ErrorBoundary;
export const captureException = Sentry.captureException;
export const captureMessage = Sentry.captureMessage;
export const addBreadcrumb = Sentry.addBreadcrumb;
export { setSentryGlobalTags as setSentryTags };
