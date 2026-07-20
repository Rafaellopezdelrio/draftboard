// Reusable confirmation modal for destructive actions. The native browser
// `confirm()` won't show in a Tauri window in all configurations, and
// it doesn't match our dark theme — so we ship our own.
//
// Used by:
//   - Preferences → "Restablecer todo" (wipe all prefs)
//   - History → "Borrar partidas" (wipe SQLite rows)
//   - Privacy → "Exportar y borrar mis datos"
// Add new callers as destructive flows appear.

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, X } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";

interface Props {
  title: string;
  message: string;
  /** Verb on the confirm button — "Borrar", "Restablecer", "Eliminar". */
  confirmLabel: string;
  /** Set true when the action is permanent / irreversible (red styling). */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  destructive = true,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Trap focus inside the dialog so Tab can't escape to elements behind
  // it (would let user trigger a destructive action elsewhere by mistake).
  useFocusTrap(dialogRef, true);

  // Keyboard: Esc cancels globally; Enter activates whichever button has
  // focus (native <button> behavior — no global Enter override). A global
  // Enter→confirm listener used to fire the DESTRUCTIVE action even after
  // the user had Tab'd to Cancel. Initial focus goes to CANCEL so a stray
  // Enter is always the safe choice; Tab reaches Confirm deliberately.
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/75 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="bg-bg-card border border-border-strong rounded-lg w-full max-w-sm p-5 space-y-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          {destructive && (
            <AlertTriangle className="w-5 h-5 text-bad shrink-0 mt-0.5" />
          )}
          <h2
            id="confirm-title"
            className={`text-base font-semibold flex-1 ${destructive ? "text-bad" : "text-white"}`}
          >
            {title}
          </h2>
          <button
            onClick={onCancel}
            aria-label={t("common.cancel")}
            className="text-white/40 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p id="confirm-message" className="text-sm text-white/75 leading-relaxed">
          {message}
        </p>
        <div className="flex gap-2 pt-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="flex-1 px-3 py-2 bg-bg-elev border border-border-subtle text-white/80 rounded hover:bg-bg-card text-sm"
          >
            {t("common.cancel")}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`flex-1 px-3 py-2 font-medium rounded text-sm ${
              destructive
                ? "bg-bad text-white hover:bg-bad/90"
                : "bg-accent text-black hover:bg-accent-deep"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
