// Bridge from React's console.* into Tauri's persistent log file. Errors
// + warnings get a file copy in %APPDATA%/com.draftboard.app/logs/ so
// users can attach them when reporting bugs (About modal → "Abrir
// carpeta de logs").
//
// Doesn't replace Sentry — Sentry catches the bigger picture. This is the
// "tail -f" the user can hand us when their app misbehaves and we need
// raw context.

import { error as tauriError, warn as tauriWarn, info as tauriInfo } from "@tauri-apps/plugin-log";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let installed = false;

/**
 * Patch global console to ALSO write to the Tauri log file. Idempotent —
 * safe to call from multiple entry points. No-op outside Tauri.
 */
export function installLogBridge(): void {
  if (installed || !isTauri()) return;
  installed = true;

  const fmt = (args: unknown[]): string =>
    args
      .map((a) =>
        a instanceof Error ? `${a.message}\n${a.stack ?? ""}` :
        typeof a === "object" ? safeStringify(a) :
        String(a)
      )
      .join(" ");

  const origError = console.error;
  const origWarn = console.warn;
  const origInfo = console.info;

  console.error = (...args: unknown[]) => {
    origError(...args);
    tauriError(fmt(args)).catch(() => {});
  };
  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    tauriWarn(fmt(args)).catch(() => {});
  };
  console.info = (...args: unknown[]) => {
    origInfo(...args);
    tauriInfo(fmt(args)).catch(() => {});
  };

  // Capture uncaught errors and unhandled promise rejections — these are
  // exactly what we want in logs when something breaks silently.
  window.addEventListener("error", (e) => {
    tauriError(`Uncaught: ${e.message}\n${e.error?.stack ?? ""}`).catch(() => {});
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason instanceof Error ? `${e.reason.message}\n${e.reason.stack ?? ""}` : String(e.reason);
    tauriError(`Unhandled rejection: ${reason}`).catch(() => {});
  });
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return "[unserializable]";
  }
}
