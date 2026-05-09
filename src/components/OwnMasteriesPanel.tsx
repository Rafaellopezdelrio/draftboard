import type { ChampionDb } from "../types/champion";
import type { ChampionMasteryDto } from "../services/riotApi";
import type { ChampionPersonalStat } from "../services/matchRepo";

interface Props {
  db: ChampionDb;
  masteries: ChampionMasteryDto[];
  personalStats: ChampionPersonalStat[];
}

export function OwnMasteriesPanel({ db, masteries, personalStats }: Props) {
  if (masteries.length === 0) return null;

  const wrById = new Map(personalStats.map((p) => [p.championId, p]));

  return (
    <div className="space-y-2">
      <h3 className="text-sm uppercase tracking-wide text-white/50">
        Tus mejores campeones
      </h3>
      <div className="space-y-1">
        {masteries.slice(0, 5).map((m) => {
          const c = db.champions[String(m.championId)];
          if (!c) return null;
          const ps = wrById.get(m.championId);
          const wr = ps && ps.games >= 3 ? ps.winRate * 100 : null;
          return (
            <div
              key={m.championId}
              className="flex items-center gap-2 p-1 rounded bg-bg-card border border-border-subtle"
            >
              <img src={c.iconUrl} alt={c.name} className="w-7 h-7 rounded" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{c.name}</p>
                <p className="text-xs text-white/50">
                  M{m.championLevel} · {Math.round(m.championPoints / 1000)}k
                </p>
              </div>
              {wr !== null && (
                <span
                  className={`text-xs font-medium ${wr >= 55 ? "text-good" : wr >= 45 ? "text-meh" : "text-bad"}`}
                >
                  {wr.toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
