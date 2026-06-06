import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { recentMatches, type MatchRow } from "../services/matchRepo";
import {
  computeTrends,
  detectWeakestArea,
} from "../engine/trendsEngine";
import { analyzeLeaks, summarizeLeakForAi } from "../engine/leakEngine";
import { analyzeProgress, summarizeProgressForAi } from "../engine/progressEngine";
import { recordLeak } from "../services/leakMemory";
import { buildPlaystyleProfile, getArchetypeMeta } from "../engine/playstyleEngine";
import {
  bracketForTier,
  bracketLabel,
  benchmarkStats,
  type BenchmarkKey,
  type BenchmarkVerdict,
} from "../engine/rankBenchmarks";
import type { ChampionDb, Role } from "../types/champion";
import { usePrefsStore } from "../state/prefsStore";
import { aiTrendsAnalysis } from "../services/aiCoach";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import { EmptyState } from "./ui/EmptyState";
import { DraftAdherencePanel } from "./DraftAdherencePanel";
import { SparkLine } from "./ui/SparkLine";
import { TrendingUp } from "lucide-react";

interface Props {
  db: ChampionDb;
  onClose: () => void;
  /** Riot tier name (e.g. "GOLD") for rank-relative benchmarks; null when
   *  the LCU isn't connected — benchmarks fall back to a median bracket. */
  rankTier?: string | null;
}

const LANE_ROLES = new Set<Role>(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]);

function dominantRole(matches: MatchRow[]): Role | null {
  const counts = new Map<Role, number>();
  for (const m of matches) {
    if (LANE_ROLES.has(m.position as Role)) {
      counts.set(m.position as Role, (counts.get(m.position as Role) ?? 0) + 1);
    }
  }
  let best: Role | null = null;
  let bestN = 0;
  for (const [r, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = r;
    }
  }
  return best;
}

function fmtBench(key: BenchmarkKey, v: number): string {
  return key === "cspm" ? v.toFixed(1) : v.toFixed(2);
}
function benchArrow(verdict: BenchmarkVerdict): string {
  return verdict === "above" ? "↑" : verdict === "below" ? "↓" : "≈";
}
function benchColor(verdict: BenchmarkVerdict): string {
  return verdict === "above"
    ? "text-good"
    : verdict === "below"
      ? "text-bad"
      : "text-white/40";
}

const ROLE_OPTIONS: Array<{ value: Role | "ALL"; labelKey: string }> = [
  { value: "ALL", labelKey: "trends.role.all" },
  { value: "TOP", labelKey: "trends.role.top" },
  { value: "JUNGLE", labelKey: "trends.role.jungle" },
  { value: "MIDDLE", labelKey: "trends.role.mid" },
  { value: "BOTTOM", labelKey: "trends.role.adc" },
  { value: "UTILITY", labelKey: "trends.role.support" },
];

const QUEUE_OPTIONS: Array<{ value: number | "ALL"; label: string }> = [
  { value: "ALL", label: "Todas las colas" },
  { value: 420, label: "Ranked SoloQ" },
  { value: 440, label: "Ranked Flex" },
  { value: 400, label: "Normal Draft" },
  { value: 430, label: "Normal Blind" },
  { value: 490, label: "Quickplay" },
  { value: 450, label: "ARAM" },
  { value: 6000, label: "ARAM Chaos" },
  { value: 1700, label: "Arena" },
  { value: 900, label: "URF" },
  { value: 1300, label: "Nexus Blitz" },
  { value: 1400, label: "Spellbook" },
];

export function TrendsView({ db, onClose, rankTier }: Props) {
  const { t } = useTranslation();
  useEscape(onClose);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [role, setRole] = useState<Role | "ALL">("ALL");
  const [queue, setQueue] = useState<number | "ALL">("ALL");
  const aiEnabled = usePrefsStore((s) => s.prefs.aiCoachEnabled);
  const aiProvider = usePrefsStore((s) => s.prefs.aiProvider);
  const apiKey = usePrefsStore((s) =>
    s.prefs.aiProvider === "groq"
      ? s.prefs.groqApiKey
      : s.prefs.aiProvider === "gemini"
        ? s.prefs.geminiApiKey
        : s.prefs.anthropicApiKey
  );
  const aiLang = usePrefsStore((s) => s.prefs.aiCoachLanguage);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);

  useEffect(() => {
    recentMatches(200).then(setMatches);
  }, []);

  const filtered = useMemo(() => {
    return matches.filter(
      (m) =>
        (role === "ALL" || m.position === role) &&
        (queue === "ALL" || m.queueId === queue)
    );
  }, [matches, role, queue]);

  const trends = computeTrends(filtered);
  const weakest = detectWeakestArea(filtered);
  // Cross-game leak: what statistically separates wins from losses across the
  // whole filtered sample. Supersedes the single-threshold `weakest` box when
  // there are enough games on both sides.
  const leak = useMemo(() => analyzeLeaks(filtered), [filtered]);
  // Longitudinal trend: are the metrics moving up or down over time (older
  // half vs newer half)? Complements the static leak read with direction.
  const progress = useMemo(() => analyzeProgress(filtered), [filtered]);
  // Persist the current #1 leak to AI memory (so the coach references it across
  // sessions) and surface a note when it has shifted since last time.
  const [leakProgress, setLeakProgress] = useState<string | null>(null);
  useEffect(() => {
    if (!leak) {
      setLeakProgress(null);
      return;
    }
    let cancelled = false;
    recordLeak(leak).then((p) => {
      if (!cancelled) setLeakProgress(p);
    });
    return () => {
      cancelled = true;
    };
  }, [leak]);

  // Rank-relative benchmarks: aggregate per-minute stats vs an estimated
  // baseline for the player's bracket + role.
  const benchmarks = useMemo(() => {
    if (filtered.length < 5) return null;
    const benchRole: Role | null = role !== "ALL" ? role : dominantRole(filtered);
    if (!benchRole) return null;
    let sumMin = 0,
      sumCS = 0,
      sumD = 0,
      sumK = 0,
      sumA = 0,
      sumVis = 0,
      visMin = 0;
    for (const m of filtered) {
      const min = m.durationSec / 60;
      sumMin += min;
      sumCS += m.cs;
      sumD += m.deaths;
      sumK += m.kills;
      sumA += m.assists;
      if (m.visionScore != null) {
        sumVis += m.visionScore;
        visMin += min;
      }
    }
    if (sumMin === 0) return null;
    const bracket = bracketForTier(rankTier);
    return {
      bracket,
      role: benchRole,
      list: benchmarkStats({
        bracket,
        role: benchRole,
        cspm: sumCS / sumMin,
        vspm: visMin > 0 ? sumVis / visMin : null,
        dpm: sumD / sumMin,
        kda: (sumK + sumA) / Math.max(1, sumD),
      }),
    };
  }, [filtered, role, rankTier]);

  // Rolling window series for the SparkLine charts. Chronological
  // (oldest -> newest), so the line reads left-to-right naturally.
  // matches array is newest-first; reverse + window for each metric.
  const sparkData = useMemo(() => {
    if (filtered.length < 3) return null;
    const chrono = [...filtered].reverse();
    const windowSize = Math.max(5, Math.floor(chrono.length / 10));
    const winrate: number[] = [];
    const kda: number[] = [];
    const cspm: number[] = [];
    for (let i = windowSize - 1; i < chrono.length; i++) {
      const slice = chrono.slice(i - windowSize + 1, i + 1);
      const wins = slice.filter((m) => m.win).length;
      winrate.push((wins / slice.length) * 100);
      const k = slice.reduce(
        (acc, m) => acc + (m.kills + m.assists) / Math.max(1, m.deaths),
        0
      );
      kda.push(k / slice.length);
      const c = slice.reduce(
        (acc, m) => acc + m.cs / Math.max(1, m.durationSec / 60),
        0
      );
      cspm.push(c / slice.length);
    }
    return { winrate, kda, cspm };
  }, [filtered]);

  async function runAi() {
    setAiLoading(true);
    setAiErr(null);
    try {
      const summary = filtered.slice(0, 15).map((m) => {
        const c = db.champions[String(m.championId)];
        return {
          championName: c?.name ?? `#${m.championId}`,
          position: m.position,
          win: m.win,
          kda: `${m.kills}/${m.deaths}/${m.assists}`,
          cspm: m.cs / (m.durationSec / 60),
          durationMin: m.durationSec / 60,
          queueId: m.queueId,
        };
      });
      const profile = buildPlaystyleProfile(filtered);
      const playstyleSummary = profile
        ? `Arquetipo: ${getArchetypeMeta(profile.archetype).label}. ${profile.traits
            .slice(0, 3)
            .join(". ")}. KDA ${profile.metrics.avgKda.toFixed(2)}, CS/min ${profile.metrics.avgCspm.toFixed(
            1
          )}, muertes/min ${profile.metrics.avgDeathsPerMin.toFixed(2)}.`
        : undefined;
      const benchmarkSummary =
        benchmarks && benchmarks.list.length > 0
          ? `Rango ${bracketLabel(benchmarks.bracket)} (${benchmarks.role}): ${benchmarks.list
              .map(
                (b) =>
                  `${b.label} ${fmtBench(b.key, b.value)} vs ${fmtBench(b.key, b.expected)} (${b.verdict})`
              )
              .join("; ")}.`
          : undefined;
      const text = await aiTrendsAnalysis({
        provider: aiProvider,
        apiKey,
        matches: summary,
        leakSummary: leak ? summarizeLeakForAi(leak) : undefined,
        playstyleSummary,
        benchmarkSummary,
        progressSummary: progress ? summarizeProgressForAi(progress) : undefined,
        language: aiLang,
      });
      setAiText(text);
    } catch (e) {
      setAiErr(String(e));
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg p-4 w-[680px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold text-accent">{t("trends.title")}</h2>
          <span className="text-xs text-white/40">
            {t("trends.matchCount", { count: filtered.length })}
          </span>
        </div>

        <div className="flex gap-2 mb-3">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role | "ALL")}
            className="bg-bg text-white text-sm px-2 py-1 rounded border border-border-subtle"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {t(r.labelKey)}
              </option>
            ))}
          </select>
          <select
            value={queue}
            onChange={(e) =>
              setQueue(e.target.value === "ALL" ? "ALL" : Number(e.target.value))
            }
            className="bg-bg text-white text-sm px-2 py-1 rounded border border-border-subtle"
          >
            {QUEUE_OPTIONS.map((q) => (
              <option key={q.value} value={q.value}>
                {q.value === "ALL" ? t("trends.queueAll") : q.label}
              </option>
            ))}
          </select>
        </div>

        {leak ? (
          <div className="mb-3 p-3 rounded border border-accent/40 bg-accent/5">
            <p className="text-xs uppercase text-white/50 tracking-wide">
              {t("trends.leakHeader")}
            </p>
            <p className="font-medium text-white mt-1">
              {t(leak.headlineKey, {
                label: leak.macro ? "" : t(leak.topLeak.labelKey),
                wr: leak.wrPct,
                games: leak.games,
              })}
            </p>
            {leakProgress && (
              <p className="text-[11px] text-good mt-1">📈 {leakProgress}</p>
            )}
            {!leak.macro && (
              <p className="text-sm text-white/80 mt-1">{t(leak.topLeak.adviceKey)}</p>
            )}
            <div className="mt-2 space-y-1.5">
              {leak.leaks.map((l) => (
                <div key={l.key}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-white/80">
                      {t("trends.leakInsight", {
                        label: t(l.labelKey),
                        loss: l.lossFmt,
                        win: l.winFmt,
                      })}
                    </span>
                    <span className="text-white/40 tabular-nums ml-2">
                      d{l.effect.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded overflow-hidden mt-0.5">
                    <div
                      className={
                        l.severity === "bad"
                          ? "h-full bg-bad/70"
                          : l.severity === "warn"
                            ? "h-full bg-meh/70"
                            : "h-full bg-white/30"
                      }
                      style={{ width: `${Math.min(100, l.effect * 60)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          weakest && (
            <div className="mb-3 p-3 rounded border border-bad/60 bg-bad/10">
              <p className="text-xs uppercase text-white/50 tracking-wide">
                {role !== "ALL"
                  ? t("trends.weakestIn", { role })
                  : t("trends.weakestWeek")}
              </p>
              <p className="font-medium text-white mt-1">{weakest.category}</p>
              <p className="text-sm text-white/80">{weakest.detail}</p>
            </div>
          )
        )}

        {benchmarks && benchmarks.list.length > 0 && (
          <div className="mb-3 p-3 rounded border border-border-subtle bg-bg-card/40">
            <p className="text-xs uppercase text-white/50 tracking-wide">
              {t("trends.vsRank")} · {bracketLabel(benchmarks.bracket)} · {benchmarks.role}{" "}
              <span className="text-white/30 normal-case">{t("trends.estimated")}</span>
            </p>
            <div className="mt-2 space-y-1">
              {benchmarks.list.map((b) => (
                <div
                  key={b.key}
                  className="flex items-center justify-between text-[11px]"
                >
                  <span className="text-white/70">{b.label}</span>
                  <span className="flex items-center gap-2 tabular-nums">
                    <span className="text-white/85">{fmtBench(b.key, b.value)}</span>
                    <span className="text-white/35">
                      vs {fmtBench(b.key, b.expected)}
                    </span>
                    <span className={`${benchColor(b.verdict)} w-3 text-center`}>
                      {benchArrow(b.verdict)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {progress && (
          <div className="mb-3 p-3 rounded border border-border-subtle bg-bg-card/40">
            <p className="text-xs uppercase text-white/50 tracking-wide">
              {t("trends.evolution")} ·{" "}
              <span
                className={
                  progress.trend === "improving"
                    ? "text-good"
                    : progress.trend === "declining"
                      ? "text-bad"
                      : "text-white/60"
                }
              >
                {progress.trend === "improving"
                  ? t("trends.trendImproving")
                  : progress.trend === "declining"
                    ? t("trends.trendDeclining")
                    : progress.trend === "mixed"
                      ? t("trends.trendMixed")
                      : t("trends.trendStable")}
              </span>
            </p>
            <p className="text-sm text-white/85 mt-1">{progress.headline}</p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {progress.metrics.map((m) => (
                <div
                  key={m.key}
                  className="flex items-center justify-between text-[11px]"
                >
                  <span className="text-white/70">{m.label}</span>
                  <span
                    className={`tabular-nums ${
                      m.direction === "up"
                        ? "text-good"
                        : m.direction === "down"
                          ? "text-bad"
                          : "text-white/40"
                    }`}
                  >
                    {m.direction === "up" ? "↑" : m.direction === "down" ? "↓" : "≈"}{" "}
                    {m.pctChange >= 0 ? "+" : ""}
                    {Math.round(m.pctChange * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {aiEnabled && filtered.length >= 5 && (
          <div className="mb-3 p-3 rounded border border-accent/40 bg-accent/5">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm uppercase text-accent tracking-wide">
                {t("trends.aiCoach")}
              </h3>
              <button
                onClick={runAi}
                disabled={aiLoading || !apiKey}
                className="text-xs px-2 py-1 bg-accent text-black rounded disabled:opacity-50"
              >
                {aiLoading
                  ? t("trends.analyzing")
                  : t("trends.analyzeLast", { n: filtered.slice(0, 15).length })}
              </button>
            </div>
            {aiErr && <p className="text-sm text-bad">{aiErr}</p>}
            {aiText && (
              <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
                {aiText}
              </p>
            )}
          </div>
        )}

        {sparkData && (
          // Visual trend curves: winrate (baseline 50%), KDA (baseline
          // 2.0 — "decent"), CS/min. Each chart is a tiny rolling
          // average window, chronological left-to-right, so the user
          // sees if they're trending up or down at a glance.
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="p-2 rounded bg-bg-card/40 border border-border-subtle">
              <p className="text-[10px] uppercase tracking-wide text-white/45 mb-1">
                {t("trends.sparkWinrate")}
              </p>
              <SparkLine
                data={sparkData.winrate}
                baseline={50}
                color="#94d09b"
                width={140}
                height={32}
                ariaLabel={t("trends.ariaWinrate")}
              />
            </div>
            <div className="p-2 rounded bg-bg-card/40 border border-border-subtle">
              <p className="text-[10px] uppercase tracking-wide text-white/45 mb-1">
                {t("trends.sparkKda")}
              </p>
              <SparkLine
                data={sparkData.kda}
                baseline={2}
                color="#e6cf8a"
                width={140}
                height={32}
                ariaLabel={t("trends.ariaKda")}
              />
            </div>
            <div className="p-2 rounded bg-bg-card/40 border border-border-subtle">
              <p className="text-[10px] uppercase tracking-wide text-white/45 mb-1">
                {t("trends.sparkCspm")}
              </p>
              <SparkLine
                data={sparkData.cspm}
                color="#9eb8d0"
                width={140}
                height={32}
                ariaLabel={t("trends.ariaCspm")}
              />
            </div>
          </div>
        )}

        <DraftAdherencePanel />

        {trends.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title={t("trends.emptyTitle")}
            detail={t("trends.emptyDetail")}
          />
        ) : (
          <div className="space-y-2 overflow-y-auto">
            {trends.map((tr, i) => (
              <div
                key={i}
                className={`p-2 rounded border text-sm ${
                  tr.severity === "good"
                    ? "border-good/60 bg-good/10 text-good"
                    : tr.severity === "warn"
                      ? "border-meh/60 bg-meh/10 text-meh"
                      : tr.severity === "bad"
                        ? "border-bad/60 bg-bad/10 text-bad"
                        : "border-border-subtle bg-bg-card text-white/80"
                }`}
              >
                {tr.insight}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
