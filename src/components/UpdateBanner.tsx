// Update available banner — small, dismissible, lives at the top of the
// app. Shows when our updater says there's a newer version published.
// User can click "Instalar" to download + restart, or "Más tarde" to
// dismiss for the rest of this session.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, X } from "lucide-react";
import { useUpdateCheck, installUpdate } from "../services/appUpdater";

export function UpdateBanner() {
  const { t } = useTranslation();
  const info = useUpdateCheck(true);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState({ downloaded: 0, total: 0 });

  if (!info.available || dismissed) return null;

  const handleInstall = async () => {
    setInstalling(true);
    await installUpdate((downloaded, total) => {
      setProgress({ downloaded, total });
    });
    // After install, the plugin relaunches the app — control rarely
    // returns here. If it does, just keep the banner visible.
    setInstalling(false);
  };

  const pct =
    progress.total > 0
      ? Math.round((progress.downloaded / progress.total) * 100)
      : 0;

  return (
    <div className="bg-gradient-to-r from-accent/15 to-accent/5 ring-1 ring-accent/30 rounded-lg px-3 py-2 flex items-center gap-3">
      <Download className="w-4 h-4 text-accent shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white">
          {t("update.available")} <span className="text-accent">{info.version}</span>
          {info.currentVersion && (
            <span className="text-white/40"> {t("update.current", { version: info.currentVersion })}</span>
          )}
        </p>
        {info.releaseNotes && (
          <p className="text-[10px] text-white/55 truncate" title={info.releaseNotes}>
            {info.releaseNotes}
          </p>
        )}
        {installing && progress.total > 0 && (
          <div className="mt-1 h-[3px] bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
      <button
        onClick={handleInstall}
        disabled={installing}
        className="text-[10px] uppercase tracking-widest font-bold px-3 py-1.5 rounded bg-accent text-black hover:bg-accent/90 transition disabled:opacity-50"
      >
        {installing ? `${pct}%...` : t("update.install")}
      </button>
      <button
        onClick={() => setDismissed(true)}
        disabled={installing}
        className="p-1 rounded text-white/40 hover:text-white/70 hover:bg-white/5 transition"
        aria-label={t("common.close")}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
