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
import { Activity, Crown, Sparkles, Timer } from "lucide-react";
import { Panel } from "./ui/Panel";
import { useLiveGame, useLiveGameTime } from "../hooks/useLiveGame";
import { findMyPlayer, type LiveGameEvent } from "../services/liveClient";
import { displayGameMode } from "../data/gameModeNames";
import { setOverlayVisible } from "../services/overlay";
import { usePrefsStore } from "../state/prefsStore";

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
  /** Score by team. */
  orderKills: number;
  chaosKills: number;
  dragonsByTeam: { ORDER: number; CHAOS: number };
}

function deriveTimers(
  events: LiveGameEvent[],
  gameTime: number
): DerivedTimers {
  let lastDragonKill: number | null = null;
  let lastBaronKill: number | null = null;
  let orderKills = 0;
  let chaosKills = 0;
  const dragonsByTeam = { ORDER: 0, CHAOS: 0 };

  for (const ev of events) {
    if (ev.EventName === "DragonKill" && typeof ev.EventTime === "number") {
      lastDragonKill = ev.EventTime;
      // Naive team attribution by killer name suffix; the live API doesn't
      // expose team directly on events. We'll refine in phase 2 by joining
      // killer to allPlayers[].team.
    } else if (ev.EventName === "BaronKill") {
      lastBaronKill = ev.EventTime;
    } else if (ev.EventName === "ChampionKill") {
      // Without team join we can't tell who got the kill. Phase 2.
      void ev;
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

  return {
    nextDragonAt,
    nextBaronAt,
    orderKills,
    chaosKills,
    dragonsByTeam,
  };
}

export function LiveGamePanel() {
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

  // Drive the transparent overlay window's visibility from the same
  // in-game detection. Pref `showInGameOverlay` lets the user opt out
  // (some prefer the embedded panel only). Hide always fires when the
  // game ends so the overlay never lingers between matches.
  useEffect(() => {
    if (inGame && showOverlay) setOverlayVisible(true);
    else setOverlayVisible(false);
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
