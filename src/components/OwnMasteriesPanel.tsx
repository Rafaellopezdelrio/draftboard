import { useTranslation } from "react-i18next";
import type { ChampionDb } from "../types/champion";
import type { ChampionMasteryDto } from "../services/riotApi";
import type { ChampionPersonalStat } from "../services/matchRepo";
import { Panel } from "./ui/Panel";
import { Star } from "lucide-react";

interface Props {
  db: ChampionDb;
  masteries: ChampionMasteryDto[];
  personalStats: ChampionPersonalStat[];
}

export function OwnMasteriesPanel({ db, masteries, personalStats }: Props) {
  const { t } = useTranslation();
  if (masteries.length === 0) return null;

  const wrById = new Map(personalStats.map((p) => [p.championId, p]));

  return (
    <Panel
      padding="sm"
      collapsible
      defaultOpen={false}
      storageKey="masteries"
      icon={<Star className="w-3 h-3" />}
      title={t("masteries.title")}
      summary={String(masteries.length)}
    >
      <div className="space-y-1">
        {masteries.slice(0, 5).map((m, idx) => {
          const c = db.champions[String(m.championId)];
          if (!c) return null;
          const ps = wrById.get(m.championId);
          const wr = ps && ps.games >= 3 ? ps.winRate * 100 : null;
          const isTopMain = idx === 0 && m.championLevel >= 7;
          return (
            <div
              key={m.championId}
              className="flex items-center gap-2 p-1.5 rounded ring-1 ring-border-subtle bg-bg-card/60 hover:bg-bg-card transition"
            >
              <div className="relative">
                <img
                  src={c.iconUrl}
                  alt={c.name}
                  className={`w-8 h-8 rounded ${
                    isTopMain ? "ring-2 ring-accent/60" : "ring-1 ring-border-subtle"
                  }`}
                />
                <span
                  className={`absolute -top-1 -right-1 text-[9px] font-bold leading-none px-1 py-0.5 rounded ${
                    m.championLevel >= 10
                      ? "bg-accent text-black"
                      : m.championLevel >= 7
                        ? "bg-bg-elev text-accent ring-1 ring-accent/60"
                        : "bg-bg-elev text-white/60 ring-1 ring-border-subtle"
                  }`}
                >
                  M{m.championLevel}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white truncate font-medium">
                  {c.name}
                </p>
                <p className="text-[10px] text-white/50 tabular-nums">
                  {Math.round(m.championPoints / 1000)}k pts
                </p>
              </div>
              {wr !== null && (
                <span
                  className={`text-xs font-bold tabular-nums ${
                    wr >= 55 ? "text-good" : wr >= 45 ? "text-meh" : "text-bad"
                  }`}
                >
                  {wr.toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
