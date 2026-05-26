// Public summoner lookup. Search any Riot ID (Name#TAG) and see their profile.

import { useState } from "react";
import {
  getAccountByRiotId,
  getSummonerByPuuid,
  getLeagueEntriesByPuuid,
  getTopMasteries,
  getRecentMatchIds,
  getMatchFull,
  getRiotProxyUrl,
  type ChampionMasteryDto,
  type LeagueEntryDto,
} from "../services/riotApi";
import { loadSettings } from "../services/settingsRepo";
import type { ChampionDb } from "../types/champion";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useRef } from "react";

const SUMMONER_TITLE_ID = "summoner-lookup-title";
import { Panel, PanelHeader } from "./ui/Panel";
import { RankBadge } from "./ui/RankBadge";
import { StatCard } from "./ui/StatCard";
import { Search, User, Trophy, Star, Swords, Copy, Check, ExternalLink, TrendingUp, Flame } from "lucide-react";
import { Skeleton, SkeletonRow } from "./ui/Skeleton";
import { SparkLine } from "./ui/SparkLine";

interface Props {
  db: ChampionDb;
  onClose: () => void;
}

interface RecentMatch {
  championId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  duration: number;
  queueId: number;
}

interface ScoutData {
  riotId: string;
  tagLine: string;
  puuid: string;
  level: number | null;
  rank: LeagueEntryDto | null;
  masteries: ChampionMasteryDto[];
  recentMatches: RecentMatch[];
}

/** Riot rank tier → CDragon mini-regalia emblem. Returns null for
 *  unranked/unknown so caller can show RankBadge text fallback. */
function rankEmblem(tier: string | undefined): string | null {
  if (!tier) return null;
  const t = tier.toLowerCase();
  const valid = [
    "iron", "bronze", "silver", "gold", "platinum", "emerald",
    "diamond", "master", "grandmaster", "challenger",
  ];
  if (!valid.includes(t)) return null;
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-regalia/${t}.png`;
}

/** KDA color thresholds: ≥5 elite, 3-5 good, 2-3 ok, <2 bad. */
function kdaColor(k: number, d: number, a: number): string {
  const kda = d === 0 ? k + a : (k + a) / d;
  if (kda >= 5) return "text-accent";
  if (kda >= 3) return "text-good";
  if (kda >= 2) return "text-white/75";
  return "text-bad";
}

const REGIONS: Array<{ value: string; label: string }> = [
  { value: "EUW", label: "EUW" },
  { value: "EUNE", label: "EUNE" },
  { value: "NA1", label: "NA" },
  { value: "KR", label: "KR" },
  { value: "BR1", label: "BR" },
  { value: "LAN", label: "LAN" },
  { value: "LAS", label: "LAS" },
  { value: "OCE", label: "OCE" },
  { value: "TR", label: "TR" },
  { value: "RU", label: "RU" },
  { value: "JP1", label: "JP" },
];

export function SummonerLookupView({ db, onClose }: Props) {
  useEscape(onClose);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("EUW");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ScoutData | null>(null);

  async function search() {
    setErr(null);
    setLoading(true);
    setData(null);
    try {
      // Proxy mode: the Cloudflare Worker injects the Riot API key
      // server-side, so the user doesn't need to paste one locally.
      // Direct mode: the user MUST set their own dev key in Settings.
      // We accept either path — only reject if BOTH are missing.
      const cfg = (await loadSettings()) ?? {
        region: "euw1",
        apiKey: "",
        riotIdName: "",
        riotIdTag: "",
        puuid: "",
      };
      const usingProxy = !!getRiotProxyUrl();
      if (!usingProxy && !cfg.apiKey) {
        throw new Error(
          "Necesitas configurar tu Riot API Key en ⚙ para buscar otros jugadores (o un proxy)."
        );
      }
      const account = await getAccountByRiotId(cfg, name.trim(), tag.trim());
      const [summoner, masteries, matchIds] = await Promise.all([
        getSummonerByPuuid(cfg, account.puuid).catch(() => null),
        getTopMasteries(cfg, account.puuid, 7).catch(() => []),
        getRecentMatchIds(cfg, account.puuid, 5).catch(() => []),
      ]);
      // Use puuid-based endpoint — Riot is phasing out the by-summoner one
      // and it returns empty for many regions/accounts now.
      const leagueEntries = await getLeagueEntriesByPuuid(
        cfg,
        account.puuid
      ).catch(() => []);
      const soloq =
        leagueEntries.find((e) => e.queueType === "RANKED_SOLO_5x5") ?? null;

      // Fetch a few recent matches summary. We pull richer per-game
      // detail (CS, separate K/D/A, queueId) so the UI can show form
      // streak, color-code KDA per row, and label queue type.
      const recents = await Promise.all(
        matchIds.slice(0, 7).map(async (id) => {
          try {
            const full = await getMatchFull(cfg, id);
            const me = full.participants.find((p) => p.puuid === account.puuid);
            if (!me) return null;
            return {
              championId: me.championId,
              win: me.win,
              kills: me.kills,
              deaths: me.deaths,
              assists: me.assists,
              cs: me.cs,
              duration: full.durationSec,
              queueId: full.queueId,
            } satisfies RecentMatch;
          } catch {
            return null;
          }
        })
      );

      setData({
        riotId: account.gameName,
        tagLine: account.tagLine,
        puuid: account.puuid,
        level: summoner?.summonerLevel ?? null,
        rank: soloq,
        masteries,
        recentMatches: recents.filter(Boolean) as ScoutData["recentMatches"],
      });
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, true);

  // Derived stats — computed only when we have data. Avg KDA across the
  // visible matches gives the user an instant "form" snapshot, plus a
  // streak count + a recent winrate value the sparkline can plot.
  const matchStats = data
    ? (() => {
        const ms = data.recentMatches;
        if (ms.length === 0) {
          return { recentWR: 0, avgKda: 0, streakKind: null as "W" | "L" | null, streakLen: 0, csPerMin: 0 };
        }
        const wins = ms.filter((m) => m.win).length;
        const recentWR = (wins / ms.length) * 100;
        const totalK = ms.reduce((s, m) => s + m.kills, 0);
        const totalD = ms.reduce((s, m) => s + m.deaths, 0);
        const totalA = ms.reduce((s, m) => s + m.assists, 0);
        const avgKda = totalD === 0 ? totalK + totalA : (totalK + totalA) / totalD;
        // Streak: walk newest → older while win bool stays consistent.
        const first = ms[0]?.win;
        let streakLen = 0;
        for (const m of ms) {
          if (m.win !== first) break;
          streakLen++;
        }
        const totalCs = ms.reduce((s, m) => s + (m.cs ?? 0), 0);
        const totalMin = ms.reduce((s, m) => s + m.duration / 60, 0);
        const csPerMin = totalMin > 0 ? totalCs / totalMin : 0;
        return {
          recentWR,
          avgKda,
          streakKind: (first ? "W" : "L") as "W" | "L",
          streakLen,
          csPerMin,
        };
      })()
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={SUMMONER_TITLE_ID}
      className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg w-[720px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-border-subtle">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-accent" />
              <h2 id={SUMMONER_TITLE_ID} className="text-xl font-bold gold-text">
                Buscar jugador
              </h2>
            </div>
            <span className="text-[10px] uppercase tracking-widest text-white/30">
              Riot ID lookup
            </span>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name && tag && !loading) search();
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre del invocador"
                className="w-full bg-bg-elev/60 pl-8 pr-3 py-2 text-sm rounded-md ring-1 ring-border-subtle focus:ring-accent text-white outline-none transition"
                autoFocus
              />
            </div>
            <span className="self-center text-white/40 font-medium">#</span>
            {/* Free-text tag input — Riot IDs allow ANY alphanumeric
              * tag the player customised (e.g. "004", "1337", "Pepe",
              * "EUW"). A datalist seeds common region tags as
              * autocomplete suggestions without locking the user out
              * of custom tags. Previous dropdown blocked search for
              * anyone with a personalised tag. */}
            <div className="relative">
              <input
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="EUW"
                list="riot-tag-suggestions"
                maxLength={5}
                className="w-24 bg-bg-elev/60 px-3 py-2 text-sm rounded-md ring-1 ring-border-subtle focus:ring-accent text-white outline-none transition uppercase"
                title="Tag del Riot ID — cualquier valor que el jugador haya configurado (3-5 caracteres)"
              />
              <datalist id="riot-tag-suggestions">
                {REGIONS.map((r) => (
                  <option key={r.value} value={r.label} />
                ))}
              </datalist>
            </div>
            <button
              type="submit"
              disabled={loading || !name || !tag}
              className="px-5 py-2 bg-accent text-black font-medium rounded-md text-sm disabled:opacity-50 hover:bg-accent-deep transition shadow-[0_0_12px_rgba(78,205,196,0.3)]"
            >
              {loading ? "..." : "Buscar"}
            </button>
          </form>
          {err && (
            <p className="text-xs text-bad mt-2 bg-bad/10 border border-bad/30 rounded px-2 py-1">
              ⚠ {err}
            </p>
          )}
        </div>

        {/* Result */}
        <div className="overflow-y-auto p-4 space-y-3">
          {!data && !loading && !err && (
            <div className="text-center py-12">
              <User className="w-12 h-12 mx-auto text-white/20 mb-3" />
              <p className="text-sm text-white/60">
                Busca a cualquier jugador por su Riot ID
              </p>
              <p className="text-xs text-white/40 mt-1">
                Necesitas API key Riot configurada en ⚙
              </p>
            </div>
          )}

          {loading && (
            // Layout-stable skeleton: header avatar + 2 lines + 3 stat
            // cards + 4 mastery rows. Mirrors the real `data` block
            // below so the screen doesn't jump when results arrive.
            <div className="space-y-3" aria-busy="true" aria-live="polite">
              <Panel padding="sm">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-14 h-14 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </Panel>
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
              <Panel padding="sm">
                <Skeleton className="h-3 w-32 mb-2" />
                <div className="space-y-2">
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </div>
              </Panel>
            </div>
          )}

          {data && (
            <>
              {/* HERO PROFILE — splash backdrop from the player's most-mastered
                * champion, rank emblem prominent, level + Riot ID, action
                * buttons (copy puuid, op.gg external). The visual identity
                * of the lookup view. */}
              {(() => {
                const heroChamp =
                  data.masteries[0] && db.champions[String(data.masteries[0].championId)];
                const emblem = rankEmblem(data.rank?.tier);
                return (
                  <div
                    className="relative rounded-lg overflow-hidden border border-border-strong"
                    style={{
                      backgroundImage: heroChamp
                        ? `linear-gradient(180deg, rgba(11,14,20,0.55) 0%, rgba(11,14,20,0.92) 70%, rgba(11,14,20,0.98) 100%), url(${heroChamp.splashUrl})`
                        : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center 25%",
                    }}
                  >
                    <div className="p-4 flex items-start gap-4">
                      {/* Rank emblem if ranked, otherwise a User avatar */}
                      <div className="shrink-0 relative">
                        {emblem ? (
                          <img
                            src={emblem}
                            alt={data.rank?.tier ?? ""}
                            className="w-20 h-20 drop-shadow-[0_0_18px_rgba(78,205,196,0.5)]"
                            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                          />
                        ) : (
                          <div className="w-20 h-20 rounded-full bg-bg-card ring-2 ring-accent/40 flex items-center justify-center">
                            <User className="w-9 h-9 text-accent" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-2xl font-bold text-white leading-tight">
                          {data.riotId}
                          <span className="text-white/45 font-normal text-lg ml-1">
                            #{data.tagLine}
                          </span>
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {data.rank ? (
                            <RankBadge
                              tier={data.rank.tier}
                              division={data.rank.rank}
                              lp={data.rank.leaguePoints}
                            />
                          ) : (
                            <span className="text-xs uppercase tracking-widest text-white/45 bg-bg-card/60 px-2 py-0.5 rounded">
                              Unranked
                            </span>
                          )}
                          {data.level !== null && (
                            <span className="text-[10px] uppercase tracking-widest text-white/55 bg-bg-card/40 px-2 py-0.5 rounded">
                              Lvl {data.level}
                            </span>
                          )}
                          {/* Streak chip — flame if winning, frozen if losing */}
                          {matchStats && matchStats.streakLen >= 2 && (
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded font-semibold ${
                                matchStats.streakKind === "W"
                                  ? "bg-orange-400/20 text-orange-300 ring-1 ring-orange-300/40"
                                  : "bg-blue-400/20 text-blue-300 ring-1 ring-blue-300/40"
                              }`}
                              title={matchStats.streakKind === "W" ? "Racha ganadora" : "Racha perdedora"}
                            >
                              <Flame className="w-3 h-3" />
                              {matchStats.streakLen}{matchStats.streakKind}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Action buttons — copy puuid, external op.gg */}
                      <div className="shrink-0 flex flex-col gap-1.5">
                        <CopyPuuidButton puuid={data.puuid} />
                        <a
                          href={(() => {
                            // op.gg URL needs the SERVER region (euw, na,
                            // kr...), not the Riot tag — they're often
                            // different for personalised tags like "004"
                            // or "Pepe". If the user's tag matches a known
                            // region, use it; otherwise fall back to EUW
                            // (most common in our user base). User can
                            // navigate to op.gg manually if the guess
                            // misses.
                            const tagUpper = (tag || "EUW").toUpperCase();
                            const region = REGIONS.some((r) => r.value === tagUpper)
                              ? tagUpper.toLowerCase()
                              : "euw";
                            return `https://www.op.gg/summoners/${region}/${encodeURIComponent(data.riotId)}-${data.tagLine}`;
                          })()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded ring-1 ring-border-subtle bg-bg-card/60 text-white/65 hover:text-accent hover:ring-accent/50 transition"
                          title="Abrir perfil en op.gg"
                        >
                          <ExternalLink className="w-3 h-3" />
                          op.gg
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* SEASON STATS — ranked W/L/WR with mint accent. Always
                * rendered when ranked data exists; CountUp on stats. */}
              {data.rank && (
                <div className="grid grid-cols-4 gap-2">
                  <StatCard value={data.rank.wins} label="Wins" color="good" />
                  <StatCard value={data.rank.losses} label="Losses" color="bad" />
                  <StatCard
                    value={
                      (data.rank.wins / Math.max(1, data.rank.wins + data.rank.losses)) * 100
                    }
                    label="Winrate %"
                    color={
                      data.rank.wins / (data.rank.wins + data.rank.losses) >= 0.55
                        ? "good"
                        : "default"
                    }
                  />
                  <StatCard
                    value={data.rank.wins + data.rank.losses}
                    label="Total"
                  />
                </div>
              )}

              {/* RECENT FORM — strip of W/L pills + avg KDA + sparkline */}
              {data.recentMatches.length > 0 && matchStats && (
                <Panel padding="sm">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase tracking-widest text-accent font-semibold flex items-center gap-1.5">
                      <TrendingUp className="w-3 h-3" />
                      Forma reciente · {data.recentMatches.length}g
                    </p>
                    <p className="text-[10px] text-white/55 tabular-nums">
                      <span className={matchStats.recentWR >= 55 ? "text-good" : matchStats.recentWR >= 45 ? "text-white/70" : "text-bad"}>
                        {matchStats.recentWR.toFixed(0)}% WR
                      </span>
                      <span className="text-white/30 mx-1.5">·</span>
                      <span className={kdaColor(matchStats.avgKda * 1, 0, 0)}>
                        {matchStats.avgKda.toFixed(2)} KDA
                      </span>
                      <span className="text-white/30 mx-1.5">·</span>
                      <span className="text-white/55">
                        {matchStats.csPerMin.toFixed(1)} CS/min
                      </span>
                    </p>
                  </div>
                  {/* W/L pill strip — newest left */}
                  <div className="flex items-center gap-1 mb-2">
                    {data.recentMatches.map((m, i) => (
                      <span
                        key={i}
                        className={`flex-1 text-center text-[10px] font-bold uppercase tracking-widest py-1 rounded ${
                          m.win
                            ? "bg-good/20 text-good ring-1 ring-good/40"
                            : "bg-bad/20 text-bad ring-1 ring-bad/40"
                        }`}
                        title={`${m.win ? "Win" : "Loss"} · ${m.kills}/${m.deaths}/${m.assists}`}
                      >
                        {m.win ? "W" : "L"}
                      </span>
                    ))}
                  </div>
                  {/* Mini KDA sparkline if 3+ matches */}
                  {data.recentMatches.length >= 3 && (
                    <SparkLine
                      data={data.recentMatches
                        .slice()
                        .reverse()
                        .map((m) => (m.deaths === 0 ? m.kills + m.assists : (m.kills + m.assists) / m.deaths))}
                      width={680}
                      height={20}
                      color="rgb(78,205,196)"
                    />
                  )}
                </Panel>
              )}

              {/* Top masteries — same grid but mint highlights */}
              {data.masteries.length > 0 && (
                <Panel padding="sm">
                  <PanelHeader
                    icon={<Star className="w-3 h-3" />}
                    title="Top maestrías"
                  />
                  <div className="grid grid-cols-7 gap-1.5">
                    {data.masteries.slice(0, 7).map((m) => {
                      const c = db.champions[String(m.championId)];
                      if (!c) return null;
                      return (
                        <div
                          key={m.championId}
                          className="flex flex-col items-center"
                          title={`${c.name} · M${m.championLevel} · ${Math.round(m.championPoints / 1000)}k pts`}
                        >
                          <div className="relative">
                            <img
                              src={c.iconUrl}
                              alt={c.name}
                              className="w-11 h-11 rounded ring-1 ring-border-subtle"
                            />
                            <span
                              className={`absolute -top-1.5 -right-1.5 text-[9px] font-bold px-1 rounded ring-1 ${
                                m.championLevel >= 10
                                  ? "bg-accent text-black ring-accent shadow-[0_0_6px_rgba(78,205,196,0.5)]"
                                  : m.championLevel >= 7
                                    ? "bg-accent/30 text-accent ring-accent/40"
                                    : "bg-bg-elev text-white/55 ring-border-subtle"
                              }`}
                            >
                              M{m.championLevel}
                            </span>
                          </div>
                          <p className="text-[9px] text-white/55 mt-1 tabular-nums">
                            {Math.round(m.championPoints / 1000)}k
                          </p>
                          <p className="text-[9px] text-white/40 truncate max-w-full">
                            {c.name}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              )}

              {/* Recent matches — richer per-row layout */}
              {data.recentMatches.length > 0 && (
                <Panel padding="sm">
                  <PanelHeader
                    icon={<Swords className="w-3 h-3" />}
                    title="Últimas partidas"
                  />
                  <div className="space-y-1">
                    {data.recentMatches.map((m, i) => {
                      const c = db.champions[String(m.championId)];
                      const kdaC = kdaColor(m.kills, m.deaths, m.assists);
                      const csm = m.duration > 0 ? (m.cs / (m.duration / 60)).toFixed(1) : "—";
                      const kdaVal = m.deaths === 0
                        ? m.kills + m.assists
                        : ((m.kills + m.assists) / m.deaths);
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-2.5 p-2 rounded ring-1 ${
                            m.win
                              ? "ring-good/30 bg-good/5"
                              : "ring-bad/30 bg-bad/5"
                          }`}
                        >
                          <div className={`w-1 h-10 rounded-full ${m.win ? "bg-good" : "bg-bad"}`} />
                          {c && (
                            <img
                              src={c.iconUrl}
                              alt={c.name}
                              className="w-9 h-9 rounded ring-1 ring-border-subtle"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <p className="text-sm text-white font-medium truncate">
                                {c?.name ?? `#${m.championId}`}
                              </p>
                              <span className="text-[9px] uppercase tracking-widest text-white/35">
                                {Math.round(m.duration / 60)}min
                              </span>
                            </div>
                            <div className="flex items-baseline gap-2 text-[11px]">
                              <span className={`tabular-nums font-medium ${kdaC}`}>
                                {m.kills}/{m.deaths}/{m.assists}
                              </span>
                              <span className="text-white/35 tabular-nums">
                                {kdaVal.toFixed(2)} KDA
                              </span>
                              <span className="text-white/35 tabular-nums">
                                {csm} CS/min
                              </span>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${
                              m.win
                                ? "bg-good/20 text-good ring-1 ring-good/40"
                                : "bg-bad/20 text-bad ring-1 ring-bad/40"
                            }`}
                          >
                            {m.win ? "Win" : "Loss"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              )}

              {/* Empty state for unranked + no matches */}
              {!data.rank && data.masteries.length === 0 && data.recentMatches.length === 0 && (
                <p className="text-center text-white/40 text-sm py-4">
                  Sin datos públicos disponibles para este jugador.
                </p>
              )}
              <p className="text-center text-white/30 text-[10px] mt-2">
                <Trophy className="w-3 h-3 inline mr-1" />
                Datos vía Riot API · públicos
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Copy-to-clipboard button for the player's PUUID. Useful when the user
 * wants to feed the ID into another tool (Porofessor, league of graphs,
 * Riot dev portal). Visual feedback flips to "Copiado!" for 1.5s after
 * click before reverting.
 */
function CopyPuuidButton({ puuid }: { puuid: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(puuid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard refused — silent */
    }
  };
  return (
    <button
      onClick={handle}
      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded ring-1 ring-border-subtle bg-bg-card/60 text-white/65 hover:text-accent hover:ring-accent/50 transition"
      title="Copia el PUUID al portapapeles"
    >
      {copied ? (
        <>
          <Check className="w-3 h-3" />
          OK
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          PUUID
        </>
      )}
    </button>
  );
}
