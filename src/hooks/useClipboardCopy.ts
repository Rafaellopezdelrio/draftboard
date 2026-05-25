// Tiny clipboard helper with success-flash state. Components that show
// a "Copy" button get `{copy, copied}` — `copied` flips true on success
// and auto-resets after a delay so the UI can show a ✓ for ~2s.
//
// Failure modes handled:
//   - navigator.clipboard missing (older browsers, file:// in Tauri
//     without HTTPS context) → falls back to a hidden <textarea> +
//     document.execCommand("copy"). Still works on every WebView2.
//   - User denied clipboard permission → swallows the error and leaves
//     `copied` false so the UI shows the unchanged label.
//
// Why a hook (not a util fn): the success flash needs state. Keeping
// the timer cleanup tied to component unmount avoids leaks across HMR.

import { useCallback, useEffect, useRef, useState } from "react";

interface UseClipboardCopyResult {
  /** Copy a string. Returns true on success, false on failure. */
  copy: (text: string) => Promise<boolean>;
  /** True for `resetMs` ms after a successful copy. UI flag for ✓ icon. */
  copied: boolean;
}

export function useClipboardCopy(resetMs = 2000): UseClipboardCopyResult {
  const [copied, setCopied] = useState(false);
  // Track the active timer so successive copies reset cleanly without
  // stacking — and so unmount can cancel a pending reset.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      let ok = false;
      // Modern path: navigator.clipboard.writeText. Requires a secure
      // context (HTTPS or localhost). Tauri's WebView2 is treated as
      // secure for app:// origins.
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          ok = true;
        } catch {
          // Permission denied or transient failure — fall through.
        }
      }
      // Legacy fallback for environments that lack the API. We create
      // a transient textarea, select its contents, and copy via the
      // deprecated execCommand. Removed immediately so we leave no DOM.
      if (!ok && typeof document !== "undefined") {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          ok = document.execCommand("copy");
          document.body.removeChild(ta);
        } catch {
          ok = false;
        }
      }
      if (ok) {
        setCopied(true);
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setCopied(false);
          timerRef.current = null;
        }, resetMs);
      }
      return ok;
    },
    [resetMs]
  );

  return { copy, copied };
}

/** Format an error + context into a paste-friendly blob. Used by
 * ErrorScreen and ViewBoundary so the user can share a crash report
 * outside of Sentry (when telemetry is off, or to file a GitHub issue).
 *
 * Includes: short header, app version, UTC timestamp, error message,
 * stack trace (if available). Stays under ~4KB so clipboard targets
 * don't truncate. */
export function formatErrorForClipboard(
  error: unknown,
  context: { viewName?: string } = {}
): string {
  const version =
    typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0-dev";
  const ts = new Date().toISOString();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && error.stack ? error.stack : "(no stack)";
  const header = context.viewName
    ? `Draftboard crash report — ${context.viewName}`
    : "Draftboard crash report";
  // Cap the stack so a runaway trace doesn't blow past clipboard
  // limits or PR-issue body limits. ~3KB leaves room for the header
  // metadata and the message itself.
  const cappedStack = stack.slice(0, 3000);
  return [
    header,
    `version: ${version}`,
    `when:    ${ts}`,
    "",
    `error:   ${message}`,
    "",
    "stack:",
    cappedStack,
  ].join("\n");
}
