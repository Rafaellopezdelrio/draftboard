// Inline error boundary for sidebar/right-rail panels. Unlike ViewBoundary
// which renders a fixed-position modal fallback (suitable for full views),
// this one renders a SMALL inline chip inside the panel slot — so when
// e.g. BuildPanel crashes, the rest of the page keeps working and the
// user sees a friendly "Reintentar" inline instead of a blank app.
//
// Always wrap any panel whose contents come from an external source
// (op.gg, dpm.lol, riot proxy, LCU). One bad payload should never bring
// down the whole app.

import { useCallback } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { SentryErrorBoundary, captureException } from "../services/sentry";

interface Props {
  /** Short identifier tag for Sentry triage (e.g. "BuildPanel"). */
  name: string;
  children: React.ReactNode;
}

export function PanelBoundary({ name, children }: Props) {
  const tag = useCallback(
    (scope: { setTag: (k: string, v: string) => void }) => {
      scope.setTag("panel", name);
    },
    [name]
  );

  return (
    <SentryErrorBoundary
      beforeCapture={tag}
      fallback={({ error, resetError }) => (
        <InlineFallback error={error} name={name} onRetry={resetError} />
      )}
    >
      {children}
    </SentryErrorBoundary>
  );
}

function InlineFallback({
  error,
  name,
  onRetry,
}: {
  error: unknown;
  name: string;
  onRetry: () => void;
}) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Error desconocido";

  // Re-report with panel tag so triage knows which panel crashed.
  // Sentry dedups identical events so this is safe to call on every render.
  try {
    captureException(error, { tags: { panel: name, source: "panel-fallback" } });
  } catch {
    /* never let reporting failure break the fallback */
  }

  return (
    <div
      role="alert"
      className="rounded-md border border-bad/40 bg-bad/5 p-3 text-xs space-y-1.5"
    >
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 text-bad shrink-0" />
        <span className="text-bad font-semibold uppercase tracking-wider text-[10px]">
          {name} crash
        </span>
      </div>
      <p className="text-white/60 break-words leading-tight">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded ring-1 ring-accent/40 bg-accent/10 text-accent hover:bg-accent/20 transition"
      >
        <RotateCw className="w-3 h-3" />
        Reintentar
      </button>
    </div>
  );
}
