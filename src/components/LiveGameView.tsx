// Live game inspector — uses Spectator V5 API to show the current match
// (your team vs enemy team) WHILE you're loading or playing. Auto-refreshes.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChampionDb } from "../types/champion";
import {
  getCurrentGameByPuuid,
  getRiotProxyUrl,
  type CurrentGameInfo,
  type CurrentGameParticipant,
} from "../services/riotApi";
import { loadSettings } from "../services/settingsRepo";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import { Panel, PanelHeader } from "./ui/Panel";
import { Radio, Swords, Clock, RefreshCw } from "lucide-react";

interface Props {
  db: ChampionDb;
  onClose: () => void;
}

export function LiveGameView({ db, onClose }: Props) {
  const { t } = useTranslation();
  useEscape(onClose);
  const [game, setGame] = useState<CurrentGameInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(0);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const cfg = await loadSettings();
      const usingProxy = !!getRiotProxyUrl();
      // PUUID always required (identifies WHICH user to query). API key
      // only needed in direct mode — proxy injects it server-side.
      if (!cfg?.puuid) {
        setErr(t("liveView.needRiotId"));
        setLoading(false);
        return;
      }
      if (!usingProxy && !cfg.apiKey) {
        setErr(t("liveView.needApiKey"));
        setLoading(false);
        return;
      }
      const g = await getCurrentGameByPuuid(cfg, cfg.puuid);
      setGame(g);
      setLastRefresh(Date.now());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Auto-refresh every 30s while modal is open
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const champById = (id: number) => {
    for (const c of Object.values(db.champions)) {
      if (Number(c.key) === id) return c;
    }
    return null;
  };

  const team100 = game?.participants.filter((p) => p.teamId === 100) ?? [];
  const team200 = game?.participants.filter((p) => p.teamId === 200) ?? [];
  const elapsedMin = game ? Math.max(0, Math.floor(game.gameLength / 60)) : 0;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg w-[760px] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-bad animate-pulse" />
            <h2 className="text-xl font-bold gold-text">{t("liveView.title")}</h2>
            {game && (
              <span className="ml-2 text-[10px] uppercase tracking-widest text-white/50 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> {elapsedMin} min
              </span>
            )}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="text-xs text-white/55 hover:text-accent inline-flex items-center gap-1 disabled:opacity-40"
            title={t("liveView.refresh")}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            {lastRefresh
              ? t("liveView.updated", { s: Math.floor((Date.now() - lastRefresh) / 1000) })
              : t("liveView.refreshShort")}
          </button>
        </div>

        <div className="overflow-y-auto p-4 flex-1 space-y-3">
          {loading && !game && (
            <p className="text-white/50 text-sm text-center py-8">
              {t("liveView.searching")}
            </p>
          )}
          {err && (
            <Panel padding="sm">
              <p className="text-sm text-bad">{err}</p>
            </Panel>
          )}
          {!loading && !err && !game && (
            <Panel padding="sm">
              <p className="text-sm text-white/70 text-center py-4">
                {t("liveView.notInGame")}
              </p>
            </Panel>
          )}

          {game && (
            <>
              <Panel padding="sm">
                <PanelHeader
                  icon={<Swords className="w-3 h-3" />}
                  title={t("liveView.blueTeam")}
                  subtitle={`${team100.length}`}
                />
                <div className="grid grid-cols-1 gap-1.5">
                  {team100.map((p) => (
                    <ParticipantRow
                      key={p.puuid}
                      p={p}
                      champ={champById(p.championId)}
                    />
                  ))}
                </div>
              </Panel>

              <Panel padding="sm">
                <PanelHeader
                  icon={<Swords className="w-3 h-3 text-bad" />}
                  title={t("liveView.redTeam")}
                  subtitle={`${team200.length}`}
                />
                <div className="grid grid-cols-1 gap-1.5">
                  {team200.map((p) => (
                    <ParticipantRow
                      key={p.puuid}
                      p={p}
                      champ={champById(p.championId)}
                    />
                  ))}
                </div>
              </Panel>

              <p className="text-[10px] uppercase tracking-widest text-white/30 text-center">
                Queue {game.gameQueueConfigId} · Map {game.mapId} ·{" "}
                {game.gameMode}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ParticipantRow({
  p,
  champ,
}: {
  p: CurrentGameParticipant;
  champ: ChampionDb["champions"][string] | null;
}) {
  return (
    <div className="flex items-center gap-2 p-1.5 rounded ring-1 ring-border-subtle bg-bg-card/40">
      {champ ? (
        <img
          src={champ.iconUrl}
          alt={champ.name}
          className="w-8 h-8 rounded ring-1 ring-border-subtle"
        />
      ) : (
        <div className="w-8 h-8 rounded bg-white/5" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white truncate">
          {champ?.name ?? `#${p.championId}`}
        </p>
        <p className="text-[10px] text-white/45 truncate">
          {p.riotId ?? p.puuid.slice(0, 8)}
        </p>
      </div>
      <div className="flex gap-0.5 text-[10px] text-white/40 tabular-nums">
        <span title="Spell 1">D{p.spell1Id}</span>
        <span title="Spell 2">F{p.spell2Id}</span>
      </div>
    </div>
  );
}
