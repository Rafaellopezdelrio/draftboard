import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initSentry, SentryErrorBoundary } from "./services/sentry";

// Initialize error tracking BEFORE any rendering so crashes during mount
// are captured too.
initSentry();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SentryErrorBoundary
      fallback={({ error, resetError }) => (
        <ErrorScreen error={error} reset={resetError} />
      )}
    >
      <App />
    </SentryErrorBoundary>
  </React.StrictMode>
);

function ErrorScreen({ error, reset }: { error: unknown; reset: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <main className="h-full flex items-center justify-center p-8">
      <div className="max-w-lg bg-bg-card border border-bad/40 rounded-lg p-6 space-y-3">
        <h1 className="text-xl font-bold text-bad">Algo se rompió</h1>
        <p className="text-sm text-white/70">
          La app encontró un error inesperado. El reporte se ha enviado
          automáticamente (sin datos personales) para que lo arreglemos.
        </p>
        <details className="text-xs text-white/45">
          <summary className="cursor-pointer hover:text-white/70">
            Detalles técnicos
          </summary>
          <pre className="mt-2 p-2 bg-bg rounded text-[10px] overflow-auto max-h-40">
            {msg}
          </pre>
        </details>
        <button
          onClick={reset}
          className="w-full px-4 py-2 bg-accent text-black font-medium rounded hover:bg-accent-deep transition"
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}
