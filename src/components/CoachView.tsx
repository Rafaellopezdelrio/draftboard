import { useEffect, useState } from "react";
import { analyzeMatch, type Insight } from "../engine/coachEngine";
import { computeGpi, type GpiScore } from "../engine/gpiEngine";
import { deriveTopInsight } from "../engine/topInsight";
import {
  getMatchFull,
  getMatchTimeline,
  type MatchFull,
  type MatchTimeline,
} from "../services/riotApi";
import { recentMatches } from "../services/matchRepo";
import { loadSettings } from "../services/settingsRepo";
import type { ChampionDb } from "../types/champion";
import { GpiRadar } from "./GpiRadar";
import { usePrefsStore } from "../state/prefsStore";
import { aiCoachAnalysis } from "../services/aiCoach";
import { queueLabel } from "../data/queueNames";
import { lcuRank } from "../services/lcuPersonalData";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useRef } from "react";
import { Skeleton, SkeletonRow } from "./ui/Skeleton";

const COACH_TITLE_ID = "coach-view-title";

interface Props {
  db: ChampionDb;
  onClose: () => void;
}

export function CoachView({ db, onClose }: Props) {
  useEscape(onClose);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [matchFull, setMatchFull] = useState<MatchFull | null>(null);
  const [matchTimeline, setMatchTimeline] = useState<MatchTimeline | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [gpi, setGpi] = useState<GpiScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [matchOptions, setMatchOptions] = useState<
    Array<{
      id: string;
      championId: number;
      champion: string;
      iconUrl: string;
      win: boolean;
      queueId: number;
      durationSec: number;
    }>
  >([]);
  // showGpi pref kept readable for telemetry/future use but no longer
  // gates the radar render — GPI is the killer visual in CoachView and
  // we don't hide it. Kept as a no-op assignment so the pref still
  // appears in DataPrivacy export.
  void usePrefsStore((s) => s.prefs.coachShowGpi);
  const aiEnabled = usePrefsStore((s) => s.prefs.aiCoachEnabled);
  const aiProvider = usePrefsStore((s) => s.prefs.aiProvider);
  const aiKey = usePrefsStore((s) =>
    s.prefs.aiProvider === "groq"
      ? s.prefs.groqApiKey
      : s.prefs.aiProvider === "gemini"
        ? s.prefs.geminiApiKey
        : s.prefs.anthropicApiKey
  );
  const aiLang = usePrefsStore((s) => s.prefs.aiCoachLanguage);
  const [aiResponse, setAiResponse] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);

  useEffect(() => {
    recentMatches(20).then((rows) => {
      setMatchOptions(
        rows.map((r) => {
          const c = db.champions[String(r.championId)];
          return {
            id: r.matchId,
            championId: r.championId,
            champion: c?.name ?? `#${r.championId}`,
            iconUrl: c?.iconUrl ?? "",
            win: r.win,
            queueId: r.queueId,
            durationSec: r.durationSec,
          };
        })
      );
      if (rows[0]) setMatchId(rows[0].matchId);
    });
  }, [db]);

  useEffect(() => {
    if (!matchId) return;
    setLoading(true);
    setErr(null);
    setAiResponse("");
    setAiErr(null);
    (async () => {
      try {
        const cfg = await loadSettings();
        if (!cfg || !cfg.puuid) throw new Error("Configura primero tu Riot ID en ⚙");
        const [full, timeline] = await Promise.all([
          getMatchFull(cfg, matchId),
          getMatchTimeline(cfg, matchId),
        ]);
        setMatchFull(full);
        setMatchTimeline(timeline);
        setInsights(analyzeMatch({ match: full, timeline, myPuuid: cfg.puuid }));
        setGpi(computeGpi(full, cfg.puuid));
      } catch (e) {
        setErr(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [matchId]);

  async function runAi() {
    if (!matchFull || !matchTimeline) return;
    const cfg = await loadSettings();
    if (!cfg?.puuid) return;
    const me = matchFull.participants.find((p) => p.puuid === cfg.puuid);
    if (!me) return;
    const opp = matchFull.participants.find(
      (p) => p.teamId !== me.teamId && p.position === me.position
    );
    setAiLoading(true);
    setAiErr(null);
    try {
      const myChampName =
        db.champions[String(me.championId)]?.name ?? `#${me.championId}`;
      const oppName = opp
        ? (db.champions[String(opp.championId)]?.name ?? `#${opp.championId}`)
        : null;
      const championNamesById = new Map<number, string>();
      for (const c of Object.values(db.champions)) {
        championNamesById.set(Number(c.key), c.name);
      }
      const rank = await lcuRank();
      const text = await aiCoachAnalysis({
        provider: aiProvider,
        apiKey: aiKey,
        match: matchFull,
        timeline: matchTimeline,
        myPuuid: cfg.puuid,
        insights,
        gpi,
        championName: myChampName,
        opponentChampionName: oppName,
        championNamesById,
        rank: rank
          ? { tier: rank.tier, division: rank.division, lp: rank.leaguePoints }
          : null,
        language: aiLang,
      });
      setAiResponse(text);
    } catch (e) {
      setAiErr(String(e));
    } finally {
      setAiLoading(false);
    }
  }

  const me = matchFull?.participants.find((p) => p.puuid && true);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, true);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={COACH_TITLE_ID}
      className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg p-4 w-[820px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 id={COACH_TITLE_ID} className="text-lg font-semibold text-accent">Coach</h2>
          <div className="flex-1 grid grid-cols-3 gap-1 max-h-32 overflow-y-auto">
            {matchOptions.map((m) => {
              const selected = m.id === matchId;
              return (
                <button
                  key={m.id}
                  onClick={() => setMatchId(m.id)}
                  className={`flex items-center gap-2 p-1 rounded text-left text-xs ${
                    selected
                      ? "bg-accent/20 border border-accent"
                      : "border border-border-subtle hover:bg-bg-card"
                  }`}
                  title={`${m.champion} · ${queueLabel(m.queueId)} · ${Math.round(m.durationSec / 60)}min`}
                >
                  {m.iconUrl && (
                    <img src={m.iconUrl} alt={m.champion} className="w-7 h-7 rounded" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-white">{m.champion}</p>
                    <p
                      className={`truncate ${m.win ? "text-good" : "text-bad"}`}
                    >
                      {m.win ? "W" : "L"} · {queueLabel(m.queueId)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {loading && (
          // Layout-stable skeleton mirroring real coach result shape:
          // 2 KPI rows + 3-line summary + bullet list. Less jumpy than
          // a single "Analizando..." line that's instantly replaced by
          // a tall report.
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
            <Skeleton rows={3} className="h-3 w-full" />
            <div className="space-y-2 mt-2">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          </div>
        )}
        {err && <p className="text-bad">{err}</p>}

        {!loading && !err && matchFull && me && (
          <div className="overflow-y-auto space-y-3">
            <div className="text-xs text-white/50">
              {Math.round(matchFull.durationSec / 60)}min ·{" "}
              {queueLabel(matchFull.queueId)}
            </div>
            {/* Top Insight card — surfaces the weakest GPI axis with a
              * concrete tip. Renders ABOVE the radar so the user gets
              * the actionable advice first, then dives into the
              * detailed visual breakdown. Card is skipped entirely when
              * GPI is healthy (all axes > 65), so it only appears when
              * there's something meaningful to coach. */}
            {(() => {
              const insight = deriveTopInsight(gpi);
              if (!insight) return null;
              const sevPalette = {
                critical: "border-bad/60 bg-bad/10",
                "needs-work": "border-meh/50 bg-meh/10",
                okay: "border-border-subtle bg-bg-card",
              }[insight.severity];
              const sevColor = {
                critical: "text-bad",
                "needs-work": "text-meh",
                okay: "text-white/70",
              }[insight.severity];
              return (
                <div className={`border rounded p-3 ${sevPalette}`}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <p className={`text-[10px] uppercase tracking-widest font-semibold ${sevColor}`}>
                      ⚡ Top insight
                    </p>
                    <span className={`text-[10px] uppercase tracking-wider ${sevColor}`}>
                      {insight.label} · {insight.score}/100
                    </span>
                  </div>
                  <p className="text-sm text-white leading-snug mb-1">{insight.tip}</p>
                  {insight.secondaryTip && (
                    <p className="text-[11px] text-white/55 leading-snug pt-1 border-t border-white/5">
                      {insight.secondaryTip}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* GPI radar — always shown when available. Previously gated
              * on `showGpi` pref which defaulted to ON anyway; the gate
              * just left users confused when they accidentally toggled
              * it off. The radar is the single most useful visual in
              * CoachView so we don't hide it. */}
            {gpi && (
              <div className="bg-bg-card border border-border-subtle rounded p-3">
                <GpiRadar score={gpi} />
              </div>
            )}

            {aiEnabled && (
              <div className="bg-bg-card border border-border-subtle rounded p-3 space-y-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm uppercase tracking-wide text-accent">
                    AI Coach
                  </h3>
                  <button
                    onClick={runAi}
                    disabled={aiLoading || !aiKey}
                    className="text-xs px-2 py-1 bg-accent text-black rounded disabled:opacity-50"
                  >
                    {aiLoading ? "Analizando..." : "Analizar con AI"}
                  </button>
                </div>
                {!aiKey && (
                  <p className="text-xs text-meh">
                    Pega tu API key ({aiProvider}) en Prefs. Groq es gratis.
                  </p>
                )}
                {aiErr && <p className="text-sm text-bad">{aiErr}</p>}
                {aiResponse && (
                  <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
                    {aiResponse}
                  </p>
                )}
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
