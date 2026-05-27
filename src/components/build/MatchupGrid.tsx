// Matchup grid for the BuildPanel. Fetches op.gg's scraped matchup
// list for the active (champion, role) tuple and renders two columns:
//   - "Ganas vs": top N matchups where we have winrate ≥ 50%.
//   - "Pierdes vs": worst N matchups, ascending winrate.
//
// Each entry carries a threat-tier badge (S/A/B/C) derived from the
// winrate delta vs 50% so the user can scan severity at a glance.
//
// Expandable: shows top 4 per side by default, toggles to top 20 on
// "Ver todos". 20 is a hard cap so the rarest 50-game-sample matchups
// don't bloat the panel.
//
// Extracted from BuildPanel.tsx as part of the file-split effort —
// keeps the parent file focused on the build-path render rather than
// owning every sub-section.

import { useEffect, useState } from "react";
import type { Role } from "../../types/champion";
import { fetchOpggMatchups, type OpggMatchup } from "../../services/opggMatchups";

interface Props {
  /** DDragon-style champion id (e.g. "LeeSin"). */
  championDdId: string;
  /** Role we want matchups for — op.gg keys by role. */
  role: Role;
}

export function MatchupGrid({ championDdId, role }: Props) {
  const [matchups, setMatchups] = useState<OpggMatchup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMatchups([]);
    fetchOpggMatchups(championDdId, role).then((m) => {
      if (cancelled) return;
      setMatchups(m);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [championDdId, role]);

  if (loading) {
    return (
      <div className="border-t border-white/5 pt-2">
        <div className="flex items-center gap-2 py-1">
          <div className="w-1.5 h-1.5 rounded-full bg-accent/70 animate-pulse" />
          <p className="text-[10px] text-white/40">Cargando matchups…</p>
        </div>
      </div>
    );
  }
  if (matchups.length === 0) return null;

  // Sample threshold: 50 games is the lowest count where op.gg's
  // winrate isn't noise (binomial CI tightens enough). Below that the
  // 1-2% movement on either side is meaningless.
  const significant = matchups.filter((m) => m.play >= 50);
  const sortedByWr = [...significant].sort((a, b) => b.winRate - a.winRate);
  const wins = sortedByWr.filter((m) => m.winRate >= 50);
  const losses = [...sortedByWr].filter((m) => m.winRate < 50).reverse();
  const limit = expanded ? 20 : 4;
  const youBeat = wins.slice(0, limit);
  const youLose = losses.slice(0, limit);
  const totalAvailable = wins.length + losses.length;
  const isExpandable = totalAvailable > 8;

  return (
    <div className="border-t border-white/5 pt-2 space-y-1.5">
      <div className="grid grid-cols-2 gap-3">
        <MatchupColumn title="Ganas vs" color="text-good" entries={youBeat} />
        <MatchupColumn title="Pierdes vs" color="text-bad" entries={youLose} />
      </div>
      {isExpandable && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-[10px] uppercase tracking-wider px-2 py-1 rounded ring-1 ring-border-subtle bg-bg-card/40 text-white/55 hover:text-accent hover:ring-accent/40 transition"
        >
          {expanded ? "Mostrar menos ▲" : `Ver todos (${totalAvailable}) ▼`}
        </button>
      )}
    </div>
  );
}

function MatchupColumn({
  title,
  color,
  entries,
}: {
  title: string;
  color: string;
  entries: OpggMatchup[];
}) {
  if (entries.length === 0) {
    return (
      <div>
        <p className={`text-[10px] uppercase tracking-widest ${color} mb-1`}>
          {title}
        </p>
        <p className="text-[10px] text-white/35 italic">Sin datos</p>
      </div>
    );
  }
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-widest ${color} mb-1`}>
        {title}
      </p>
      <ul className="space-y-0.5">
        {entries.map((m) => {
          // Threat tier from winrate delta — quick visual signal beyond
          // raw %. Mirrors Mobalytics' S/A/B badges. >55% = strong
          // favor / <45% = severe / etc.
          const delta = m.winRate - 50;
          const absDelta = Math.abs(delta);
          const tierLabel =
            absDelta >= 7 ? "S" : absDelta >= 4 ? "A" : absDelta >= 2 ? "B" : "C";
          const tierColor =
            delta >= 0
              ? absDelta >= 7
                ? "bg-good/30 text-good"
                : "bg-good/15 text-good/85"
              : absDelta >= 7
                ? "bg-bad/30 text-bad"
                : "bg-bad/15 text-bad/85";
          return (
            <li
              key={m.championKey}
              className="flex items-center justify-between gap-1.5 text-[11px] text-white/70"
              title={`${m.play.toLocaleString()} partidas`}
            >
              <span className="truncate pr-1 flex-1">{m.championName}</span>
              <span
                className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold tabular-nums shrink-0 ${tierColor}`}
                title={`Tier amenaza ${tierLabel}`}
              >
                {tierLabel}
              </span>
              <span
                className={`tabular-nums text-[10px] font-medium shrink-0 ${
                  m.winRate >= 50 ? "text-good" : "text-bad"
                }`}
              >
                {m.winRate.toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
