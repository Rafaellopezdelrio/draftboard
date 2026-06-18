import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { recentMatches, type MatchRow } from "../services/matchRepo";
import type { ChampionDb, Role } from "../types/champion";
import { queueLabel, isRelevantQueue } from "../data/queueNames";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { Tabs } from "./ui/Tabs";
import { StatCard } from "./ui/StatCard";
import { Flame, Snowflake, Search, Inbox, Filter } from "lucide-react";
import { EmptyState } from "./ui/EmptyState";
import { ChampionStatsPanel } from "./ChampionStatsPanel";
import { SparkLine } from "./ui/SparkLine";

const TITLE_ID = "history-view-title";

interface Props {
  db: ChampionDb;
  onClose: () => void;
}

type QueueFilter = "ALL" | "RANKED" | "NORMAL" | "ARAM" | "ROTATION" | number;

// Queue families. Each label maps to multiple queue IDs.
// Source: https://static.developer.riotgames.com/docs/lol/queues.json
// `label` holds an i18n key (history.queue.* / history.role.*) resolved at the
// render site via t() so the filter tabs localize.
const QUEUE_TABS: Array<{ value: QueueFilter; label: string; ids?: number[] }> = [
  // Ranked SR
  { value: "RANKED", label: "history.queue.ranked", ids: [420, 440] },
  { value: 420, label: "history.queue.soloq", ids: [420] },
  { value: 440, label: "history.queue.flex", ids: [440] },
  // Normal SR
  { value: "NORMAL", label: "history.queue.normal", ids: [400, 430, 490] },
  // ARAM (Howling Abyss only)
  { value: "ARAM", label: "history.queue.aram", ids: [450, 720] },
  // Arena (permanent 2v2v2v2 mode, separate tab)
  { value: 1700, label: "history.queue.arena", ids: [1700] },
  // Rotating event modes only (URF / OFA / Nexus Blitz / Spellbook)
  { value: "ROTATION", label: "history.queue.rotation", ids: [900, 1020, 1300, 1400, 1900] },
  { value: "ALL", label: "history.queue.all" },
];

const ROLE_TABS: Array<{ value: Role | "ALL"; label: string }> = [
  { value: "ALL", label: "history.role.all" },
  { value: "TOP", label: "history.role.top" },
  { value: "JUNGLE", label: "history.role.jungle" },
  { value: "MIDDLE", label: "history.role.mid" },
  { value: "BOTTOM", label: "history.role.adc" },
  { value: "UTILITY", label: "history.role.sup" },
];

export function HistoryView({ db, onClose }: Props) {
  const { t } = useTranslation();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [queueTab, setQueueTab] = useState<QueueFilter>("RANKED");
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL");
  // Raw input value (immediate UI) + debounced value (drives filter).
  // Without debounce every keystroke filters all matches synchronously
  // — fast for <100 matches, noticeable for 1000+ players. 120ms feels
  // instant but coalesces fast typing into a single filter pass.
  const [championFilterRaw, setChampionFilter] = useState<string>("");
  const [championFilter, setChampionFilterDebounced] = useState<string>("");
  useEffect(() => {
    const t = setTimeout(() => setChampionFilterDebounced(championFilterRaw), 120);
    return () => clearTimeout(t);
  }, [championFilterRaw]);
  const [hideNoise, setHideNoise] = useState<boolean>(true);
  useEscape(onClose);

  useEffect(() => {
    recentMatches(200).then(setMatches);
  }, []);

  const filtered = useMemo(() => {
    const now = Date.now();
    const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
    return matches.filter((m) => {
      // Hide noise: customs, very short games (remakes/dodges), tutorials, very old
      if (hideNoise) {
        if (!isRelevantQueue(m.queueId)) return false;
        if (m.durationSec < 5 * 60) return false; // remake/dodge
        if (m.gameEndTimestampMs < ninetyDaysAgo) return false; // older than 90 days
      }
      // Queue filter
      const tab = QUEUE_TABS.find((t) => t.value === queueTab);
      if (tab?.ids && !tab.ids.includes(m.queueId)) return false;
      // Role filter
      if (roleFilter !== "ALL" && m.position !== roleFilter) return false;
      // Champion filter (fuzzy)
      if (championFilter) {
        const champ = db.champions[String(m.championId)];
        if (!champ) return false;
        if (!champ.name.toLowerCase().includes(championFilter.toLowerCase()))
          return false;
      }
      return true;
    });
  }, [matches, queueTab, roleFilter, championFilter, db, hideNoise]);

  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const hiddenCount = matches.length - matches.filter((m) =>
    isRelevantQueue(m.queueId) && m.durationSec >= 5 * 60 && m.gameEndTimestampMs >= ninetyDaysAgo
  ).length;

  const wins = filtered.filter((m) => m.win).length;
  const winRate = filtered.length > 0 ? (wins / filtered.length) * 100 : 0;
  const avgKda = filtered.length > 0
    ? filtered.reduce(
        (acc, m) => acc + (m.kills + m.assists) / Math.max(1, m.deaths),
        0
      ) / filtered.length
    : 0;
  const avgCs = filtered.length > 0
    ? filtered.reduce((acc, m) => acc + m.cs / (m.durationSec / 60), 0) /
      filtered.length
    : 0;
  const streakInfo = computeStreak(filtered);
  // Detect "single champion in results" — only show the
  // ChampionStatsPanel when EVERY match in the filtered list is the
  // same champion. Avoids noise when filter is empty / generic.
  const singleChampionId = useMemo<number | null>(() => {
    if (filtered.length === 0) return null;
    const first = filtered[0].championId;
    return filtered.every((m) => m.championId === first) ? first : null;
  }, [filtered]);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, true);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg w-[820px] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-2 border-b border-border-subtle">
          <div className="flex items-center justify-between mb-3">
            <h2 id={TITLE_ID} className="text-xl font-bold gold-text">{t("history.title")}</h2>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                value={championFilterRaw}
                onChange={(e) => setChampionFilter(e.target.value)}
                placeholder={t("history.filterByChampion")}
                className="bg-bg-elev/60 pl-8 pr-3 py-1.5 text-sm rounded-md ring-1 ring-border-subtle focus:ring-accent text-white outline-none w-52 transition"
              />
            </div>
          </div>

          {/* Queue tabs (underline style) */}
          <Tabs
            tabs={QUEUE_TABS.map((q) => ({ value: q.value, label: t(q.label) }))}
            active={queueTab}
            onChange={setQueueTab}
          />

          {/* Role filter + noise toggle */}
          <div className="flex items-center justify-between gap-2 mt-2">
            <div
              role="tablist"
              aria-label={t("history.role.filterLabel")}
              className="flex gap-1 flex-wrap"
            >
              {ROLE_TABS.map((r) => (
                <button
                  key={r.value}
                  role="tab"
                  aria-selected={roleFilter === r.value}
                  onClick={() => setRoleFilter(r.value)}
                  className={`px-2.5 py-1 text-[11px] uppercase tracking-wide rounded-md transition ${
                    roleFilter === r.value
                      ? "bg-accent/15 text-accent ring-1 ring-accent/40"
                      : "text-white/55 hover:text-white/85"
                  }`}
                >
                  {t(r.label)}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-white/60 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={hideNoise}
                onChange={(e) => setHideNoise(e.target.checked)}
                className="accent-accent"
              />
              Solo PvP real
              {hiddenCount > 0 && (
                <span className="text-white/40">({hiddenCount} ocultas)</span>
              )}
            </label>
          </div>
        </div>

        {/* Stats summary */}
        <div className="px-4 py-3 grid grid-cols-4 gap-2 bg-bg-card/30 border-b border-border-subtle">
          <StatCard value={filtered.length} label={t("history.matches")} />
          <StatCard
            value={`${winRate.toFixed(0)}%`}
            label={t("history.winrate")}
            color={winRate >= 55 ? "good" : winRate >= 45 ? "default" : "bad"}
          />
          <StatCard value={avgKda.toFixed(2)} label={t("history.avgKda")} />
          <StatCard value={avgCs.toFixed(1)} label={t("history.csPerMin")} />
        </div>

        {/* Winrate trend sparkline — rolling 10-game WR % over the filter
          * set. Older games on the left, newer on the right. Lets the
          * user see if they're climbing (line going up) or tilting
          * (line going down) at a glance. Hidden when <10 games to
          * avoid noisy single-point lines. */}
        {filtered.length >= 10 && (
          <div className="px-4 py-2 bg-bg-card/20 border-b border-border-subtle flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-widest text-white/45 font-semibold shrink-0">
              Tendencia WR
            </span>
            <div className="flex-1">
              <SparkLine
                data={rollingWinRate(filtered)}
                width={280}
                height={28}
                color="rgb(78,205,196)"
                baseline={50}
              />
            </div>
            <span className="text-[10px] text-white/45 tabular-nums">
              {filtered.length} partidas
            </span>
          </div>
        )}

        {streakInfo && (
          <div
            className={`px-5 py-2 text-xs flex items-center gap-2 ${
              streakInfo.win ? "text-good bg-good/5" : "text-bad bg-bad/5"
            } border-b border-border-subtle`}
          >
            {streakInfo.win ? (
              <Flame className="w-3.5 h-3.5" />
            ) : (
              <Snowflake className="w-3.5 h-3.5" />
            )}
            <span className="font-medium">
              {streakInfo.win ? t("history.winStreak") : t("history.loseStreak")}:
            </span>
            <span className="font-bold tabular-nums">{streakInfo.count}</span>
            <span>{t("history.streakSuffix")}</span>
          </div>
        )}

        {/* Matches list */}
        <div className="overflow-y-auto p-3 space-y-1">
          {filtered.length === 0 && matches.length > 0 && (
            <EmptyState
              icon={Filter}
              title={t("history.emptyFilters")}
              detail={t("history.emptyFiltersDetail")}
            />
          )}
          {matches.length === 0 && (
            <EmptyState
              icon={Inbox}
              title={t("history.emptyAll")}
              detail={t("history.emptyAllDetail")}
            />
          )}
          {filtered.length > 0 && singleChampionId !== null && (
            // Only when the filter narrows to one specific champion —
            // showing aggregate stats for "all champions" would be
            // noise, the StatCard row above already covers it.
            <ChampionStatsPanel
              matches={filtered}
              championId={singleChampionId}
              db={db}
            />
          )}
          {filtered.length > 0 && (
            <ul
              role="list"
              aria-label={`Partidas (${filtered.length})`}
              className="space-y-1 list-none p-0 m-0"
            >
              {filtered.map((m) => (
                <li key={m.matchId} role="listitem">
                  <MatchRowCard db={db} m={m} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// Memoised so filter changes (queue/role) don't re-render every row;
// only rows whose `m` ref changes get re-rendered. The `db` prop is
// stable across the session so identity check is enough.
const MatchRowCard = memo(function MatchRowCard({ db, m }: { db: ChampionDb; m: MatchRow }) {
  const { t } = useTranslation();
  const champ = db.champions[String(m.championId)];
  const opp = m.opponentChampionId
    ? db.champions[String(m.opponentChampionId)]
    : null;
  const kda = ((m.kills + m.assists) / Math.max(1, m.deaths)).toFixed(2);
  const cspm = (m.cs / (m.durationSec / 60)).toFixed(1);
  const date = new Date(m.gameEndTimestampMs);
  const ago = formatTimeAgo(date, t);

  return (
    <div
      className={`flex items-center gap-3 p-2 rounded-md ring-1 ${m.win ? "ring-good/30 bg-good/5 hover:bg-good/10" : "ring-bad/30 bg-bad/5 hover:bg-bad/10"} transition`}
    >
      <div
        className={`w-1 h-12 rounded-full ${m.win ? "bg-good" : "bg-bad"}`}
        aria-hidden
      />
      {champ && (
        <img
          src={champ.iconUrl}
          alt={champ.name}
          className="w-12 h-12 rounded ring-1 ring-border-subtle"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">
          {champ?.name ?? `#${m.championId}`}
          {opp && (
            <span className="text-white/45 text-xs ml-1">vs {opp.name}</span>
          )}
        </p>
        <p className="text-xs text-white/50 truncate">
          <span className="uppercase tracking-wide">{m.position || "—"}</span>
          {" · "}
          {queueLabel(m.queueId)} · {Math.round(m.durationSec / 60)}min · {ago}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm text-white/85 tabular-nums font-medium">
          {m.kills}/{m.deaths}/{m.assists}{" "}
          <span className="text-white/45 text-xs">({kda})</span>
        </p>
        <p className="text-[11px] text-white/50 tabular-nums">
          {cspm} cs/min · {m.cs} CS
        </p>
      </div>
      <span
        className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded ml-1 ${
          m.win
            ? "bg-good/15 text-good ring-1 ring-good/40"
            : "bg-bad/15 text-bad ring-1 ring-bad/40"
        }`}
      >
        {m.win ? "Win" : "Loss"}
      </span>
    </div>
  );
});

/**
 * Compute a rolling 10-game winrate series for sparkline display.
 * Walks the matches in chronological order (oldest first), maintains a
 * sliding window, emits the % win for the window at each step.
 * Returns at most 30 data points so the sparkline doesn't get cramped.
 */
function rollingWinRate(matches: MatchRow[]): number[] {
  const WINDOW = 10;
  // matches arrive newest-first; reverse so we read chronologically.
  const chrono = [...matches].reverse();
  const series: number[] = [];
  for (let i = WINDOW - 1; i < chrono.length; i++) {
    const window = chrono.slice(i - WINDOW + 1, i + 1);
    const wins = window.filter((m) => m.win).length;
    series.push((wins / WINDOW) * 100);
  }
  // Cap to last 30 points so the chart stays readable on wide histories.
  return series.slice(-30);
}

function computeStreak(matches: MatchRow[]): { win: boolean; count: number } | null {
  if (matches.length === 0) return null;
  const first = matches[0];
  let count = 0;
  for (const m of matches) {
    if (m.win === first.win) count++;
    else break;
  }
  if (count < 2) return null;
  return { win: first.win, count };
}

function formatTimeAgo(d: Date, t: TFunction): string {
  const ms = Date.now() - d.getTime();
  const s = ms / 1000;
  if (s < 60) return t("history.now");
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}min`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h`;
  const days = h / 24;
  if (days < 7) return `${Math.floor(days)}d`;
  return d.toLocaleDateString();
}
