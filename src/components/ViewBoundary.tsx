// Per-view error boundary. Wraps a single view (modal/page) so an
// unhandled throw inside it shows a recoverable fallback instead of
// taking down the whole app (the root SentryErrorBoundary would
// otherwise blank the screen).
//
// Behaviour:
//   - Sentry receives the exception with viewName tag for triage.
//   - Fallback offers "Reintentar" (resets the boundary, remounts the
//     children) and optional "Cerrar" (calls onClose so the parent can
//     unmount the view entirely — useful when retry would just crash
//     again with stale state).
//   - Themed to match the app (bg-card + accent), matches the visual
//     language of ErrorScreen so users don't feel the floor disappear.

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, RotateCw, X, Copy, Check } from "lucide-react";
import { SentryErrorBoundary, captureException } from "../services/sentry";
import { useClipboardCopy, formatErrorForClipboard } from "../hooks/useClipboardCopy";

interface Props {
  /** Short identifier for Sentry triage. Use the view name verbatim
   * ("CoachView", "HistoryView"). Shows up as a tag on the issue. */
  viewName: string;
  /** Optional close handler. When provided, fallback shows a "Cerrar"
   * button next to "Reintentar" so the user can escape if retry would
   * loop. Wire this to the same setter that controls the view's
   * conditional mount in the parent. */
  onClose?: () => void;
  children: React.ReactNode;
}

export function ViewBoundary({ viewName, onClose, children }: Props) {
  // Sentry's beforeCapture lets us tag the exception with the view name
  // before the event leaves the client. Tagging beats stack-only triage
  // because lazy-chunk filenames are hashed and don't reveal the view.
  const tag = useCallback(
    (scope: { setTag: (k: string, v: string) => void }) => {
      scope.setTag("view", viewName);
    },
    [viewName]
  );

  return (
    <SentryErrorBoundary
      beforeCapture={tag}
      fallback={({ error, resetError }) => (
        <ViewBoundaryFallback
          error={error}
          viewName={viewName}
          onRetry={resetError}
          onClose={onClose}
        />
      )}
    >
      {children}
    </SentryErrorBoundary>
  );
}

interface FallbackProps {
  error: unknown;
  viewName: string;
  onRetry: () => void;
  onClose?: () => void;
}

function ViewBoundaryFallback({
  error,
  viewName,
  onRetry,
  onClose,
}: FallbackProps) {
  const { t } = useTranslation();
  // Defensive: error is `unknown` from Sentry's typing. Extract message
  // safely so we never crash the crash handler.
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "Error desconocido";

  // Re-report once at render time so we capture even errors that
  // somehow bypass the boundary's auto-capture (defense in depth —
  // Sentry de-dupes identical events).
  const reReport = useCallback(() => {
    try {
      captureException(error, { tags: { view: viewName, source: "fallback" } });
    } catch {
      // Never let reporting failure break the fallback UI.
    }
  }, [error, viewName]);

  // Clipboard support so users on telemetry-off builds can still share
  // crashes (paste into Discord, GitHub issue, our feedback form).
  const { copy, copied } = useClipboardCopy();
  const handleCopy = useCallback(() => {
    copy(formatErrorForClipboard(error, { viewName }));
  }, [copy, error, viewName]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-[70] bg-black/75 flex items-center justify-center p-4"
    >
      <div className="bg-bg-card border border-red-500/30 rounded-lg max-w-md w-full p-6 space-y-4 shadow-2xl">
        <header className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white">
              {t("viewBoundary.title")}
            </h2>
            <p className="text-xs text-white/55 mt-0.5">
              {t("viewBoundary.subtitle", { view: viewName })}
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              aria-label={t("common.close")}
              className="text-white/40 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </header>

        <pre className="text-xs text-white/70 bg-black/40 rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap break-words">
          {message}
        </pre>

        <div className="flex items-center justify-between">
          <p className="text-xs text-white/55 flex-1">
            {t("viewBoundary.description")}
          </p>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={t("errors.copyToClipboard")}
            className="ml-3 shrink-0 text-[11px] text-white/55 hover:text-white flex items-center gap-1 px-2 py-1 rounded border border-white/10 hover:border-white/30"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3" /> {t("errors.copied")}
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" /> {t("viewBoundary.copy")}
              </>
            )}
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              reReport();
              onRetry();
            }}
            className="flex-1 px-4 py-2 bg-accent text-black font-medium rounded hover:bg-accent-deep transition flex items-center justify-center gap-2"
          >
            <RotateCw className="w-4 h-4" />
            {t("common.retry")}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white/10 text-white rounded hover:bg-white/20 transition"
            >
              {t("common.close")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
