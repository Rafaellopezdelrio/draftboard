// The simple in-game screen: what to do right now, what to buy next and which
// enemies to watch — one glance each. The full live panel stays behind "more
// details". Everything comes from Riot's official Live Client snapshot.

import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ChampionDb, Role } from "../types/champion";
import { useLiveGame, useLiveGameTime } from "../hooks/useLiveGame";
import {
  attributeObjectives,
  findMyPlayer,
  liveChampionKey,
  type LiveGamePlayer,
} from "../services/liveClient";
import { deriveTimers, formatTime, SUMMONERS_RIFT_MAP } from "../services/liveTimers";
import { coachLiveGame, type LiveCoachSeverity } from "../engine/liveCoachEngine";
import { suggestInGameAdaptations } from "../engine/inGameAdapter";
import { suggestBuildAdaptations } from "../engine/adaptiveBuildEngine";
import { getPowerSpikes } from "../data/powerSpikes";
import { setOverlayVisible } from "../services/overlay";
import { usePrefsStore } from "../state/prefsStore";
import { LiveVoice } from "./LiveGamePanel";
import { MatchupBuildCard } from "./build/MatchupBuildCard";
import { ItemIcon } from "./build/icons";

interface Props {
  db: ChampionDb;
  buildChampionKey: string | null;
  buildRole: Role | null;
  enemyKeys: string[];
  noLaneMode: boolean;
  onShowDetails: () => void;
}

const CARD = "rounded-2xl bg-bg-elev/60 border border-border-subtle p-4 flex flex-col gap-3 min-w-0";
const STEP = "text-[11px] uppercase tracking-[0.14em] text-accent font-bold";
const SEVERITY_ORDER: LiveCoachSeverity[] = ["critical", "warn", "good", "info"];
/** Unspent gold worth a trip to the shop. */
const GOLD_TO_SHOP = 1000;
/** Kills minus deaths at which an enemy counts as fed (or, negated, as weak). */
const SNOWBALL_GAP = 3;

export type RivalTone = "danger" | "watch" | "weak";
export interface Rival {
  player: LiveGamePlayer;
  tone: RivalTone;
}

/** The enemies worth a line: everyone fed, their jungler, and the weakest one. */
export function pickRivals(enemies: LiveGamePlayer[]): Rival[] {
  const gap = (p: LiveGamePlayer) => p.scores.kills - p.scores.deaths;
  const fed = enemies.filter((p) => gap(p) >= SNOWBALL_GAP).sort((a, b) => gap(b) - gap(a));
  const jungler = enemies.find((p) => p.position === "JUNGLE" && !fed.includes(p));
  const weakest = enemies
    .filter((p) => gap(p) <= -SNOWBALL_GAP && p !== jungler)
    .sort((a, b) => gap(a) - gap(b))[0];
  return [
    ...fed.map((player) => ({ player, tone: "danger" as const })),
    ...(jungler ? [{ player: jungler, tone: "watch" as const }] : []),
    ...(weakest ? [{ player: weakest, tone: "weak" as const }] : []),
  ].slice(0, 4);
}

const LANES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
/** Rough gold a minion is worth, to fold farm into the lead. */
const GOLD_PER_CS = 20;

/** Approximate gold a player has turned into items and farm. The Live Client
 * has no gold totals for other players, so this is items bought + farm. */
export function goldValue(p: LiveGamePlayer): number {
  const items = p.items.reduce((sum, it) => sum + (it.price ?? 0) * (it.count || 1), 0);
  return items + p.scores.creepScore * GOLD_PER_CS;
}

/** Per-lane lead (mine minus theirs) for every lane both teams fill. */
export function laneLeads(
  allies: LiveGamePlayer[],
  enemies: LiveGamePlayer[]
): Array<{ lane: (typeof LANES)[number]; ally: LiveGamePlayer; enemy: LiveGamePlayer; lead: number }> {
  return LANES.flatMap((lane) => {
    const ally = allies.find((p) => p.position === lane);
    const enemy = enemies.find((p) => p.position === lane);
    return ally && enemy ? [{ lane, ally, enemy, lead: goldValue(ally) - goldValue(enemy) }] : [];
  });
}

const TONE_CLASS: Record<RivalTone, string> = {
  danger: "bg-bad/15 text-bad",
  watch: "bg-meh/15 text-meh",
  weak: "bg-good/15 text-good",
};

export function SimpleLiveView({ db, buildChampionKey, buildRole, enemyKeys, noLaneMode, onShowDetails }: Props) {
  const { t } = useTranslation();
  const liveState = useLiveGame(true);
  const { inGame, snapshot } = liveState;
  const gameTime = useLiveGameTime(liveState);
  const showOverlay = usePrefsStore((s) => s.prefs.showInGameOverlay);

  // Same opt-in overlay switch the full live panel drives; this screen replaces
  // that panel, so it has to keep the overlay in step too.
  useEffect(() => {
    void setOverlayVisible(inGame && showOverlay);
  }, [inGame, showOverlay]);

  const control = useMemo(
    () => (snapshot ? attributeObjectives(snapshot.events, snapshot.allPlayers) : null),
    [snapshot]
  );
  const timers = useMemo(
    () =>
      snapshot
        ? deriveTimers(snapshot.events, snapshot.gameData.gameTime, {
            mapNumber: snapshot.gameData.mapNumber,
            dragonsByTeam: control?.dragonsByTeam ?? null,
          })
        : null,
    [snapshot, control]
  );

  const buildChamp = buildChampionKey ? db.champions[buildChampionKey] : undefined;
  const adaptations = useMemo(
    () => (buildChamp ? suggestBuildAdaptations({ db, champion: buildChamp, enemyKeys }) : []),
    [db, buildChamp, enemyKeys]
  );

  const moreDetails = (
    <button
      type="button"
      onClick={onShowDetails}
      className="ml-auto text-xs text-white/60 hover:text-white border border-dashed border-border-strong rounded-full px-4 py-1.5 transition"
    >
      {t("simple.moreDetails")}
    </button>
  );

  if (!inGame || !snapshot) {
    return (
      <div className="space-y-4" data-testid="simple-live">
        <section className={`${CARD} border-accent/40`}>
          <p className={STEP}>{t("simpleLive.nowStep")}</p>
          <h2 className="text-2xl font-bold text-white">{t("simpleLive.loading")}</h2>
          <p className="text-sm text-white/60">{t("simpleLive.loadingHint")}</p>
        </section>
        <div className="flex">{moreDetails}</div>
      </div>
    );
  }

  const me = snapshot.activePlayer;
  const myRecord = findMyPlayer(me, snapshot.allPlayers);
  const myTeam = myRecord?.team ?? "ORDER";
  const enemies = snapshot.allPlayers.filter((p) => p.team !== myTeam);
  const laneOpponent =
    enemies.find((p) => myRecord?.position && p.position === myRecord.position) ?? null;
  const myChampKey = myRecord ? liveChampionKey(db, myRecord) : null;
  const myChamp = myChampKey ? db.champions[myChampKey] : null;
  const gold = Math.floor(me?.currentGold ?? 0);

  const insights = coachLiveGame({
    me: myRecord,
    laneOpponent,
    gameTime,
    nextDragonAt: timers?.nextDragonAt ?? null,
    nextBaronAt: timers?.nextBaronAt ?? null,
    currentGold: gold,
    myTeam,
    dragonsByTeam: control?.dragonsByTeam ?? null,
    lastBaronTeam: control?.lastBaronTeam ?? null,
    lastBaronAt: control?.lastBaronAt ?? null,
    myHpPct:
      me?.championStats && me.championStats.maxHealth > 0
        ? me.championStats.currentHealth / me.championStats.maxHealth
        : null,
    spikeProfile: myChamp ? getPowerSpikes(myChamp.id) : null,
    isRift: snapshot.gameData.mapNumber === SUMMONERS_RIFT_MAP,
  });
  const ranked = [...insights].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );
  const [headline, second] = ranked;
  // Plain-language twin of each coach line; falls back to the coach text.
  const say = (i: { textKey: string; params?: Record<string, string | number> }) =>
    t(i.textKey.replace("liveCoach.", "simpleLive.coach."), {
      ...i.params,
      defaultValue: t(i.textKey, i.params),
    });

  const counters = myChamp
    ? suggestInGameAdaptations({
        champion: myChamp,
        enemyPlayers: enemies,
        gameTime,
        myItems: myRecord?.items ?? [],
      }).slice(0, 2)
    : [];

  const laneOpponentKey = laneOpponent ? liveChampionKey(db, laneOpponent) : null;
  const rivals = pickRivals(enemies);
  const leads = laneLeads(
    snapshot.allPlayers.filter((p) => p.team === myTeam),
    enemies
  );
  const countdown = (at: number | null | undefined) =>
    at == null ? null : at - gameTime <= 0 ? t("simpleLive.timerNow") : formatTime(at - gameTime);
  const dragon = countdown(timers?.nextDragonAt);
  const baron = countdown(timers?.nextBaronAt);

  return (
    <div className="space-y-4" data-testid="simple-live">
      <LiveVoice insights={insights} />
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr_1fr] gap-4">
        <section className={`${CARD} border-accent/40`} aria-label={t("simpleLive.nowStep")}>
          <p className={STEP}>
            {t("simpleLive.nowStep")} · {t("simpleLive.minute", { time: formatTime(gameTime) })}
          </p>
          <h2
            className={`text-2xl font-bold leading-snug ${
              headline?.severity === "critical" ? "text-bad" : "text-white"
            }`}
          >
            {headline ? say(headline) : t("simpleLive.calm")}
          </h2>
          {second && <p className="text-sm text-white/65">{say(second)}</p>}
          {(dragon || baron) && (
            <div className="flex gap-8 mt-auto pt-4">
              {dragon && (
                <div>
                  <p className="text-xs text-white/50">{t("simpleLive.dragon")}</p>
                  <p className="text-3xl font-bold text-accent tabular-nums">{dragon}</p>
                </div>
              )}
              {baron && (
                <div>
                  <p className="text-xs text-white/50">{t("simpleLive.baron")}</p>
                  <p className="text-3xl font-bold text-white/60 tabular-nums">{baron}</p>
                </div>
              )}
            </div>
          )}
        </section>

        <section className={CARD} aria-label={t("simpleLive.buyTitle")}>
          <p className={STEP}>{t("simple.buyTitle")}</p>
          <h2 className="text-xl font-bold text-white">{t("simpleLive.buyTitle")}</h2>
          {counters.map((s) => (
            <div
              key={s.key}
              className="flex items-center gap-3 p-2.5 rounded-xl border bg-bg/60 border-border-subtle"
            >
              <ItemIcon patch={db.patch} id={s.itemId} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white leading-tight">{s.itemName}</p>
                <p className="text-xs text-white/60 leading-snug">{s.reason}</p>
              </div>
            </div>
          ))}
          {buildChamp && buildRole && !noLaneMode && (
            <MatchupBuildCard
              db={db}
              championDdId={buildChamp.id}
              role={buildRole}
              enemyKeys={enemyKeys}
              adaptations={adaptations}
              knownOpponentKey={laneOpponentKey}
            />
          )}
          <p className="text-xs text-white/60 mt-auto">
            {gold >= GOLD_TO_SHOP
              ? t("simpleLive.goldShop", { gold })
              : t("simpleLive.gold", { gold })}
          </p>
        </section>

        <section className={CARD} aria-label={t("simpleLive.rivalsTitle")}>
          <p className={STEP}>{t("simpleLive.rivalsStep")}</p>
          <h2 className="text-xl font-bold text-white">{t("simpleLive.rivalsTitle")}</h2>
          {rivals.length === 0 ? (
            <p className="text-xs text-white/45">{t("simpleLive.rivalsEmpty")}</p>
          ) : (
            rivals.map(({ player, tone }) => {
              const key = liveChampionKey(db, player);
              const champ = key ? db.champions[key] : undefined;
              return (
                <div
                  key={`${player.team}-${player.championName}`}
                  className="flex items-center gap-3 p-2.5 rounded-xl border bg-bg/60 border-border-subtle"
                >
                  {champ && <img src={champ.iconUrl} alt="" className="w-11 h-11 rounded-lg shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white leading-tight">
                      {champ?.name ?? player.championName}
                    </p>
                    <p className="text-xs text-white/60 leading-snug">
                      {t(`simpleLive.rival.${tone}`, {
                        k: player.scores.kills,
                        d: player.scores.deaths,
                      })}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${TONE_CLASS[tone]}`}>
                    {t(`simpleLive.tag.${tone}`)}
                  </span>
                </div>
              );
            })
          )}
        </section>
      </div>

      {leads.length > 0 && !noLaneMode && (
        <section className={CARD} aria-label={t("simpleLive.lanesTitle")} data-testid="simple-lanes">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-base font-bold text-white">{t("simpleLive.lanesTitle")}</h2>
            <span className="text-[11px] text-white/45">{t("simpleLive.lanesHint")}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {leads.map(({ lane, ally, enemy, lead }) => {
              const a = liveChampionKey(db, ally);
              const e = liveChampionKey(db, enemy);
              const even = Math.abs(lead) < 300;
              const k = Math.round(Math.abs(lead) / 100) / 10;
              return (
                <div key={lane} className="rounded-xl bg-bg/60 border border-border-subtle p-2.5 space-y-1">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">{t(`simpleLive.lane.${lane}`)}</p>
                  <div className="flex items-center gap-1.5">
                    {a && <img src={db.champions[a]?.iconUrl} alt="" className="w-7 h-7 rounded-md" />}
                    <span className="text-[10px] text-white/35">vs</span>
                    {e && <img src={db.champions[e]?.iconUrl} alt="" className="w-7 h-7 rounded-md" />}
                  </div>
                  <p
                    className={`text-xs font-semibold ${even ? "text-white/60" : lead > 0 ? "text-good" : "text-bad"}`}
                  >
                    {even
                      ? t("simpleLive.laneEven")
                      : t(lead > 0 ? "simpleLive.laneAhead" : "simpleLive.laneBehind", { k })}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex items-center gap-2 flex-wrap rounded-xl bg-bg-elev/60 border border-border-subtle px-3 py-2">
        <span className="text-xs text-white/50">{t("simpleLive.voiceNote")}</span>
        {moreDetails}
      </div>
    </div>
  );
}
