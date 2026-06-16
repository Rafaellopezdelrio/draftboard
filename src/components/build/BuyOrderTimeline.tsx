// Buy order timeline — horizontal compact flow of build progression.
// X-axis = expected purchase order, each cell = 1 item slot. Times
// are heuristic (Riot doesn't expose purchase timings per item path)
// but anchored to typical SoloQ progression: starter at 0min, boots
// ~5-7min, core 3 by ~25min, full build by 35min+.

import { useTranslation } from "react-i18next";
import type { OpggBuildPath } from "../../services/opggBuilds";

interface Props {
  starter: OpggBuildPath | null;
  boots: OpggBuildPath | null;
  core: OpggBuildPath | null;
  fourth: OpggBuildPath | null;
  fifth: OpggBuildPath | null;
  sixth: OpggBuildPath | null;
  patch: string;
}

export function BuyOrderTimeline({
  starter,
  boots,
  core,
  fourth,
  fifth,
  sixth,
  patch,
}: Props) {
  const { t } = useTranslation();
  const phases: Array<{
    label: string;
    time: string;
    ids: number[];
    emphasis: boolean;
  }> = [];
  if (starter) phases.push({ label: t("build.pathStarter"), time: "0:00", ids: starter.ids, emphasis: false });
  if (boots) phases.push({ label: t("build.pathBoots"), time: "~6:00", ids: boots.ids, emphasis: false });
  if (core) phases.push({ label: t("build.pathCore3"), time: "~22:00", ids: core.ids, emphasis: true });
  if (fourth) phases.push({ label: t("build.buyOrder.fourth"), time: "~28:00", ids: fourth.ids, emphasis: false });
  if (fifth) phases.push({ label: t("build.buyOrder.fifth"), time: "~35:00", ids: fifth.ids, emphasis: false });
  if (sixth) phases.push({ label: t("build.buyOrder.sixth"), time: "~40:00+", ids: sixth.ids, emphasis: false });
  if (phases.length === 0) return null;

  return (
    <div className="border-t border-white/5 pt-2">
      <p className="text-[10px] uppercase tracking-widest text-white/45 mb-1.5">
        {t("build.buyOrder.heading")}
      </p>
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {phases.map((p, i) => {
          const ids = Array.from(new Set(p.ids)).filter((id) => id > 0);
          if (ids.length === 0) return null;
          return (
            <div
              key={i}
              className={`flex flex-col items-center gap-0.5 shrink-0 ${p.emphasis ? "ring-1 ring-accent/40 rounded p-1 bg-accent/5" : ""}`}
              title={t("build.buyOrder.approx", { label: p.label, time: p.time })}
            >
              <span className="text-[9px] uppercase tracking-wider text-white/45">
                {p.time}
              </span>
              <div className="flex gap-0.5">
                {ids.slice(0, 3).map((id, j) => (
                  <img
                    key={j}
                    src={`https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${id}.png`}
                    alt=""
                    className="w-6 h-6 rounded border border-border-subtle"
                    onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                  />
                ))}
              </div>
              <span
                className={`text-[9px] uppercase tracking-wider ${p.emphasis ? "text-accent font-semibold" : "text-white/45"}`}
              >
                {p.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
