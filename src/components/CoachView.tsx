import { useEffect, useState } from "react";
import { analyzeMatch, type Insight } from "../engine/coachEngine";
import { computeGpi, type GpiScore } from "../engine/gpiEngine";
import {
  getMatchFull,
  getMatchTimeline,
  type MatchFull,
} from "../services/riotApi";
import { recentMatches } from "../services/matchRepo";
import { loadSettings } from "../services/settingsRepo";
import type { ChampionDb } from "../types/champion";
import { GpiRadar } from "./GpiRadar";

interface Props {
  db: ChampionDb;
  onClose: () => void;
}

export function CoachView({ db, onClose }: Props) {
  const [matchId, setMatchId] = useState<string | null>(null);
  const [matchFull, setMatchFull] = useState<MatchFull | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [gpi, setGpi] = useState<GpiScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [matchOptions, setMatchOptions] = useState<
    Array<{ id: string; champion: string; win: boolean }>
  >([]);

  useEffect(() => {
    recentMatches(20).then((rows) => {
      setMatchOptions(
        rows.map((r) => ({
          id: r.matchId,
          champion: db.champions[String(r.championId)]?.name ?? `#${r.championId}`,
          win: r.win,
        }))
      );
      if (rows[0]) setMatchId(rows[0].matchId);
    });
  }, [db]);

  useEffect(() => {
    if (!matchId) return;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const cfg = await loadSettings();
        if (!cfg || !cfg.puuid) throw new Error("Configura primero tu Riot ID en ⚙");
        const [full, timeline] = await Promise.all([
          getMatchFull(cfg, matchId),
          getMatchTimeline(cfg, matchId),
        ]);
        setMatchFull(full);
        setInsights(analyzeMatch({ match: full, timeline, myPuuid: cfg.puuid }));
        setGpi(computeGpi(full, cfg.puuid));
      } catch (e) {
        setErr(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [matchId]);

  const me = matchFull?.participants.find((p) => p.puuid && true);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-bg-elev border border-border-subtle rounded-lg p-4 w-[820px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold text-accent">Coach</h2>
          <select
            value={matchId ?? ""}
            onChange={(e) => setMatchId(e.target.value)}
            className="bg-bg text-white text-sm px-2 py-1 rounded border border-border-subtle"
          >
            {matchOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.win ? "✓" : "✗"} {m.champion}
              </option>
            ))}
          </select>
        </div>

        {loading && <p className="text-white/60">Analizando partida...</p>}
        {err && <p className="text-bad">{err}</p>}

        {!loading && !err && matchFull && me && (
          <div className="overflow-y-auto space-y-3">
            <div className="text-xs text-white/50">
              {Math.round(matchFull.durationSec / 60)}min · queue {matchFull.queueId}
            </div>
            {gpi && (
              <div className="bg-bg-card border border-border-subtle rounded p-3">
                <GpiRadar score={gpi} />
              </div>
            )}
            {insights.length === 0 ? (
              <p className="text-white/50 text-center py-4">
                Sin observaciones — partida limpia.
              </p>
            ) : (
              insights.map((ins, i) => <InsightCard key={i} insight={ins} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const colors = {
    bad: "border-bad/60 bg-bad/10",
    warn: "border-meh/60 bg-meh/10",
    good: "border-good/60 bg-good/10",
    info: "border-border-subtle bg-bg-card",
  };
  const icons = { bad: "✗", warn: "!", good: "✓", info: "ℹ" };
  return (
    <div className={`p-3 rounded border ${colors[insight.severity]}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-lg leading-none">{icons[insight.severity]}</span>
        <h4 className="font-medium text-white">{insight.title}</h4>
        <span className="ml-auto text-xs text-white/40 uppercase">
          {insight.category}
        </span>
      </div>
      <p className="text-sm text-white/80 mt-1">{insight.detail}</p>
      {insight.metric && (
        <p className="text-xs text-white/50 mt-1">{insight.metric}</p>
      )}
      {insight.action && (
        <p className="text-sm text-accent mt-2">→ {insight.action}</p>
      )}
    </div>
  );
}
