// Suggestions, bug reports, automatic error reports and the opt-in usage
// counter. Everything goes to our own worker (/report, /usage → Cloudflare
// D1); nothing goes to third parties. The worker stores no IP.
//
// Usage counter: only when the user said yes (prefs.telemetryEnabled,
// mirrored to localStorage by useTelemetryConsent). The install id is a
// random UUID made on this PC, never linked to the Riot account, and it is
// deleted when the user says no.

import { WORKER_BASE_URL } from "../config";

export type ReportKind = "suggestion" | "bug" | "error";

const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0-dev";
const CONSENT_KEY = "draftboard:telemetry";
const INSTALL_ID_KEY = "draftboard:install-id";

async function post(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${WORKER_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/** Send a report. Throws when it did not arrive, so the UI can say so. */
export function sendReport(kind: ReportKind, message: string, details?: string): Promise<void> {
  return post("/report", { kind, message, version: APP_VERSION, details });
}

/** Version + Windows build, attached when the user ticks "datos técnicos". */
export function technicalDetails(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const os = /Windows NT [\d.]+/.exec(ua)?.[0] ?? "unknown OS";
  return `Draftboard ${APP_VERSION} · ${os}`;
}

function hasConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "true";
  } catch {
    return false;
  }
}

function installId(): string | null {
  try {
    let id = localStorage.getItem(INSTALL_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(INSTALL_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/** Forget the install id (the user said no to the counter). */
export function forgetInstallId(): void {
  try {
    localStorage.removeItem(INSTALL_ID_KEY);
  } catch {
    /* nothing stored */
  }
}

const countedThisSession = new Set<string>();

/** Count "this install used `view` today". No-op without consent; each view
 * is sent once per session; failures are ignored (it is only a counter). */
export function trackUsage(view: string): void {
  if (!hasConsent() || countedThisSession.has(view)) return;
  const id = installId();
  if (!id) return;
  countedThisSession.add(view);
  post("/usage", { id, version: APP_VERSION, view }).catch(() => {});
}

/** Count that a feature ran (or failed) today, on the same opt-in counter as
 * the screens, prefixed "f-" so the report lists them apart: champ select
 * seen, natural voice used, AI answered, tier list fell back... Only fixed
 * names: never a champion, a Riot ID or anything typed by the player. */
export function trackFeature(name: string): void {
  trackUsage(`f-${name}`);
}

/** A new install: sent once, when the player accepts the terms for the
 * first time (updates keep the acceptance, so they never send it). Only the
 * version; no id. Not sent from the DEV build. Failures are ignored. */
export function reportInstall(): void {
  if (import.meta.env.DEV) return;
  post("/install", { version: APP_VERSION }).catch(() => {});
}

export function __testOnly_resetUsage(): void {
  countedThisSession.clear();
}
