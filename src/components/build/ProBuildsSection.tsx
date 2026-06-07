// Pro builds section — shows 2-3 archetype variants pulled from u.gg's
// pro match data and clustered by core-item composition. Each variant
// lists the pros that ran it, the representative full build, and W/L
// stats. Tab-style switcher lets the user compare variants side-by-side.
//
// Falls back to nothing if the proxy is unreachable or the champion has
// no recent pro presence (rare champs like Yorick almost never appear).
//
// Extracted from BuildPanel.tsx as part of the file-split effort.

import { useEffect, useState } from "react";
import type { Role } from "../../types/champion";
import { fetchProBuilds, type ProBuildVariant, type ProMatchRecent } from "../../services/proBuilds";
import { ItemIcon } from "./icons";
import { Panel } from "../ui/Panel";

interface Props {
  /** Numeric champion ID (Riot key, not DDragon id). */
  championId: number;
  role: Role;
  patch: string;
}

export function ProBuildsSection({ championId, role, patch }: Props) {
  const [data, setData] = useState<{
    variants: ProBuildVariant[];
    recent: ProMatchRecent[];
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    setActiveIdx(0);
    fetchProBuilds(championId, role).then((d) => {
      if (cancelled) return;
      if (d) setData({ variants: d.variants, recent: d.recent, total: d.totalMatches });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [championId, role]);

  if (loading) {
    return (
      <div className="border-t border-white/5 pt-2">
        <div className="flex items-center gap-2 py-1">
          <div className="w-1.5 h-1.5 rounded-full bg-accent/70 animate-pulse" />
          <p className="text-[10px] text-white/40">Cargando pro builds…</p>
        </div>
      </div>
    );
  }
  if (!data || data.variants.length === 0) {
    return (
      <div className="border-t border-white/5 pt-2">
        <p className="text-[10px] uppercase tracking-widest text-white/45 mb-1">
          Pro builds
        </p>
        <p className="text-[11px] text-white/35 italic">
          Sin partidas pro recientes para este champion en {role}.
        </p>
      </div>
    );
  }

  const active = data.variants[activeIdx];

  return (
    <Panel
      padding="sm"
      collapsible
      defaultOpen={false}
      storageKey="proBuilds"
      icon={<span className="text-accent">🏆</span>}
      title="Pro builds"
      summary={`${data.total} partidas`}
    >
      <div className="space-y-2">
      {/* Variant tabs */}
      <div className="flex gap-1">
        {data.variants.map((v, i) => (
          <button
            key={v.key}
            onClick={() => setActiveIdx(i)}
            className={`flex-1 px-2 py-1.5 rounded text-[10px] uppercase tracking-wider transition ring-1 ${
              i === activeIdx
                ? "bg-accent/15 ring-accent/50 text-accent"
                : "bg-bg-card/40 ring-border-subtle text-white/50 hover:bg-bg-hover"
            }`}
            title={`${v.games} partidas · ${(v.winRate * 100).toFixed(0)}% WR`}
          >
            #{i + 1} · {v.games} pros
          </button>
        ))}
      </div>

      {/* Active variant: build path + pros */}
      {active && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {Array.from(new Set(active.representativeBuild))
              .slice(0, 6)
              .map((id, i) => (
                <ItemIcon key={i} patch={patch} id={id} />
              ))}
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-white/55">
              Pros: <span className="text-white/80">{active.proNames.join(", ")}</span>
            </span>
            <span
              className={`tabular-nums font-semibold ${
                active.winRate >= 0.5 ? "text-good" : "text-bad/80"
              }`}
            >
              {(active.winRate * 100).toFixed(0)}% WR · {active.games}g
            </span>
          </div>
        </div>
      )}

      {/* Recent pro matches teaser */}
      {data.recent.length > 0 && (
        <div className="border-t border-white/5 pt-1.5 space-y-0.5">
          <p className="text-[9px] uppercase tracking-widest text-white/35">
            Últimas partidas pro
          </p>
          {data.recent.slice(0, 3).map((m, i) => (
            <p
              key={i}
              className="text-[10px] text-white/55 flex justify-between gap-2"
            >
              <span className="truncate">
                <span className="text-white/80">{m.proName}</span>
                {m.team && <span className="text-white/40"> · {m.team}</span>}
                {m.league && <span className="text-white/40"> · {m.league}</span>}
              </span>
              <span
                className={`tabular-nums shrink-0 ${
                  m.win ? "text-good" : "text-bad/80"
                }`}
              >
                {m.kda}
              </span>
            </p>
          ))}
        </div>
      )}
      </div>
    </Panel>
  );
}
