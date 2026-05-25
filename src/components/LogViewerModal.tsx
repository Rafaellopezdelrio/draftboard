// In-app log viewer — reads the rolling app log file (the one
// tauri-plugin-log writes to disk) and shows the latest ~50 lines. Lets
// users hand us actual log context when reporting bugs without making
// them dig into AppData with File Explorer (which on Windows hides the
// folder by default and on macOS is even worse).
//
// Read is best-effort: when the log file doesn't exist yet (first
// launch, plugin hadn't flushed) we show a friendly empty state.

import { useEffect, useRef, useState } from "react";
import { Copy, FileText, RefreshCw, X } from "lucide-react";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import { useToast } from "./ui/ToastContainer";
import { useFocusTrap } from "../hooks/useFocusTrap";

const TAIL_LINES = 200;

interface Props {
  onClose: () => void;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function LogViewerModal({ onClose }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { push: toast } = useToast();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, true);
  useEscape(onClose);

  async function loadLog() {
    if (!isTauri()) {
      setError("Solo disponible en la app de escritorio");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { appLogDir } = await import("@tauri-apps/api/path");
      const { readTextFile, exists } = await import("@tauri-apps/plugin-fs");
      const dir = await appLogDir();
      // tauri-plugin-log default filename = `${appName}.log` rotating
      // within the dir. We pick the newest .log via a listing scan; the
      // common-case file is named "draftboard.log" per our plugin config.
      const candidates = ["draftboard.log", "Draftboard.log"];
      let content = "";
      for (const fname of candidates) {
        const full = `${dir}/${fname}`.replace(/\\/g, "/");
        if (await exists(full)) {
          content = await readTextFile(full);
          break;
        }
      }
      if (!content) {
        setLines([]);
        return;
      }
      // Tail last N lines. Reading the whole file is fine — plugin caps
      // each rotation at 5MB, so even worst case fits in memory comfortably.
      const all = content.split(/\r?\n/);
      setLines(all.slice(-TAIL_LINES));
    } catch (e) {
      setError(String(e).slice(0, 200));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLog();
  }, []);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast({ type: "success", title: "Logs copiados", detail: `${lines.length} líneas en portapapeles` });
    } catch {
      toast({ type: "error", title: "No pude copiar" });
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="logviewer-title"
      className="fixed inset-0 z-[80] bg-black/75 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="bg-bg-card border border-border-strong rounded-lg w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent" />
            <h2 id="logviewer-title" className="text-lg font-semibold text-white">
              Logs · últimas {TAIL_LINES} líneas
            </h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={copyAll}
              disabled={lines.length === 0}
              className="text-xs px-2 py-1 bg-bg-elev rounded border border-border-subtle hover:border-accent text-white/80 flex items-center gap-1 disabled:opacity-40"
            >
              <Copy className="w-3 h-3" />
              Copiar
            </button>
            <button
              onClick={loadLog}
              className="text-xs px-2 py-1 bg-bg-elev rounded border border-border-subtle hover:border-accent text-white/80 flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Refrescar
            </button>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="text-white/40 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-3 font-mono text-[10px] leading-snug text-white/80 bg-bg">
          {loading ? (
            <p className="text-white/40 italic">Cargando...</p>
          ) : error ? (
            <p className="text-bad">{error}</p>
          ) : lines.length === 0 ? (
            <p className="text-white/40 italic">
              Aún no hay logs (primera ejecución o plugin no inicializado).
            </p>
          ) : (
            <pre className="whitespace-pre-wrap break-words">
              {lines.join("\n")}
            </pre>
          )}
        </div>

        <footer className="p-3 border-t border-border-subtle text-[10px] text-white/40">
          Los logs viven en {"%APPDATA%\\com.draftboard.app\\logs\\"}. Rotación
          5MB, retención 7 días.
        </footer>
      </div>
    </div>
  );
}
