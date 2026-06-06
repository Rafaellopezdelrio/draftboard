// Toast that nags users running LoL in fullscreen-exclusive mode to switch
// to Borderless. The Win32 overlay technique we use (and that every non-
// Overwolf companion app uses) only works in windowed/borderless modes.
//
// Shown once per session, dismissable, persisted via prefsStore so we don't
// annoy users who've explicitly acknowledged the limitation.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, X } from "lucide-react";
import { useLoLWindowMode } from "../hooks/useLoLWindowMode";
import { usePrefsStore } from "../state/prefsStore";

export function OverlayCompatBanner() {
  const { t } = useTranslation();
  const mode = useLoLWindowMode();
  const acknowledged = usePrefsStore((s) => s.prefs.fullscreenWarningAck);
  const setPref = usePrefsStore((s) => s.set);
  const [dismissedThisSession, setDismissedThisSession] = useState(false);

  // Reset session dismissal when mode flips back to compatible — next time
  // they swap to exclusive we want to warn again.
  useEffect(() => {
    if (mode !== "fullscreen-exclusive") setDismissedThisSession(false);
  }, [mode]);

  if (mode !== "fullscreen-exclusive") return null;
  if (acknowledged || dismissedThisSession) return null;

  return (
    <div className="fixed top-4 right-4 z-[80] max-w-sm bg-bad/90 border border-bad/40 rounded-lg p-3 shadow-2xl animate-[scaleIn_180ms_ease-out]">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-bad shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-bad">
            {t("overlayCompat.title")}
          </p>
          <p className="text-xs text-white/75 mt-1 leading-relaxed">
            {t("overlayCompat.bodyPrefix")} <strong>Fullscreen exclusive</strong>
            {t("overlayCompat.bodyMiddle")} <strong>Borderless</strong>{" "}
            {t("overlayCompat.bodySuffix")}
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => {
                setPref("fullscreenWarningAck", true);
              }}
              className="text-[10px] uppercase tracking-widest text-white/60 hover:text-white"
            >
              {t("overlayCompat.dontShow")}
            </button>
            <button
              onClick={() => setDismissedThisSession(true)}
              className="text-[10px] uppercase tracking-widest text-bad/70 hover:text-bad ml-auto"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
        <button
          onClick={() => setDismissedThisSession(true)}
          aria-label={t("common.close")}
          className="text-white/40 hover:text-white/70"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
