import { getPowerSpikes, powerSpikeBars } from "../data/powerSpikes";
import { Panel } from "./ui/Panel";

interface Props {
  championId: string | undefined;
}

export function PowerSpikesBars({ championId }: Props) {
  const profile = getPowerSpikes(championId);
  if (!profile) return null;
  const bars = powerSpikeBars(profile);
  return (
    <Panel
      padding="sm"
      collapsible
      defaultOpen={false}
      storageKey="powerSpikes"
      title="Power spikes"
      summary={profile.summary}
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
              key={b.label}
              className="flex-1 flex flex-col items-center justify-end gap-1"
              title={b.tooltip}
            >
              <div
                className={`${color} w-full rounded-t transition-all`}
                style={{ height: `${h}%` }}
              />
              <span className="text-[10px] text-white/50">{b.label}</span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-white/70">{profile.summary}</p>
      </div>
    </Panel>
  );
}
