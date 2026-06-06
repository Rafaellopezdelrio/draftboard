// Toast banner shown when the user loses connectivity OR our backend
// worker becomes unreachable. Honest UX — tells the user "you're seeing
// cached data" instead of silently serving stale numbers.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, WifiOff } from "lucide-react";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { UI_FEEDBACK_MS } from "../config";
import type { TFunction } from "i18next";

function relativeTime(ms: number | null, t: TFunction): string {
  if (!ms) return t("net.never");
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return t("net.agoSec", { n: sec });
  const min = Math.floor(sec / 60);
  if (min < 60) return t("net.agoMin", { n: min });
  const hr = Math.floor(min / 60);
  return t("net.agoHr", { n: hr });
}

export function NetworkStatusBanner() {
  const { t } = useTranslation();
  const { ok, online, workerReachable, lastOkAt, retry } = useNetworkStatus();
  const [retrying, setRetrying] = useState(false);
  if (ok) return null;

  const reason = !online
    ? t("net.offline")
    : !workerReachable
      ? t("net.backendDown")
      : t("net.limited");

  const detail = !online
    ? t("net.offlineDetail")
    : t("net.staleDetail");

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retry();
    } finally {
      // Keep the spinning state visible briefly so the user sees we tried.
      setTimeout(() => setRetrying(false), UI_FEEDBACK_MS.retrySpinnerMin);
    }
  };

  return (
    <div className="bg-meh/15 border border-meh/40 rounded-lg px-3 py-2 flex items-center gap-3">
      <WifiOff className="w-4 h-4 text-meh shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-meh">{reason}</p>
        <p className="text-[10px] text-white/65 leading-snug">
          {detail}
          {lastOkAt && (
            <span className="text-white/40">
              {" "}· {t("net.lastConnection", { time: relativeTime(lastOkAt, t) })}
            </span>
          )}
        </p>
      </div>
      <button
        onClick={handleRetry}
        disabled={retrying}
        className="text-[10px] uppercase tracking-widest font-semibold text-meh hover:text-white px-2 py-1 rounded ring-1 ring-meh/40 hover:ring-white/40 transition flex items-center gap-1 disabled:opacity-50"
      >
        <RefreshCw className={`w-3 h-3 ${retrying ? "animate-spin" : ""}`} />
        {retrying ? "..." : t("common.retry")}
      </button>
    </div>
  );
}
