// Live objective timers shown while a game is in progress.
//
// When the Live Client API (localhost:2999) is reachable we drive the
// countdowns from the real game clock + recorded kill events, so the
// numbers tick down in real time. When the API isn't available (older
// LoL build, game just starting) we degrade to a static reference card
// so the user still sees the canonical spawn schedule.

import { useMemo } from "react";
import { useLiveGame, useLiveGameTime } from "../hooks/useLiveGame";
import type { LiveGameEvent } from "../services/liveClient";

interface TimerRow {
  name: string;
  icon: string;
  color: string;
  firstSpawnSec: number;
  respawnSec: number;
}

// Canonical schedule for Season 14+ Summoner's Rift. Atakhan is the new
// 20-min objective; only spawns once per game so respawnSec stays 0.
const TIMERS: TimerRow[] = [
  { name: "Drake",   firstSpawnSec: 5 * 60,  respawnSec: 5 * 60, icon: "🐉", color: "text-good" },
  { name: "Herald",  firstSpawnSec: 14 * 60, respawnSec: 6 * 60, icon: "👁️", color: "text-meh" },
  { name: "Baron",   firstSpawnSec: 25 * 60, respawnSec: 6 * 60, icon: "💀", color: "text-bad" },
  { name: "Atakhan", firstSpawnSec: 20 * 60, respawnSec: 0,      icon: "👑", color: "text-accent" },
];

function formatMMSS(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

/**
 * Walk the live event log once and pull out the last kill time for each
 * tracked objective. Cheap — `events` typically holds <100 entries even
 * mid-late game.
 *
 * Herald: Riot stopped killing Herald in S14 (rift charge mechanic). We
 * still track first spawn; second-cycle ETA is unreliable across patches
 * so we hide it when we don't have a clean signal.
 */
function lastKills(events: LiveGameEvent[]): {
  drake: number | null;
  herald: number | null;
  baron: number | null;
} {
  let drake: number | null = null;
  let herald: number | null = null;
  let baron: number | null = null;
  for (const ev of events) {
    if (typeof ev.EventTime !== "number") continue;
    if (ev.EventName === "DragonKill") drake = ev.EventTime;
    else if (ev.EventName === "HeraldKill") herald = ev.EventTime;
    else if (ev.EventName === "BaronKill") baron = ev.EventTime;
  }
  return { drake, herald, baron };
}

function etaFor(
  row: TimerRow,
  killedAt: number | null,
  gameTime: number
): { etaSec: number; ready: boolean; label: string } {
  // No respawn after first kill (Atakhan) → either "spawn at X" or done.
  if (row.respawnSec === 0) {
    if (killedAt !== null) return { etaSec: 0, ready: false, label: "muerto" };
    const eta = row.firstSpawnSec - gameTime;
    return { etaSec: eta, ready: eta <= 0, label: eta <= 0 ? "ahora" : formatMMSS(eta) };
  }
  // Respawnable: next spawn = killedAt + respawnSec, or first spawn if not killed yet.
  const next = killedAt !== null ? killedAt + row.respawnSec : row.firstSpawnSec;
  const eta = next - gameTime;
  return { etaSec: eta, ready: eta <= 0, label: eta <= 0 ? "ahora" : formatMMSS(eta) };
}

export function InGameTimers() {
  const liveState = useLiveGame(true);
  const liveTime = useLiveGameTime(liveState);
  const live = liveState.inGame && liveState.snapshot;

  const kills = useMemo(
    () => (live ? lastKills(liveState.snapshot!.events) : { drake: null, herald: null, baron: null }),
    [live, liveState.snapshot]
  );

  return (
    <div className="space-y-2 p-3 bg-bg-elev border border-border-subtle rounded">
      <div className="flex items-center justify-between">
        <h3 className="text-sm uppercase tracking-wide text-accent">
          🎮 Partida en curso — referencias
        </h3>
        {live && (
          <span className="text-[10px] uppercase tracking-widest text-good tabular-nums">
            ● {formatMMSS(liveTime)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {TIMERS.map((t) => {
          if (live) {
            const killedAt =
              t.name === "Drake" ? kills.drake :
              t.name === "Herald" ? kills.herald :
              t.name === "Baron" ? kills.baron :
              null;
            const { ready, label } = etaFor(t, killedAt, liveTime);
            return (
              <div
                key={t.name}
                className={`bg-bg-card rounded p-2 border ${
                  ready ? "border-good ring-1 ring-good/40" : "border-border-subtle"
                }`}
              >
                <p className={`text-sm font-medium ${t.color}`}>
                  {t.icon} {t.name}
                </p>
                <p className={`text-xs tabular-nums ${ready ? "text-good font-semibold" : "text-white/70"}`}>
                  {ready ? "↑ Spawn ahora" : `Próximo: ${label}`}
                </p>
                {killedAt !== null && t.respawnSec > 0 && (
                  <p className="text-[10px] text-white/40 mt-0.5">
                    último a {formatMMSS(killedAt)}
                  </p>
                )}
              </div>
            );
          }
          // No live data — static reference card.
          return (
            <div
              key={t.name}
              className="bg-bg-card rounded p-2 border border-border-subtle"
            >
              <p className={`text-sm font-medium ${t.color}`}>
                {t.icon} {t.name}
              </p>
              <p className="text-xs text-white/60">
                1ª spawn: {Math.round(t.firstSpawnSec / 60)}min
              </p>
              {t.respawnSec > 0 && (
                <p className="text-xs text-white/60">
                  Respawn: {Math.round(t.respawnSec / 60)}min
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-white/40">
        💡 Wardea río 30s antes del spawn. Empuja waves laterales primero.
      </p>
    </div>
  );
}
