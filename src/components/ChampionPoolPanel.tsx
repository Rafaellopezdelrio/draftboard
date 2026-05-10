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
    <div className="space-y-2">
      <h3 className="text-sm uppercase tracking-wide text-white/50">
        Tu pool
      </h3>
      <div className="space-y-1">
        {insights.map((ins, i) => {
          const c = db.champions[String(ins.championId)];
          if (!c) return null;
          const colors = {
            good: "border-good/40 bg-good/10",
            warn: "border-meh/40 bg-meh/10",
            bad: "border-bad/40 bg-bad/10",
            info: "border-border-subtle bg-bg-card",
          };
          return (
            <div
              key={i}
              className={`flex items-center gap-2 p-2 rounded border text-xs ${colors[ins.severity]}`}
            >
              <img src={c.iconUrl} alt={c.name} className="w-7 h-7 rounded" />
              <div className="flex-1">
                <p className="text-white font-medium">{c.name}</p>
                <p className="text-white/70">{ins.message}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
