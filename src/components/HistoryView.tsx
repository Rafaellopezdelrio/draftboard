import { useEffect, useState } from "react";
import { recentMatches, type MatchRow } from "../services/matchRepo";
import type { ChampionDb } from "../types/champion";
import { queueLabel } from "../data/queueNames";

interface Props {
  db: ChampionDb;
  onClose: () => void;
}

export function HistoryView({ db, onClose }: Props) {
  const [matches, setMatches] = useState<MatchRow[]>([]);

  useEffect(() => {
    recentMatches(50).then(setMatches);
  }, []);

  const wins = matches.filter((m) => m.win).length;
  const winRate = matches.length > 0 ? (wins / matches.length) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="animate-[scaleIn_180ms_ease-out] bg-bg-elev border border-border-subtle rounded-lg p-4 w-[720px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold text-accent">Historial</h2>
          <p className="text-sm text-white/60">
            {matches.length} partidas · WR{" "}
            <span className={winRate >= 50 ? "text-good" : "text-bad"}>
              {winRate.toFixed(0)}%
            </span>
          </p>
        </div>
        <div className="overflow-y-auto space-y-1">
          {matches.length === 0 && (
            <p className="text-white/50 text-center py-8">
              Sin partidas aún. Configura tu Riot ID en ⚙️.
            </p>
          )}
          {matches.map((m) => {
            const champ = db.champions[String(m.championId)];
            const kda = ((m.kills + m.assists) / Math.max(1, m.deaths)).toFixed(
              1
            );
            return (
              <div
                key={m.matchId}
                className={`flex items-center gap-3 p-2 rounded border ${m.win ? "border-good/40 bg-good/5" : "border-bad/40 bg-bad/5"}`}
              >
                {champ && (
                  <img
                    src={champ.iconUrl}
                    alt={champ.name}
                    className="w-10 h-10 rounded"
                  />
                )}
                <div className="flex-1">
                  <p className="text-sm">{champ?.name ?? `#${m.championId}`}</p>
                  <p className="text-xs text-white/50">
                    {m.position} · {queueLabel(m.queueId)} ·{" "}
                    {Math.round(m.durationSec / 60)}min
                  </p>
                </div>
                <p className="text-sm text-white/80">
                  {m.kills}/{m.deaths}/{m.assists}{" "}
                  <span className="text-white/50">({kda})</span>
                </p>
                <p
                  className={`text-xs font-bold ${m.win ? "text-good" : "text-bad"}`}
                >
                  {m.win ? "VICTORIA" : "DERROTA"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
