// "About Draftboard" — shows app version + a "Check for updates" button
// that hits the same Tauri updater plugin our background banner uses,
// plus a button to open the logs directory for support requests.
//
// Bottom-up basic: every desktop app should let the user answer "what
// version am I running and where do I get help if it breaks?".

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { getVersion } from "@tauri-apps/api/app";
import { openPath } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";
import { X, Download, FileText, Info, MessageSquare, Eye } from "lucide-react";
import { useToast } from "./ui/ToastContainer";
import { FeedbackModal } from "./FeedbackModal";
import { LogViewerModal } from "./LogViewerModal";

interface Props {
  onClose: () => void;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function AboutModal({ onClose }: Props) {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string>("…");
  const [checking, setChecking] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const { push } = useToast();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    if (!isTauri()) {
      setVersion("dev");
      return;
    }
    getVersion()
      .then(setVersion)
      .catch(() => setVersion("unknown"));
  }, []);

  const handleCheck = async () => {
    if (!isTauri()) {
      push({ type: "warn", title: t("about.desktopOnly") });
      return;
    }
    setChecking(true);
    setUpdateStatus(null);
    try {
      const update = await check();
      if (update) {
        push({
          type: "success",
          title: t("about.newVersion", { version: update.version }),
          detail: t("about.installFromBanner"),
        });
      } else {
        push({
          type: "success",
          title: t("about.upToDate"),
          detail: `v${version}`,
        });
      }
    } catch (e) {
      push({
        type: "error",
        title: t("about.checkFailed"),
        detail: (e as Error).message,
      });
    } finally {
      setChecking(false);
    }
  };

  const handleOpenLogs = async () => {
    if (!isTauri()) return;
    try {
      // Resolve the OS-specific app log directory via Tauri's path API
      // and open it in the file browser. On Windows this lands in
      // %LOCALAPPDATA%\com.draftboard.app\logs.
      const { appLogDir } = await import("@tauri-apps/api/path");
      const dir = await appLogDir();
      await openPath(dir);
    } catch (e) {
      setUpdateStatus(t("about.openLogsFailed", { error: (e as Error).message }));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        className="bg-bg-card border border-border-strong rounded-lg w-full max-w-md p-6 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-accent" />
            <h2 id="about-title" className="text-lg font-semibold text-white">
              {t("about.title")}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="text-white/40 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <dl className="space-y-2 text-sm">
          <Row label={t("about.version")} value={version} />
          <Row label={t("about.build")} value="release" />
          <Row label={t("about.platform")} value="Windows / Tauri 2" />
        </dl>

        <div className="space-y-2 pt-2 border-t border-border-subtle">
          <button
            onClick={handleCheck}
            disabled={checking}
            className="w-full px-3 py-2 bg-accent text-black font-medium rounded hover:bg-accent-deep transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {checking ? t("common.loading") : t("about.checkUpdates")}
          </button>
          {updateStatus && (
            <p className="text-xs text-white/70 text-center">{updateStatus}</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setShowLogs(true)}
              className="px-3 py-2 bg-bg-elev border border-border-subtle text-white/80 rounded hover:bg-bg-card transition flex items-center justify-center gap-2 text-sm"
            >
              <Eye className="w-4 h-4" />
              {t("about.viewLogs")}
            </button>
            <button
              onClick={handleOpenLogs}
              className="px-3 py-2 bg-bg-elev border border-border-subtle text-white/80 rounded hover:bg-bg-card transition flex items-center justify-center gap-2 text-sm"
            >
              <FileText className="w-4 h-4" />
              {t("about.openLogs")}
            </button>
          </div>
          <button
            onClick={() => setShowFeedback(true)}
            className="w-full px-3 py-2 bg-bg-elev border border-accent/40 text-accent rounded hover:bg-accent/10 transition flex items-center justify-center gap-2 text-sm"
          >
            <MessageSquare className="w-4 h-4" />
            {t("about.reportIssue")}
          </button>
        </div>

        <p className="text-[10px] text-white/40 text-center pt-2 border-t border-border-subtle space-y-1">
          <span className="block">{t("about.licenseMit")}</span>
          <span className="block">{t("about.notEndorsed")}</span>
          <span className="block">{t("about.supportNote")}</span>
        </p>
      </div>
      {showFeedback && (
        <FeedbackModal contextTag="about" onClose={() => setShowFeedback(false)} />
      )}
      {showLogs && <LogViewerModal onClose={() => setShowLogs(false)} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-white/55">{label}</dt>
      <dd className="text-white font-mono text-xs">{value}</dd>
    </div>
  );
}
