// Single row of the op.gg build path — label, item icons, optional
// tier badge, winrate/pickrate.
//
// Extracted from BuildPanel.tsx so changes to row presentation don't
// touch the parent file. Pure presentational — no state, no fetches.

import { useTranslation } from "react-i18next";
import type { OpggBuildPath } from "../../services/opggBuilds";
import { tierFromWinRate } from "../../engine/buildClassifier";
import { TierBadge } from "../ui/TierBadge";
import { ItemIcon } from "./icons";

interface Props {
  /** Short label rendered on the left (e.g. "Inicio", "Core 3"). */
  label: string;
  /** op.gg path payload (item ids + sample size). */
  path: OpggBuildPath;
  /** Active patch string for icon URLs. */
  patch: string;
  /** Highlight the row visually (used for the Core 3). */
  highlight?: boolean;
}

export function BuildRow({ label, path, patch, highlight = false }: Props) {
  const { t } = useTranslation();
  // Filter to valid item IDs only. Aggregation sometimes emits 0 or
  // sub-1000 IDs (consumables, removed items) that don't render.
  const validIds = Array.from(new Set(path.ids)).filter((id) => id > 0);
  if (validIds.length === 0) return null;
  const winRate = path.play > 0 ? path.win / path.play : 0;
  const wrColor =
    winRate >= 0.52 ? "text-good" : winRate >= 0.49 ? "text-white/65" : "text-bad/80";
  // Per-row tier badge — only when sample is decent (>=200 games) so
  // we don't slap "S+" on a 12-game noise variant.
  const rowTier = path.play >= 200 ? tierFromWinRate(winRate) : null;
  return (
    <div
      className={`flex items-center gap-2 ${
        highlight ? "p-1.5 rounded bg-accent/10 ring-1 ring-accent/30" : ""
      }`}
      title={`${t("build.games", { count: path.play })} · ${t("build.pickRate", { pct: (path.pickRate * 100).toFixed(1) })}`}
    >
      <span className="text-[10px] uppercase tracking-wider text-white/45 w-12 shrink-0">
        {label}
      </span>
      <div className="flex gap-1 flex-1">
        {validIds.map((id, i) => (
          <ItemIcon key={i} patch={patch} id={id} />
        ))}
      </div>
      {rowTier && (
        <span className="shrink-0">
          <TierBadge tier={rowTier} size="sm" />
        </span>
      )}
      <div className="flex flex-col items-end shrink-0 leading-tight">
        <span className={`text-[11px] tabular-nums font-semibold ${wrColor}`}>
          {(winRate * 100).toFixed(0)}% WR
        </span>
        <span className="text-[9px] tabular-nums text-white/30">
          {(path.pickRate * 100).toFixed(0)}% PR
        </span>
      </div>
    </div>
  );
}
