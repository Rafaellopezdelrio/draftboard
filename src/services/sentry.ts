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
const APP_VERSION = "0.2.0"; // keep in sync with package.json

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
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
    // Strip personal identifiers before sending
    beforeSend(event) {
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
