// User feedback modal — when something breaks the user can leave a note
// that goes straight to Sentry as a message event with the latest
// breadcrumb trail attached. The user-supplied description gives us
// context that stack traces alone can't ("I clicked X and the panel
// turned blank").
//
// Hooked into two places:
//   - About modal → "Reportar problema" button (manual entry)
//   - SentryErrorBoundary fallback → auto-open after a crash so the user
//     can describe what they were doing
//
// Respects the telemetry pref — when off, we don't actually send. The
// user is told upfront in the modal so they're not surprised.

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, X, AlertCircle } from "lucide-react";
import { captureMessage } from "../services/sentry";
import { useToast } from "./ui/ToastContainer";
import { usePrefsStore } from "../state/prefsStore";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface Props {
  /** Optional context the calling site wants Sentry to receive alongside
   * the user's note — e.g. "after-crash" with the error message. */
  contextTag?: string;
  /** Auto-fill the textarea with a hint. Lets the crash-recovery flow
   * say "Tell us what you were doing when the app crashed". */
  prefill?: string;
  onClose: () => void;
}

export function FeedbackModal({ contextTag, prefill, onClose }: Props) {
  const { t } = useTranslation();
  const [body, setBody] = useState(prefill ?? "");
  const [busy, setBusy] = useState(false);
  const telemetryEnabled = usePrefsStore((s) => s.prefs.telemetryEnabled);
  const { push: toast } = useToast();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, true);

  const submit = async () => {
    if (!body.trim()) return;
    if (!telemetryEnabled) {
      toast({
        type: "warn",
        title: t("feedback.telemetryOffTitle"),
        detail: t("feedback.telemetryOffDetail"),
      });
      return;
    }
    setBusy(true);
    try {
      captureMessage(`[user-feedback${contextTag ? `:${contextTag}` : ""}] ${body.trim()}`, {
        level: "info",
        tags: contextTag ? { feedback_tag: contextTag } : undefined,
      });
      toast({
        type: "success",
        title: t("feedback.sentTitle"),
        detail: t("feedback.sentDetail"),
      });
      onClose();
    } catch (e) {
      toast({
        type: "error",
        title: t("feedback.failTitle"),
        detail: String(e).slice(0, 200),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-title"
      className="fixed inset-0 z-[85] bg-black/75 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="bg-bg-card border border-border-strong rounded-lg w-full max-w-md p-6 space-y-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-2">
          <MessageSquare className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 id="feedback-title" className="text-lg font-semibold text-white">
              {t("feedback.title")}
            </h2>
            <p className="text-xs text-white/55 mt-0.5">{t("feedback.subtitle")}</p>
          </div>
          <button onClick={onClose} aria-label={t("common.close")} className="text-white/40 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </header>

        {!telemetryEnabled && (
          <div className="flex items-start gap-2 p-2 bg-meh/15 border border-meh/40 rounded text-[11px] text-meh">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{t("feedback.telemetryOffInline")}</span>
          </div>
        )}

        <textarea
          autoFocus
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("feedback.placeholder")}
          rows={5}
          className="w-full bg-bg-elev border border-border-subtle rounded p-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-accent"
        />

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 bg-bg-elev border border-border-subtle text-white/80 rounded hover:bg-bg-card text-sm"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={busy || !body.trim() || !telemetryEnabled}
            className="flex-1 px-3 py-2 bg-accent text-black font-medium rounded hover:bg-accent-deep transition disabled:opacity-40 text-sm"
          >
            {busy ? t("feedback.sending") : t("feedback.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
