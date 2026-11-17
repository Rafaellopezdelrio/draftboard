// "Sugerencia / Error" box. The user picks the type, writes a note and can
// attach technical data (app version + Windows build). It goes to our own
// worker (services/reports.ts). Sending is the user's own explicit action,
// so it does not depend on the automatic-reports setting. If it does not
// arrive, the user is told and the note stays in the box.
//
// Opened from the header button, the About modal and the crash screen
// (main.tsx, contextTag "error-boundary").

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, X } from "lucide-react";
import { sendReport, technicalDetails, type ReportKind } from "../services/reports";
import { useToast } from "./ui/ToastContainer";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface Props {
  /** Where it was opened from; a crash opens it as a bug report. */
  contextTag?: string;
  /** Auto-fill the textarea (the crash screen puts the error here). */
  prefill?: string;
  onClose: () => void;
}

export function FeedbackModal({ contextTag, prefill, onClose }: Props) {
  const { t } = useTranslation();
  const [body, setBody] = useState(prefill ?? "");
  const [kind, setKind] = useState<Extract<ReportKind, "suggestion" | "bug">>(
    contextTag === "error-boundary" ? "bug" : "suggestion"
  );
  const [attach, setAttach] = useState(true);
  const [busy, setBusy] = useState(false);
  const { push: toast } = useToast();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, true);

  const submit = async () => {
    const note = body.trim();
    if (!note) return;
    setBusy(true);
    try {
      const details = [attach ? technicalDetails() : "", contextTag ? `from: ${contextTag}` : ""]
        .filter(Boolean)
        .join(" · ");
      await sendReport(kind, note, details || undefined);
      toast({ type: "success", title: t("feedback.sentTitle"), detail: t("feedback.sentDetail") });
      onClose();
    } catch (e) {
      toast({
        type: "error",
        title: t("feedback.failTitle"),
        detail: `${t("feedback.failDetail")} (${String(e).slice(0, 120)})`,
      });
    } finally {
      setBusy(false);
    }
  };

  const kindBtn = (k: "suggestion" | "bug") =>
    `flex-1 px-3 py-1.5 rounded text-sm border transition ${
      kind === k
        ? "bg-accent/15 border-accent text-accent"
        : "bg-bg-elev border-border-subtle text-white/70 hover:text-white"
    }`;

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

        <div className="flex gap-2" role="radiogroup" aria-label={t("feedback.kindLabel")}>
          <button type="button" role="radio" aria-checked={kind === "suggestion"} onClick={() => setKind("suggestion")} className={kindBtn("suggestion")}>
            {t("feedback.kindSuggestion")}
          </button>
          <button type="button" role="radio" aria-checked={kind === "bug"} onClick={() => setKind("bug")} className={kindBtn("bug")}>
            {t("feedback.kindBug")}
          </button>
        </div>

        <textarea
          autoFocus
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t(kind === "bug" ? "feedback.placeholder" : "feedback.placeholderSuggestion")}
          rows={5}
          maxLength={2000}
          className="w-full bg-bg-elev border border-border-subtle rounded p-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-accent"
        />

        <label className="flex items-start gap-2 text-xs text-white/65 cursor-pointer">
          <input
            type="checkbox"
            checked={attach}
            onChange={(e) => setAttach(e.target.checked)}
            className="mt-0.5 w-3.5 h-3.5 accent-accent"
          />
          <span>{t("feedback.attachLabel")}</span>
        </label>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 bg-bg-elev border border-border-subtle text-white/80 rounded hover:bg-bg-card text-sm"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={busy || !body.trim()}
            className="flex-1 px-3 py-2 bg-accent text-black font-medium rounded hover:bg-accent-deep transition disabled:opacity-40 text-sm"
          >
            {busy ? t("feedback.sending") : t("feedback.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
