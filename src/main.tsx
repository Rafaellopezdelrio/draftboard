import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { OverlayApp } from "./OverlayApp";
import { isOverlayWindow } from "./services/overlay";
import { ToastProvider } from "./components/ui/ToastContainer";
import { initSentry, SentryErrorBoundary } from "./services/sentry";
import { installLogBridge } from "./services/logger";
import { OverlayErrorScreen } from "./components/OverlayErrorScreen";
import { initI18n } from "./i18n";

// Bootstrap i18n before any render so first paint uses the right locale.
// We read the persisted UI locale synchronously from localStorage when
// possible (prefs DB loads async — too late for the first render). The
// fallback "es" matches DEFAULT_PREFS.uiLocale.
function bootInitialLocale(): "es" | "en" {
  try {
    const raw = localStorage.getItem("lol-draft-prefs");
    if (raw) {
      const parsed = JSON.parse(raw) as { uiLocale?: "es" | "en" };
      if (parsed.uiLocale === "es" || parsed.uiLocale === "en") {
        return parsed.uiLocale;
      }
    }
  } catch {
    // localStorage unavailable or corrupt — start with default.
  }
  return "es";
}
// Fire-and-forget — initI18n loads the locale bundle async. React will
// render before it resolves (using key strings as fallback), then
// re-render once translations land. Acceptable visual flash for a
// fraction of a second on first paint.
void initI18n(bootInitialLocale());

// Consume the emergency-reset marker BEFORE anything else reads
// localStorage. If the user launched with `--reset`, the Rust side
// dropped a marker file + deleted the SQLite DB; we mirror by wiping
// localStorage here so the next reload boots from true defaults.
// Synchronous-best-effort: we fire the IPC call but don't await — the
// React tree mounts immediately. If the IPC ever resolves true, we
// then wipe + reload.
if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
  import("@tauri-apps/api/core").then(({ invoke }) => {
    invoke<boolean>("consume_reset_marker")
      .then((shouldReset) => {
        if (shouldReset) {
          try {
            localStorage.clear();
          } catch {
            /* ignore */
          }
          window.location.reload();
        }
      })
      .catch(() => {
        /* command may not exist in older builds — non-fatal */
      });
  });
}

// Initialize error tracking BEFORE any rendering so crashes during mount
// are captured too. Telemetry can be opted out by the user — we cache
// the previous-session choice in localStorage so the boot path stays
// sync (SQLite hydration is async and would miss early crashes).
function bootTelemetryDecision(): boolean {
  try {
    const raw = localStorage.getItem("draftboard:telemetry");
    if (raw === "false") return false;
  } catch {
    // localStorage unavailable (e.g. file://, Tauri restrictive WebView2)
    // — fall through to default-enabled.
  }
  return true;
}
initSentry({ enabled: bootTelemetryDecision() });
installLogBridge();

// The "overlay" Tauri window loads index.html with ?overlay=1. Same React
// bundle, different root component. Keeps build pipeline simple (one
// dist) and lets both windows share hooks / services.
const Root = isOverlayWindow() ? OverlayApp : App;

// Overlay window MUST have a transparent body / html / #root or the
// Tauri transparent: true setting is hidden by App.css which paints a
// radial-gradient on those three selectors. Inline styles win over
// stylesheet rules, so we set all three.
if (isOverlayWindow()) {
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
  const root = document.getElementById("root");
  if (root) root.style.background = "transparent";
}

// Suppress the WebView2 default context menu ("Reload", "Inspect", "Back",
// etc) on right-click. In dev mode Tauri leaves it on for the F12 flow;
// in release Tauri auto-disables it. We always disable for the overlay
// (a context menu over the game looks broken) and disable for the main
// app too — we expose our own command palette via Ctrl+K, no right-click
// menu needed.
window.addEventListener("contextmenu", (e) => {
  // Allow context menu only on inputs/textareas where copy/paste matters.
  const target = e.target as HTMLElement | null;
  const tag = target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  e.preventDefault();
});

// Block common dev shortcuts in the overlay (F5 reload, F12 devtools,
// Ctrl+R, Ctrl+Shift+I). The main app keeps them for development.
if (isOverlayWindow()) {
  window.addEventListener("keydown", (e) => {
    if (e.key === "F5" || e.key === "F12") {
      e.preventDefault();
      return;
    }
    if (e.ctrlKey && (e.key === "r" || e.key === "R")) {
      e.preventDefault();
      return;
    }
    if (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "i")) {
      e.preventDefault();
    }
  });
}

// Per-window crash fallback. ErrorScreen is full-bleed and covers the
// entire viewport — fine for the main app, but inside the transparent
// 350×400 overlay window it would render a giant ugly card over the
// game. OverlayErrorScreen is a thin pill that stays out of the way
// and offers a single "reintentar" click.
const FallbackComponent = isOverlayWindow() ? OverlayErrorScreen : ErrorScreen;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SentryErrorBoundary
      fallback={({ error, resetError }) => (
        <FallbackComponent error={error} reset={resetError} />
      )}
    >
      <ToastProvider>
        <Root />
      </ToastProvider>
    </SentryErrorBoundary>
  </React.StrictMode>
);

function ErrorScreen({ error, reset }: { error: unknown; reset: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  // Lazy require so the bundle splits — ErrorScreen renders rarely and
  // the feedback modal pulls in a chunk we don't want on every boot.
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  const [FeedbackComp, setFeedbackComp] =
    React.useState<React.ComponentType<{ contextTag?: string; prefill?: string; onClose: () => void }> | null>(null);
  // Lazy-load the clipboard hook for the same reason — it's tiny but
  // we want zero overhead on the happy path.
  const [clipboardHook, setClipboardHook] = React.useState<{
    useClipboardCopy: typeof import("./hooks/useClipboardCopy").useClipboardCopy;
    formatErrorForClipboard: typeof import("./hooks/useClipboardCopy").formatErrorForClipboard;
  } | null>(null);
  React.useEffect(() => {
    if (feedbackOpen && !FeedbackComp) {
      import("./components/FeedbackModal").then((m) => setFeedbackComp(() => m.FeedbackModal));
    }
  }, [feedbackOpen, FeedbackComp]);
  React.useEffect(() => {
    import("./hooks/useClipboardCopy").then((m) => setClipboardHook(m));
  }, []);

  return (
    <main className="h-full flex items-center justify-center p-8">
      <div className="max-w-lg bg-bg-card border border-bad/40 rounded-lg p-6 space-y-3">
        <h1 className="text-xl font-bold text-bad">Algo se rompió</h1>
        <p className="text-sm text-white/70">
          La app encontró un error inesperado. El reporte se ha enviado
          automáticamente (sin datos personales) para que lo arreglemos.
          Si puedes describir qué hacías cuando pasó, nos ayuda muchísimo.
        </p>
        <details className="text-xs text-white/45">
          <summary className="cursor-pointer hover:text-white/70">
            Detalles técnicos
          </summary>
          <pre className="mt-2 p-2 bg-bg rounded text-[10px] overflow-auto max-h-40">
            {msg}
          </pre>
          {clipboardHook && (
            <CopyErrorButton
              error={error}
              useClipboardCopy={clipboardHook.useClipboardCopy}
              formatErrorForClipboard={clipboardHook.formatErrorForClipboard}
            />
          )}
        </details>
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="flex-1 px-4 py-2 bg-accent text-black font-medium rounded hover:bg-accent-deep transition"
          >
            Reintentar
          </button>
          <button
            onClick={() => setFeedbackOpen(true)}
            className="flex-1 px-4 py-2 bg-bg-elev border border-border-subtle text-white/85 rounded hover:bg-bg-card transition text-sm"
          >
            Contarnos qué pasó
          </button>
        </div>
      </div>
      {feedbackOpen && FeedbackComp && (
        <FeedbackComp
          contextTag="error-boundary"
          prefill={`Crash detectado:\n${msg}\n\nDescribe qué estabas haciendo:\n`}
          onClose={() => setFeedbackOpen(false)}
        />
      )}
    </main>
  );
}

/** Small button rendered inside ErrorScreen's <details> block. Lifted
 * to its own component so the hook can mount only after the clipboard
 * chunk loads (the parent's lazy-import path). Shows ✓ for ~2s after a
 * successful copy. */
function CopyErrorButton({
  error,
  useClipboardCopy,
  formatErrorForClipboard,
}: {
  error: unknown;
  useClipboardCopy: typeof import("./hooks/useClipboardCopy").useClipboardCopy;
  formatErrorForClipboard: typeof import("./hooks/useClipboardCopy").formatErrorForClipboard;
}) {
  const { copy, copied } = useClipboardCopy();
  return (
    <button
      type="button"
      onClick={() => copy(formatErrorForClipboard(error))}
      className="mt-2 text-[11px] text-white/55 hover:text-white underline underline-offset-2"
      aria-label="Copiar detalles del error al portapapeles"
    >
      {copied ? "✓ Copiado" : "Copiar error al portapapeles"}
    </button>
  );
}
