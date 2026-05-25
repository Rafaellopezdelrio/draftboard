// Pro players watchlist — view their last games and what they're playing.

import { useEffect, useState } from "react";
import {
  getAccountByRiotId,
  getRecentMatchIds,
  getMatchFull,
  type RiotConfig,
} from "../services/riotApi";
import { loadSettings } from "../services/settingsRepo";
import type { ChampionDb } from "../types/champion";
import { PRO_PLAYERS, type ProPlayer } from "../data/proPlayers";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useRef } from "react";

const PROPLAYERS_TITLE_ID = "proplayers-view-title";
import { Tabs } from "./ui/Tabs";
import { Panel } from "./ui/Panel";
import { Trophy, ExternalLink, RefreshCw } from "lucide-react";
import { Skeleton } from "./ui/Skeleton";

interface Props {
  db: ChampionDb;
  onClose: () => void;
}

interface ProPlayerData {
  player: ProPlayer;
  lastMatches: Array<{
    championId: number;
    win: boolean;
    kda: string;
    durationMin: number;
    queueId: number;
  }>;
  loading?: boolean;
  error?: string;
}

type RegionTab = "ALL" | "kr" | "euw1" | "na1";

export function ProPlayersView({ db, onClose }: Props) {
  useEscape(onClose);
  const [region, setRegion] = useState<RegionTab>("ALL");
  const [data, setData] = useState<Record<string, ProPlayerData>>({});
  const [cfg, setCfg] = useState<RiotConfig | null>(null);

  useEffect(() => {
    loadSettings().then((s) => setCfg(s ?? null));
  }, []);

  const visiblePlayers = PRO_PLAYERS.filter(
    (p) => region === "ALL" || p.region === region
  );

  async function loadPlayer(p: ProPlayer) {
    if (!cfg?.apiKey) return;
    setData((d) => ({ ...d, [p.name]: { player: p, lastMatches: [], loading: true } }));
    try {
      const playerCfg: RiotConfig = {
        apiKey: cfg.apiKey,
        region: p.region,
        riotIdName: p.riotIdName,
        riotIdTag: p.riotIdTag,
      };
      const account = await getAccountByRiotId(playerCfg, p.riotIdName, p.riotIdTag);
      const ids = await getRecentMatchIds(playerCfg, account.puuid, 3);
      const matches = await Promise.all(
        ids.slice(0, 3).map(async (id) => {
          const full = await getMatchFull(playerCfg, id);
          const me = full.participants.find((x) => x.puuid === account.puuid);
          if (!me) return null;
          return {
            championId: me.championId,
            win: me.win,
            kda: `${me.kills}/${me.deaths}/${me.assists}`,
            durationMin: full.durationSec / 60,
            queueId: full.queueId,
          };
        })
      );
      setData((d) => ({
        ...d,
        [p.name]: {
          player: p,
          lastMatches: matches.filter(Boolean) as ProPlayerData["lastMatches"],
        },
      }));
    } catch (e) {
      setData((d) => ({
        ...d,
        [p.name]: { player: p, lastMatches: [], error: String(e).slice(0, 80) },
      }));
    }
  }

  async function loadAllVisible() {
    for (const p of visiblePlayers) {
      // sequential to avoid rate limits
      await loadPlayer(p);
    }
  }

  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, true);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={PROPLAYERS_TITLE_ID}
      className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg w-[760px] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-2 border-b border-border-subtle">
          <div className="flex items-center justify-between mb-3">
            <h2 id={PROPLAYERS_TITLE_ID} className="text-xl font-bold gold-text flex items-center gap-2">
              <Trophy className="w-5 h-5 text-accent" />
              Pro Players
            </h2>
            <button
              onClick={loadAllVisible}
              disabled={!cfg?.apiKey}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/15 text-accent rounded-md ring-1 ring-accent/40 hover:bg-accent/25 disabled:opacity-50 transition"
            >
              <RefreshCw className="w-3 h-3" />
              Cargar todos
            </button>
          </div>
          <Tabs<RegionTab>
            tabs={[
              { value: "ALL", label: "Todos" },
              { value: "kr", label: "LCK" },
              { value: "euw1", label: "LEC" },
              { value: "na1", label: "LCS" },
            ]}
            active={region}
            onChange={setRegion}
          />
        </div>

        <div className="overflow-y-auto p-4 space-y-2">
          {!cfg?.apiKey && (
            <div className="text-center py-8">
              <p className="text-sm text-white/70 mb-2">
                Necesitas API key Riot configurada en ⚙
              </p>
              <p className="text-xs text-white/40">
                (datos públicos, solo para mostrar partidas pro)
              </p>
            </div>
          )}

          {cfg?.apiKey && visiblePlayers.map((p) => {
            const d = data[p.name];
            return (
              <Panel key={p.name} padding="sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-bg-card ring-1 ring-accent/40 flex items-center justify-center font-bold text-accent">
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className="font-semibold text-white">{p.name}</p>
                      <span className="text-[10px] uppercase tracking-widest text-accent">
                        {p.team}
                      </span>
                      <span className="text-[10px] text-white/40">{p.role}</span>
                    </div>
                    <p className="text-[11px] text-white/45 truncate">
                      {p.riotIdName}#{p.riotIdTag} · {p.region.toUpperCase()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {p.twitch && (
                      <a
                        href={`https://twitch.tv/${p.twitch}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-purple-400 hover:text-purple-300 inline-flex items-center gap-1 px-2 py-1 rounded ring-1 ring-purple-400/40 hover:bg-purple-400/10 transition"
                      >
                        <ExternalLink className="w-3 h-3" />
                        twitch
                      </a>
                    )}
                    {!d && (
                      <button
                        onClick={() => loadPlayer(p)}
                        className="text-[10px] text-white/55 hover:text-white px-2 py-1 rounded ring-1 ring-border-subtle hover:ring-accent/60 transition"
                      >
                        Cargar
                      </button>
                    )}
                    {d?.loading && (
                      <span className="text-[10px] text-white/40">cargando...</span>
                    )}
                  </div>
                </div>

                {d?.error && (
                  <p className="text-[10px] text-bad mt-2">{d.error}</p>
                )}

                {d?.loading && (
                  // Champion icon row skeleton matches the real
                  // `lastMatches` shape (5 small champ icons).
                  <div className="flex gap-1.5 mt-2" aria-busy="true">
                    {Array.from({ length: 5 }).map((_, k) => (
                      <Skeleton key={k} className="w-8 h-8 rounded" />
                    ))}
                  </div>
                )}

                {d?.lastMatches && d.lastMatches.length > 0 && (
                  <div className="flex gap-1.5 mt-2">
                    {d.lastMatches.map((m, i) => {
                      const c = db.champions[String(m.championId)];
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded ring-1 text-[10px] ${
                            m.win
                              ? "ring-good/40 bg-good/5"
                              : "ring-bad/40 bg-bad/5"
                          }`}
                          title={`${c?.name ?? "?"} · ${m.kda} · ${Math.round(m.durationMin)}min`}
                        >
                          {c && (
                            <img
                              src={c.iconUrl}
                              alt={c.name}
                              className="w-5 h-5 rounded"
                            />
                          )}
                          <span className="text-white/85 tabular-nums">{m.kda}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>

        <div className="px-4 py-2 border-t border-border-subtle text-[10px] uppercase tracking-widest text-white/40">
          {visiblePlayers.length} pro players · datos públicos vía Riot API
        </div>
      </div>
    </div>
  );
}
