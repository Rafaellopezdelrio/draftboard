// Live game overlay panel — shows when a real LoL match is in progress.
//
// Reads from useLiveGame (Riot's localhost:2999 API) and derives:
//   - Current game time formatted MM:SS
//   - Team scores (kills) — order vs chaos
//   - Estimated next drake/baron respawn from past kill events
//   - Your current gold + level
//
// Phase 2 (later) will layer on coach prompts ("vas 20cs por debajo", build
// adapter based on enemy items, etc).

import { useEffect, useMemo } from "react";
import { Activity, Crown, Sparkles, Timer, Shield, Zap } from "lucide-react";
import { Panel } from "./ui/Panel";
import { useLiveGame, useLiveGameTime } from "../hooks/useLiveGame";
import {
  findMyPlayer,
  attributeObjectives,
  liveChampionKey,
  type LiveGameEvent,
} from "../services/liveClient";
import { displayGameMode } from "../data/gameModeNames";
import { setOverlayVisible } from "../services/overlay";
import { usePrefsStore } from "../state/prefsStore";
import { suggestInGameAdaptations } from "../engine/inGameAdapter";
import { coachLiveGame, type LiveCoachSeverity } from "../engine/liveCoachEngine";
import type { ChampionDb } from "../types/champion";

// Severity -> tailwind classes for the live coach rows (literals so JIT scans).
function coachSevClass(sev: LiveCoachSeverity): string {
  switch (sev) {
    case "critical":
      return "bg-bad/10 border border-bad/40 text-bad";
    case "warn":
      return "bg-meh/10 border border-meh/40 text-meh";
    case "good":
      return "bg-good/10 border border-good/40 text-good";
    default:
      return "bg-bg-card border border-border-subtle text-white/80";
  }
}

// Riot's respawn timers (seconds after kill). Values match the live game
// timers shown on the in-game minimap, sourced from Riot's published patch
// notes. Tune if a future patch changes them.
const DRAGON_RESPAWN_SEC = 5 * 60;     // 5min
const BARON_RESPAWN_SEC = 6 * 60;      // 6min (after first spawn at 25min)
const FIRST_DRAGON_SPAWN_SEC = 5 * 60; // 5min from game start
// Herald respawn (4min, until 20min when Baron spawns) intentionally left
// out for phase 1 — needs separate event tracking we'll add later.

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

interface DerivedTimers {
  /** Game time in seconds when the next dragon should be killable. */
  nextDragonAt: number | null;
  nextBaronAt: number | null;
}

function deriveTimers(
  events: LiveGameEvent[],
  gameTime: number
): DerivedTimers {
  let lastDragonKill: number | null = null;
  let lastBaronKill: number | null = null;

  // Team attribution of objective kills lives in liveClient.attributeObjectives
  // (joins KillerName -> allPlayers[].team). Here we only need the last-kill
  // timestamps to project the next spawn.
  for (const ev of events) {
    if (ev.EventName === "DragonKill" && typeof ev.EventTime === "number") {
      lastDragonKill = ev.EventTime;
    } else if (ev.EventName === "BaronKill" && typeof ev.EventTime === "number") {
      lastBaronKill = ev.EventTime;
    }
  }

  const nextDragonAt =
    lastDragonKill !== null
      ? lastDragonKill + DRAGON_RESPAWN_SEC
      : gameTime < FIRST_DRAGON_SPAWN_SEC
        ? FIRST_DRAGON_SPAWN_SEC
        : null;
  const nextBaronAt =
    lastBaronKill !== null ? lastBaronKill + BARON_RESPAWN_SEC : null;

  return { nextDragonAt, nextBaronAt };
}

interface LiveGamePanelProps {
  /** Champion DB — required to look up the local player's champion tags
   *  for the contextual build adapter. Panel renders timers/scores fine
   *  without it, but the "counters" section won't appear. */
  db?: ChampionDb | null;
}

export function LiveGamePanel({ db }: LiveGamePanelProps = {}) {
  const liveState = useLiveGame(true);
  const { inGame, snapshot } = liveState;
  // Smooth 1s tick interpolated from the 2s-stale snapshot — keeps the
  // displayed timer and objective ETAs ticking down every wall-clock
  // second instead of jumping every poll.
  const gameTime = useLiveGameTime(liveState);
  const showOverlay = usePrefsStore((s) => s.prefs.showInGameOverlay);

  // Hooks must run unconditionally — useMemo before the early return.
  const timers = useMemo<DerivedTimers | null>(() => {
    if (!snapshot) return null;
    return deriveTimers(snapshot.events, snapshot.gameData.gameTime);
  }, [snapshot]);

  // Team-attributed objective control (dragon soul + baron) — joins event
  // killer names to player teams since the event log carries no team itself.
  const control = useMemo(
    () =>
      snapshot
        ? attributeObjectives(snapshot.events, snapshot.allPlayers)
        : null,
    [snapshot]
  );

  // OVERLAY TEMPORARILY DISABLED — current Win32 transparent topmost
  // approach has UX issues users report (click-through edge cases,
  // positioning drift, doesn't survive alt-tab cleanly). Hard-disabled
  // until we ship a polished v2. We still call setOverlayVisible(false)
  // unconditionally so any window state lingering from a previous
  // session gets cleared.
  //
  // Pref `showInGameOverlay` is preserved for the user's choice when
  // v2 ships — they don't have to re-opt-in.
  void showOverlay; // pref still read so the dependency array stays meaningful
  useEffect(() => {
    setOverlayVisible(false);
  }, [inGame, showOverlay]);

  if (!inGame || !snapshot) return null;

  // Older fallback kept removed: gameTime now comes from useLiveGameTime
  // above so the countdown ticks smoothly. Original line referenced
  // snapshot.gameData.gameTime which we lose access to here, but it's
  // already captured inside useLiveGameTime's interpolation logic.
  const me = snapshot.activePlayer;

  // Identify the local player's team — labels in the UI are "my team" vs
  // "enemy team", not "blue/red", so a CHAOS user sees correct values.
  // Robust matcher handles Riot-ID vs summonerName mismatches that broke
  // team detection on certain patches (ARAM CHAOS regression).
  const myRecord = findMyPlayer(me, snapshot.allPlayers);
  const myTeamColor = myRecord?.team ?? "ORDER";

  // Kill score: count from allPlayers since events without team attribution
  // can't be split. allPlayers[].scores.kills sums up to true team totals.
  let myKills = 0;
  let theirKills = 0;
  for (const p of snapshot.allPlayers) {
    if (p.team === myTeamColor) myKills += p.scores.kills;
    else theirKills += p.scores.kills;
  }

  // Contextual build advice — scans enemy items every poll and surfaces
  // grievous wounds, anti-armor, anti-MR, anti-crit recs as enemies
  // itemise. Returns [] before MIN_GAME_TIME so we don't suggest Mortal
  // Reminder during minute 2 based on starting Doran's.
  // Resolve via liveChampionKey (rawChampionName suffix === DDragon id) — a
  // plain `c.id === rawChampionName` never matches ("game_character_..." vs
  // "Ahri") and display-name matching breaks for off-name champs (Wukong's id
  // is MonkeyKing), so the item-counter suggestions silently never fired.
  const myChampKey = myRecord && db ? liveChampionKey(db, myRecord) : null;
  const myChamp = myChampKey && db ? db.champions[myChampKey] : null;
  const enemyPlayers = snapshot.allPlayers.filter((p) => p.team !== myTeamColor);
  const inGameSuggestions = myChamp
    ? suggestInGameAdaptations({
        champion: myChamp,
        enemyPlayers,
        gameTime,
        myItems: myRecord?.items ?? [],
      })
    : [];

  // Live coaching — laning state, death discipline, objective prep, resets.
  // Derived purely from the official Live Client snapshot (ToS-safe).
  const laneOpponent =
    enemyPlayers.find(
      (p) => myRecord?.position && p.position === myRecord.position
    ) ?? null;
  const liveCoach = coachLiveGame({
    me: myRecord,
    laneOpponent,
    gameTime,
    nextDragonAt: timers?.nextDragonAt ?? null,
    nextBaronAt: timers?.nextBaronAt ?? null,
    currentGold: me?.currentGold ?? 0,
    myTeam: myTeamColor,
    dragonsByTeam: control?.dragonsByTeam ?? null,
    lastBaronTeam: control?.lastBaronTeam ?? null,
    lastBaronAt: control?.lastBaronAt ?? null,
    myHpPct:
      me?.championStats && me.championStats.maxHealth > 0
        ? me.championStats.currentHealth / me.championStats.maxHealth
        : null,
  });

  return (
    <Panel padding="sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-good animate-pulse" />
          <p className="text-[10px] uppercase tracking-widest text-good font-semibold">
            Live · {displayGameMode(snapshot.gameData.gameMode)}
          </p>
        </div>
        <span className="text-[11px] tabular-nums text-white/70 font-medium">
          {formatTime(gameTime)}
        </span>
      </div>

      {/* Team kill scores — blue = my team regardless of ORDER/CHAOS side */}
      <div className="flex items-center justify-between text-xs mb-2">
        <span
          className="text-blue-300 font-semibold tabular-nums"
          title="Tu equipo"
        >
          {myKills}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-white/35">
          vs
        </span>
        <span
          className="text-red-300 font-semibold tabular-nums"
          title="Equipo enemigo"
        >
          {theirKills}
        </span>
      </div>

      {/* Your stats */}
      {me && (
        <div className="border-t border-white/5 pt-2 mb-2">
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <Stat label="Gold" value={me.currentGold.toFixed(0)} />
            <Stat label="Lvl" value={String(me.level)} />
          </div>
        </div>
      )}

      {/* Live coach — laning / deaths / objective / reset prompts */}
      {liveCoach.length > 0 && (
        <div className="border-t border-white/5 pt-2 mb-2 space-y-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap className="w-3 h-3 text-accent" />
            <p className="text-[10px] uppercase tracking-widest text-accent font-semibold">
              Coach en vivo
            </p>
          </div>
          {liveCoach.map((c) => (
            <div
              key={c.key}
              className={`p-1.5 rounded text-[11px] leading-snug ${coachSevClass(c.severity)}`}
            >
              {c.text}
            </div>
          ))}
        </div>
      )}

      {/* Contextual counters — reacts to actual enemy item buys */}
      {inGameSuggestions.length > 0 && (
        <div className="border-t border-white/5 pt-2 mb-2 space-y-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Shield className="w-3 h-3 text-accent" />
            <p className="text-[10px] uppercase tracking-widest text-accent font-semibold">
              Counters según items enemigos
            </p>
          </div>
          {inGameSuggestions.map((s) => (
            <div
              key={s.key}
              className={`flex items-start gap-2 p-1.5 rounded text-[11px] ${
                s.priority === "core"
                  ? "bg-bad/10 border border-bad/40"
                  : "bg-meh/10 border border-meh/40"
              }`}
              title={s.reason}
            >
              <img
                src={`https://ddragon.leagueoflegends.com/cdn/${db?.patch ?? ""}/img/item/${s.itemId}.png`}
                alt=""
                className="w-7 h-7 rounded border border-border-subtle flex-shrink-0"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium leading-tight">{s.itemName}</p>
                <p className="text-white/60 text-[10px] leading-tight mt-0.5">{s.reason}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Objective timers */}
      {timers && (timers.nextDragonAt !== null || timers.nextBaronAt !== null) && (
        <div className="border-t border-white/5 pt-2 space-y-1">
          {timers.nextDragonAt !== null && (
            <ObjectiveRow
              icon={<Sparkles className="w-3 h-3 text-orange-300" />}
              label="Dragón"
              etaSec={timers.nextDragonAt - gameTime}
              now={timers.nextDragonAt <= gameTime}
            />
          )}
          {timers.nextBaronAt !== null && (
            <ObjectiveRow
              icon={<Crown className="w-3 h-3 text-purple-300" />}
              label="Barón"
              etaSec={timers.nextBaronAt - gameTime}
              now={timers.nextBaronAt <= gameTime}
            />
          )}
        </div>
      )}
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[9px] uppercase tracking-widest text-white/40">
        {label}
      </span>
      <span className="text-white font-medium tabular-nums">{value}</span>
    </div>
  );
}

function ObjectiveRow({
  icon,
  label,
  etaSec,
  now,
}: {
  icon: React.ReactNode;
  label: string;
  etaSec: number;
  now: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-white/70">{label}</span>
      </div>
      {now ? (
        <span className="text-good font-semibold uppercase text-[10px]">
          spawn
        </span>
      ) : (
        <span className="flex items-center gap-1 tabular-nums text-white/55">
          <Timer className="w-2.5 h-2.5" />
          {formatTime(etaSec)}
        </span>
      )}
    </div>
  );
}
