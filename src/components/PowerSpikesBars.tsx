import { useTranslation } from "react-i18next";
import { getPowerSpikes, powerSpikeBars } from "../data/powerSpikes";
import { Panel } from "./ui/Panel";

interface Props {
  championId: string | undefined;
}

export function PowerSpikesBars({ championId }: Props) {
  const { t } = useTranslation();
  const profile = getPowerSpikes(championId);
  if (!profile) return null;
  const bars = powerSpikeBars(profile);
  return (
    <Panel
      padding="sm"
      collapsible
      defaultOpen={false}
      storageKey="powerSpikes"
      title={t("build.powerSpikes")}
      summary={t(profile.summaryKey)}
    >
      <div className="space-y-1.5">
      <div className="flex items-end gap-1 h-12">
        {bars.map((b) => {
          const h = b.value * 10;
          const color =
            b.value >= 8
              ? "bg-good"
              : b.value >= 6
                ? "bg-meh"
                : "bg-bad/70";
          return (
            <div
              key={b.labelKey}
              className="flex-1 flex flex-col items-center justify-end gap-1"
              title={t(b.tooltipKey)}
            >
              <div
                className={`${color} w-full rounded-t transition-all`}
                style={{ height: `${h}%` }}
              />
              <span className="text-[10px] text-white/50">{t(b.labelKey)}</span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-white/70">{t(profile.summaryKey)}</p>
      </div>
    </Panel>
  );
}
