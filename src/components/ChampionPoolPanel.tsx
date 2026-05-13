import { useEffect, useState } from "react";
import type { ChampionDb } from "../types/champion";
import type { ChampionMasteryDto } from "../services/riotApi";
import {
  personalStatsByChampion,
  recentMatches,
  type ChampionPersonalStat,
  type MatchRow,
} from "../services/matchRepo";
import {
  analyzeChampionPool,
  type ChampionPoolInsight,
} from "../engine/championPoolEngine";
import { Panel, PanelHeader } from "./ui/Panel";
import { Layers } from "lucide-react";

interface Props {
  db: ChampionDb;
  masteries: ChampionMasteryDto[];
}

export function ChampionPoolPanel({ db, masteries }: Props) {
  const [insights, setInsights] = useState<ChampionPoolInsight[]>([]);

  useEffect(() => {
    (async () => {
      const [matches, stats] = await Promise.all([
        recentMatches(50) as Promise<MatchRow[]>,
        personalStatsByChampion() as Promise<ChampionPersonalStat[]>,
      ]);
      setInsights(
        analyzeChampionPool({ matches, masteries, personalStats: stats })
      );
    })();
  }, [masteries]);

  if (insights.length === 0) return null;

  return (
    <Panel padding="sm">
      <PanelHeader icon={<Layers className="w-3 h-3" />} title="Tu pool" />
      <div className="space-y-1">
        {insights.map((ins, i) => {
          const c = db.champions[String(ins.championId)];
          if (!c) return null;
          const colors = {
            good: "ring-good/30 bg-good/5",
            warn: "ring-meh/30 bg-meh/5",
            bad: "ring-bad/30 bg-bad/5",
            info: "ring-border-subtle bg-bg-card/60",
          };
          return (
            <div
              key={i}
              className={`flex items-center gap-2 p-2 rounded ring-1 text-xs ${colors[ins.severity]}`}
            >
              <img src={c.iconUrl} alt={c.name} className="w-7 h-7 rounded" />
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{c.name}</p>
                <p className="text-white/65 text-[11px] truncate">{ins.message}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
