// Persistent app version footer. Lives at the bottom of the main layout
// so the user always knows what build they're running without opening
// About. Clicking the version pill opens the changelog for that exact
// version — quick "what's new in this build" path.
//
// Also surfaces a tiny health pill (left of disclaimer) so the user can
// glance at the network/backend state without opening Diagnostics.
// Click → opens Diagnostics for the full breakdown.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHealthStatus, type HealthLevel } from "../hooks/useHealthStatus";

interface Props {
  onShowChangelog?: () => void;
  onShowDiagnostics?: () => void;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function AppFooter({ onShowChangelog, onShowDiagnostics }: Props) {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string>(
    typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"
  );
  const health = useHealthStatus();

  useEffect(() => {
    if (!isTauri()) return;
    // Prefer the Tauri-reported version (matches the running binary —
    // build-time __APP_VERSION__ can drift if the binary was patched
    // outside the Vite build).
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setVersion)
      .catch(() => {
        /* Fallback to compile-time constant */
      });
  }, []);

  return (
    <footer
      className="mt-4 pt-3 border-t border-border-subtle/50 flex items-center justify-between text-[10px] text-white/35"
      role="contentinfo"
    >
      <div className="flex items-center gap-2">
        <button
          onClick={onShowChangelog}
          className="font-mono tabular-nums hover:text-white/70 transition px-1.5 py-0.5 rounded"
          title={t("footer.versionTitle")}
        >
          Draftboard v{version}
        </button>
        <HealthPill
          level={health.level}
          label={health.label}
          detail={health.detail}
          onClick={onShowDiagnostics}
        />
      </div>
      <span className="text-white/30">{t("footer.disclaimer")}</span>
    </footer>
  );
}

/** Tiny status indicator: colored dot + label. Click opens Diagnostics.
 * Tooltip carries the detail so the user can hover to know WHY we're
 * degraded without leaving the screen. */
function HealthPill({
  level,
  label,
  detail,
  onClick,
}: {
  level: HealthLevel;
  label: string;
  detail: string;
  onClick?: () => void;
}) {
  // Tailwind doesn't let us interpolate dynamic class names safely (the
  // JIT might not see them) — explicit map keeps the styles in the
  // compiled output and keeps each branch readable.
  const dotClass =
    level === "ok"
      ? "bg-good"
      : level === "degraded"
      ? "bg-meh"
      : "bg-bad";
  const ringClass =
    level === "ok"
      ? "ring-good/30"
      : level === "degraded"
      ? "ring-meh/30"
      : "ring-bad/30";
  return (
    <button
      onClick={onClick}
      title={detail}
      aria-label={`Estado: ${label}. ${detail}`}
      className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded ring-1 ${ringClass} hover:bg-white/5 transition`}
    >
      <span
        aria-hidden="true"
        className={`w-1.5 h-1.5 rounded-full ${dotClass}`}
      />
      <span className="uppercase tracking-wider">{label}</span>
    </button>
  );
}
