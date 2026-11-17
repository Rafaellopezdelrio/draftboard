// "Mis campeones": every champion the player has in their stored ranked and
// Clash games, with win rate, KDA, CS, gold and vision, and each champion
// split by lane opponent. Reads only the locally stored match summaries.

import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import type { ChampionDb } from "../types/champion";
import { recentMatches, type MatchRow } from "../services/matchRepo";
import {
  QUEUE_GROUPS,
  championLines,
  kdaRatio,
  opponentLines,
  pickGames,
  seasonsIn,
  type ChampionLine,
  type QueueGroup,
} from "../engine/championStats";
import { useEscape } from "../hooks/useKeyboardShortcuts";

interface Props {
  db: ChampionDb;
  onClose: () => void;
}

/** Enough to cover every stored game. */
const READ_LIMIT = 5000;
const QUEUE_ORDER: QueueGroup[] = ["ranked", "solo", "flex", "clash"];

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function ChampionStatsView({ db, onClose }: Props) {
  const { t } = useTranslation();
  useEscape(onClose);
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [queue, setQueue] = useState<QueueGroup>("ranked");
  const [season, setSeason] = useState<number | "all" | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let stale = false;
    recentMatches(READ_LIMIT)
      .then((m) => !stale && setMatches(m))
      .catch(() => !stale && setMatches([]));
    return () => {
      stale = true;
    };
  }, []);

  const queues = QUEUE_GROUPS[queue];
  const seasons = useMemo(() => seasonsIn(matches ?? [], queues), [matches, queues]);
  // Default and fallback: the newest season with games in this queue.
  const effectiveSeason: number | null =
    season === "all" ? null : season !== null && seasons.includes(season) ? season : (seasons[0] ?? null);
  const games = useMemo(
    () => pickGames(matches ?? [], queues, effectiveSeason),
    [matches, queues, effectiveSeason]
  );
  const { total, champions } = useMemo(() => championLines(games), [games]);
  const nameOf = (id: number) => db.champions[String(id)]?.name ?? `#${id}`;
  const shown = query.trim()
    ? champions.filter((c) => plain(nameOf(c.championId)).includes(plain(query.trim())))
    : champions;

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={t("championStats.title")}
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg p-4 w-[980px] max-w-[96vw] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-3 gap-3">
          <h2 className="text-lg font-semibold text-accent">{t("championStats.title")}</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40">{t("championStats.gameCount", { count: games.length })}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className="p-1 rounded text-white/50 hover:text-white hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <select
            aria-label={t("championStats.queue")}
            value={queue}
            onChange={(e) => {
              setQueue(e.target.value as QueueGroup);
              setOpen(null);
            }}
            className="bg-bg text-white text-sm px-2 py-1 rounded border border-border-subtle"
          >
            {QUEUE_ORDER.map((q) => (
              <option key={q} value={q}>
                {t(`championStats.queues.${q}`)}
              </option>
            ))}
          </select>
          <select
            aria-label={t("championStats.season")}
            value={effectiveSeason === null ? "all" : String(effectiveSeason)}
            onChange={(e) => {
              setSeason(e.target.value === "all" ? "all" : Number(e.target.value));
              setOpen(null);
            }}
            className="bg-bg text-white text-sm px-2 py-1 rounded border border-border-subtle"
          >
            {seasons.map((y) => (
              <option key={y} value={y}>
                {t("championStats.seasonYear", { year: y })}
              </option>
            ))}
            <option value="all">{t("championStats.allSeasons")}</option>
          </select>
          <label className="ml-auto flex items-center gap-1.5 bg-bg rounded border border-border-subtle px-2">
            <Search className="w-3.5 h-3.5 text-white/40" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("championStats.search")}
              aria-label={t("championStats.search")}
              className="bg-transparent text-sm text-white py-1 outline-none w-40"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {matches === null ? (
            <p className="text-sm text-white/50 p-4">{t("championStats.loading")}</p>
          ) : games.length === 0 ? (
            <p className="text-sm text-white/60 p-4">{t("championStats.empty")}</p>
          ) : (
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-white/45 text-left">
                  <th className="py-2 px-2 font-medium">#</th>
                  <th className="py-2 px-2 font-medium">{t("championStats.col.champion")}</th>
                  <th className="py-2 px-2 font-medium">{t("championStats.col.played")}</th>
                  <th className="py-2 px-2 font-medium text-center">{t("championStats.col.kda")}</th>
                  <th className="py-2 px-2 font-medium text-center">{t("championStats.col.cs")}</th>
                  <th className="py-2 px-2 font-medium text-center">{t("championStats.col.gold")}</th>
                  <th className="py-2 px-2 font-medium text-center">{t("championStats.col.vision")}</th>
                  <th className="py-2 px-2" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                <StatRow line={total} label={t("championStats.allChampions")} rank="—" strong />
                {shown.map((c, i) => {
                  const isOpen = open === c.championId;
                  const rivals = isOpen ? opponentLines(games, c.championId) : [];
                  return (
                    <Fragment key={c.championId}>
                      <StatRow
                        line={c}
                        label={nameOf(c.championId)}
                        icon={db.champions[String(c.championId)]?.iconUrl}
                        rank={String(i + 1)}
                        open={isOpen}
                        onToggle={() => setOpen(isOpen ? null : c.championId)}
                        toggleLabel={t("championStats.vsToggle", { name: nameOf(c.championId) })}
                      />
                      {isOpen &&
                        (rivals.length ? (
                          rivals.map((r) => (
                            <StatRow
                              key={r.championId}
                              line={r}
                              label={nameOf(r.championId)}
                              icon={db.champions[String(r.championId)]?.iconUrl}
                              rank=""
                              vs={t("championStats.vs")}
                            />
                          ))
                        ) : (
                          <tr>
                            <td />
                            <td colSpan={7} className="py-2 px-2 text-xs text-white/50">
                              {t("championStats.noRivals")}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <p className="mt-2 text-[11px] text-white/40">{t("championStats.note")}</p>
      </div>
    </div>
  );
}

function StatRow({
  line,
  label,
  icon,
  rank,
  strong,
  vs,
  open,
  onToggle,
  toggleLabel,
}: {
  line: ChampionLine;
  label: string;
  icon?: string;
  rank: string;
  strong?: boolean;
  vs?: string;
  open?: boolean;
  onToggle?: () => void;
  toggleLabel?: string;
}) {
  const { t } = useTranslation();
  const n = line.games;
  const losses = n - line.wins;
  const wr = Math.round((line.wins / n) * 100);
  const ratio = kdaRatio(line);
  const ratioClass =
    ratio === null || ratio >= 5 ? "text-meh" : ratio >= 3 ? "text-good" : ratio >= 2 ? "text-white" : "text-white/60";
  const wrClass = wr >= 60 ? "text-good" : wr < 45 ? "text-bad" : "text-white/70";
  const avg = (v: number, d = 1) => (v / n).toFixed(d);
  const perMin = (v: number, minutes: number) => (minutes > 0 ? (v / minutes).toFixed(1) : "—");
  return (
    <tr
      className={`border-t border-border-subtle/50 ${vs ? "bg-white/[0.02]" : ""} ${onToggle ? "cursor-pointer hover:bg-white/5" : ""}`}
      onClick={onToggle}
    >
      <td className="py-1.5 px-2 text-white/40 text-xs">{rank}</td>
      <td className="py-1.5 px-2">
        <div className={`flex items-center gap-2 min-w-[150px] ${vs ? "pl-4" : ""}`}>
          {vs && <span className="text-[11px] text-white/40">{vs}</span>}
          {icon ? (
            <img src={icon} alt="" className={`${vs ? "w-6 h-6" : "w-8 h-8"} rounded`} />
          ) : (
            !vs && <span className="w-8 h-8 rounded bg-white/5" aria-hidden="true" />
          )}
          <span className={`truncate ${strong ? "font-bold text-white" : "font-semibold text-white/90"}`}>{label}</span>
        </div>
      </td>
      <td className="py-1.5 px-2">
        <div className="flex items-center gap-2 min-w-[150px]">
          <div className="flex h-5 w-28 rounded overflow-hidden text-[10px] font-bold" aria-hidden="true">
            {line.wins > 0 && (
              <div className="bg-good/70 text-black flex items-center px-1" style={{ width: `${(line.wins / n) * 100}%` }}>
                {t("championStats.winsShort", { n: line.wins })}
              </div>
            )}
            {losses > 0 && (
              <div className="bg-bad/70 text-white flex items-center justify-end px-1 flex-1">
                {t("championStats.lossesShort", { n: losses })}
              </div>
            )}
          </div>
          <span className={`text-xs ${wrClass}`}>{wr}%</span>
          <span className="sr-only">{t("championStats.record", { wins: line.wins, losses })}</span>
        </div>
      </td>
      <td className="py-1.5 px-2 text-center">
        <div className={`font-bold ${ratioClass}`}>
          {ratio === null ? t("championStats.perfect") : `${ratio.toFixed(2)}:1`}
        </div>
        <div className="text-[11px] text-white/45">
          {avg(line.kills)} / {avg(line.deaths)} / {avg(line.assists)}
        </div>
      </td>
      <td className="py-1.5 px-2 text-center">
        <div className="text-white/85">{avg(line.cs, 0)}</div>
        <div className="text-[11px] text-white/45">{t("championStats.perMin", { v: perMin(line.cs, line.minutes) })}</div>
      </td>
      <td className="py-1.5 px-2 text-center">
        {line.goldGames > 0 ? (
          <>
            <div className="text-white/85">{Math.round(line.gold / line.goldGames).toLocaleString()}</div>
            <div className="text-[11px] text-white/45">
              {t("championStats.perMin", { v: perMin(line.gold, line.goldMinutes) })}
            </div>
          </>
        ) : (
          <span className="text-white/30">—</span>
        )}
      </td>
      <td className="py-1.5 px-2 text-center text-white/85">
        {line.visionGames > 0 ? (line.vision / line.visionGames).toFixed(0) : <span className="text-white/30">—</span>}
      </td>
      <td className="py-1.5 px-2 text-white/40">
        {onToggle && (
          <button
            type="button"
            aria-label={toggleLabel}
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="p-1 rounded hover:bg-white/10"
          >
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </td>
    </tr>
  );
}
