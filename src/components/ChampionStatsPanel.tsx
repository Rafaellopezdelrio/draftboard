// Aggregate stats panel for a single champion. Renders above the
// match-list in HistoryView when the user has filtered down to one
// specific champion — gives them a quick "how am I doing on Yasuo
// overall?" answer without scrolling through every individual game.
//
// Pure computation from the already-filtered MatchRow array — no
// extra DB query, no async, no loading state.

import type { MatchRow } from "../services/matchRepo";
import type { ChampionDb } from "../types/champion";
import { Trophy, Target, Zap, Calendar } from "lucide-react";
import { StatCard } from "./ui/StatCard";
import { SparkLine } from "./ui/SparkLine";

interface Props {
  /** Filtered match array (oldest order doesn't matter — we compute
   * aggregates + reverse for the SparkLine). */
  matches: MatchRow[];
  /** Champion to display. We render its name + icon up top. */
  championId: number;
  db: ChampionDb;
}

/** Show the panel when the user has filtered to a single champion in
 * HistoryView. Renders compact stat cards + a winrate trend line. */
export function ChampionStatsPanel({ matches, championId, db }: Props) {
  if (matches.length === 0) return null;
  const champ = db.champions[String(championId)];
  if (!champ) return null;

  const wins = matches.filter((m) => m.win).length;
  const winrate = (wins / matches.length) * 100;
  const avgKda =
    matches.reduce(
      (acc, m) => acc + (m.kills + m.assists) / Math.max(1, m.deaths),
      0
    ) / matches.length;
  const avgCs =
    matches.reduce((acc, m) => acc + m.cs / (m.durationSec / 60), 0) /
    matches.length;
  const lastPlayed = matches[0]?.gameEndTimestampMs;

  // Rolling winrate window — same approach as TrendsView SparkLine.
  const chrono = [...matches].reverse();
  const windowSize = Math.max(3, Math.min(7, Math.floor(chrono.length / 3)));
  const winrateSeries: number[] = [];
  for (let i = windowSize - 1; i < chrono.length; i++) {
    const slice = chrono.slice(i - windowSize + 1, i + 1);
    const w = slice.filter((m) => m.win).length;
    winrateSeries.push((w / slice.length) * 100);
  }

  return (
    <div className="bg-bg-card/60 border border-border-subtle rounded-lg p-3 mb-2">
      <div className="flex items-center gap-3 mb-3">
        <img
          src={champ.iconUrl}
          alt={champ.name}
          className="w-10 h-10 rounded ring-1 ring-accent/50"
        />
        <div>
          <p className="text-sm font-semibold text-white">{champ.name}</p>
          <p className="text-[10px] text-white/45">
            {matches.length} partidas con los filtros actuales
          </p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <StatCard
          value={matches.length}
          label="Partidas"
        />
        <StatCard
          value={`${winrate.toFixed(0)}%`}
          label="Winrate"
          color={winrate >= 55 ? "good" : winrate >= 45 ? "default" : "bad"}
        />
        <StatCard value={avgKda.toFixed(2)} label="KDA medio" />
        <StatCard value={avgCs.toFixed(1)} label="CS/min" />
      </div>
      {winrateSeries.length >= 2 && (
        <div className="mt-3 flex items-center gap-3">
          <div className="text-[10px] uppercase tracking-wide text-white/45 shrink-0">
            Winrate trend ({windowSize}-game window)
          </div>
          <SparkLine
            data={winrateSeries}
            baseline={50}
            color={winrate >= 50 ? "#94d09b" : "#d09b94"}
            width={200}
            height={28}
            ariaLabel={`Tendencia de winrate con ${champ.name}`}
          />
        </div>
      )}
      {lastPlayed && (
        <p className="text-[10px] text-white/40 mt-2 flex items-center gap-1">
          <Calendar className="w-3 h-3" aria-hidden="true" />
          Última partida: {new Date(lastPlayed).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

// Re-export icons used by parent for layout consistency (unused by
// this component directly, but other callers in the future will want
// these alongside StatCard).
export { Trophy, Target, Zap };
