// Minimal crash fallback for the overlay window.
//
// The main app's ErrorScreen is a full-bleed modal card. Inside the
// transparent 350×400 overlay window it would render a giant ugly box
// over the game UI. This component renders a tiny pill in the top-left
// instead — visible enough to signal "overlay broke" without obscuring
// gameplay, with a one-click retry and an auto-hide after 10s so a
// crash loop doesn't permanently block the user's view.
//
// Inline styles on purpose: we don't trust the app CSS to load when
// React itself just crashed. The pill must work even if Tailwind is
// missing.

import { useEffect, useState } from "react";

interface Props {
  /** The thrown value from React's error boundary. Currently only used
   * for telemetry context (parent already reports to Sentry); we don't
   * surface the raw message in the overlay because it's tiny. */
  error: unknown;
  /** Reset the boundary — re-mounts the overlay tree. */
  reset: () => void;
}

/** Pill stays visible for this long after a crash before auto-hiding.
 * Short enough that a permanent crash doesn't pollute the screen for
 * the rest of the game, long enough that the user notices. */
const AUTO_HIDE_MS = 10_000;

export function OverlayErrorScreen({ reset }: Props) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setHidden(true), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, []);

  if (hidden) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="overlay-error-screen"
      style={{
        position: "fixed",
        top: 6,
        left: 6,
        zIndex: 9999,
        background: "rgba(40,0,0,0.85)",
        color: "white",
        font: "11px/1.3 system-ui, sans-serif",
        padding: "4px 8px",
        borderRadius: 4,
        border: "1px solid rgba(255,80,80,0.4)",
        pointerEvents: "auto",
        display: "flex",
        gap: 6,
        alignItems: "center",
      }}
    >
      <span>Overlay crash</span>
      <button
        onClick={reset}
        style={{
          background: "rgba(255,255,255,0.15)",
          color: "white",
          border: "none",
          padding: "1px 6px",
          borderRadius: 3,
          cursor: "pointer",
          font: "inherit",
        }}
      >
        Reintentar
      </button>
      <button
        onClick={() => setHidden(true)}
        aria-label="Ocultar"
        style={{
          background: "transparent",
          color: "rgba(255,255,255,0.6)",
          border: "none",
          padding: "0 4px",
          cursor: "pointer",
          font: "inherit",
        }}
      >
        ×
      </button>
    </div>
  );
}
