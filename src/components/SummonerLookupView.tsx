// Public summoner lookup. Search any Riot ID (Name#TAG) and see their profile.

import { useState } from "react";
import {
  getAccountByRiotId,
  getSummonerByPuuid,
  getLeagueEntriesByPuuid,
  getTopMasteries,
  getRecentMatchIds,
  getMatchFull,
  type ChampionMasteryDto,
  type LeagueEntryDto,
} from "../services/riotApi";
import { loadSettings } from "../services/settingsRepo";
import type { ChampionDb } from "../types/champion";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import { Panel, PanelHeader } from "./ui/Panel";
import { RankBadge } from "./ui/RankBadge";
import { StatCard } from "./ui/StatCard";
import { Search, User, Trophy, Star, Swords } from "lucide-react";

interface Props {
  db: ChampionDb;
  onClose: () => void;
}

interface ScoutData {
  riotId: string;
  tagLine: string;
  puuid: string;
  level: number | null;
  rank: LeagueEntryDto | null;
  masteries: ChampionMasteryDto[];
  recentMatches: Array<{
    championId: number;
    win: boolean;
    kda: string;
    duration: number;
  }>;
}

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
      const cfg = await loadSettings();
      if (!cfg?.apiKey) {
        throw new Error(
          "Necesitas configurar tu Riot API Key en ⚙ para buscar otros jugadores."
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

      // Fetch a few recent matches summary
      const recents = await Promise.all(
        matchIds.slice(0, 5).map(async (id) => {
          try {
            const full = await getMatchFull(cfg, id);
            const me = full.participants.find((p) => p.puuid === account.puuid);
            if (!me) return null;
            return {
              championId: me.championId,
              win: me.win,
              kda: `${me.kills}/${me.deaths}/${me.assists}`,
              duration: full.durationSec,
            };
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

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg w-[680px] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-accent" />
            <h2 className="text-xl font-bold gold-text">Buscar jugador</h2>
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
            <span className="self-center text-white/40">#</span>
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value.toUpperCase())}
              placeholder="EUW"
              className="w-24 bg-bg-elev/60 px-3 py-2 text-sm rounded-md ring-1 ring-border-subtle focus:ring-accent text-white outline-none transition"
            />
            <button
              type="submit"
              disabled={loading || !name || !tag}
              className="px-4 py-2 bg-accent text-black font-medium rounded-md text-sm disabled:opacity-50"
            >
              {loading ? "..." : "Buscar"}
            </button>
          </form>
          {err && (
            <p className="text-xs text-bad mt-2">{err}</p>
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
            <p className="text-white/40 text-sm text-center py-8">
              Cargando perfil...
            </p>
          )}

          {data && (
            <>
              {/* Profile card */}
              <Panel padding="sm">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-bg-card ring-2 ring-accent/40 flex items-center justify-center">
                    <User className="w-6 h-6 text-accent" />
                  </div>
                  <div className="flex-1">
                    <p className="text-lg font-bold text-white">
                      {data.riotId}
                      <span className="text-white/40 font-normal text-base">
                        #{data.tagLine}
                      </span>
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {data.rank ? (
                        <RankBadge
                          tier={data.rank.tier}
                          division={data.rank.rank}
                          lp={data.rank.leaguePoints}
                        />
                      ) : (
                        <span className="text-xs text-white/40">Sin clasificar</span>
                      )}
                      {data.level !== null && (
                        <span className="text-[10px] uppercase tracking-widest text-white/40">
                          Lvl {data.level}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Panel>

              {/* Stats summary if ranked */}
              {data.rank && (
                <div className="grid grid-cols-3 gap-2">
                  <StatCard
                    value={`${data.rank.wins}`}
                    label="Wins"
                    color="good"
                  />
                  <StatCard
                    value={`${data.rank.losses}`}
                    label="Losses"
                    color="bad"
                  />
                  <StatCard
                    value={`${(
                      (data.rank.wins / Math.max(1, data.rank.wins + data.rank.losses)) *
                      100
                    ).toFixed(0)}%`}
                    label="Winrate"
                    color={
                      data.rank.wins / (data.rank.wins + data.rank.losses) >= 0.55
                        ? "good"
                        : "default"
                    }
                  />
                </div>
              )}

              {/* Top masteries */}
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
                              className="w-10 h-10 rounded ring-1 ring-border-subtle"
                            />
                            <span
                              className={`absolute -top-1 -right-1 text-[8px] font-bold px-1 rounded ${
                                m.championLevel >= 10
                                  ? "bg-accent text-black"
                                  : "bg-bg-elev text-accent ring-1 ring-accent/40"
                              }`}
                            >
                              M{m.championLevel}
                            </span>
                          </div>
                          <p className="text-[9px] text-white/55 mt-1 tabular-nums">
                            {Math.round(m.championPoints / 1000)}k
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              )}

              {/* Recent matches */}
              {data.recentMatches.length > 0 && (
                <Panel padding="sm">
                  <PanelHeader
                    icon={<Swords className="w-3 h-3" />}
                    title="Últimas partidas"
                  />
                  <div className="space-y-1">
                    {data.recentMatches.map((m, i) => {
                      const c = db.champions[String(m.championId)];
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-2 p-1.5 rounded ring-1 ${
                            m.win
                              ? "ring-good/30 bg-good/5"
                              : "ring-bad/30 bg-bad/5"
                          }`}
                        >
                          {c && (
                            <img
                              src={c.iconUrl}
                              alt={c.name}
                              className="w-7 h-7 rounded"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white truncate">
                              {c?.name ?? `#${m.championId}`}
                            </p>
                            <p className="text-[10px] text-white/45 tabular-nums">
                              {m.kda} · {Math.round(m.duration / 60)}min
                            </p>
                          </div>
                          <span
                            className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
                              m.win
                                ? "bg-good/15 text-good"
                                : "bg-bad/15 text-bad"
                            }`}
                          >
                            {m.win ? "W" : "L"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              )}

              {/* Empty state for unranked + no matches */}
              {!data.rank && data.masteries.length === 0 && (
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
