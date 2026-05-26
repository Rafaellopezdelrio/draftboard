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
import { Activity, Crown, Eye, Flame, Skull } from "lucide-react";

interface TimerRow {
  name: string;
  IconComponent: React.ComponentType<{ className?: string }>;
  color: string;
  /** Solid bg class for the progress bar fill. Must be a literal class
   *  so Tailwind JIT scans it at build time (dynamic concat breaks JIT). */
  fillColor: string;
  ringColor: string;
  firstSpawnSec: number;
  respawnSec: number;
}

// Canonical schedule for Season 14+ Summoner's Rift. Atakhan is the new
// 20-min objective; only spawns once per game so respawnSec stays 0.
// Icons use lucide for crisp vector renders + mint-accented ring colors
// so the panel stays cohesive with the rest of the brand.
const TIMERS: TimerRow[] = [
  {
    name: "Drake",
    IconComponent: Flame,
    color: "text-orange-300",
    fillColor: "bg-orange-300",
    ringColor: "border-orange-300/40 bg-orange-300/5",
    firstSpawnSec: 5 * 60,
    respawnSec: 5 * 60,
  },
  {
    name: "Herald",
    IconComponent: Eye,
    color: "text-purple-300",
    fillColor: "bg-purple-300",
    ringColor: "border-purple-300/40 bg-purple-300/5",
    firstSpawnSec: 14 * 60,
    respawnSec: 6 * 60,
  },
  {
    name: "Baron",
    IconComponent: Skull,
    color: "text-bad",
    fillColor: "bg-bad",
    ringColor: "border-bad/40 bg-bad/5",
    firstSpawnSec: 25 * 60,
    respawnSec: 6 * 60,
  },
  {
    name: "Atakhan",
    IconComponent: Crown,
    color: "text-accent",
    fillColor: "bg-accent",
    ringColor: "border-accent/40 bg-accent/5",
    firstSpawnSec: 20 * 60,
    respawnSec: 0,
  },
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
        <h3 className="text-sm uppercase tracking-wide text-accent flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 animate-pulse" />
          Objetivos · timers
        </h3>
        {live && (
          <span className="text-[10px] uppercase tracking-widest text-good tabular-nums">
            ● {formatMMSS(liveTime)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {TIMERS.map((t) => {
          const Icon = t.IconComponent;
          if (live) {
            const killedAt =
              t.name === "Drake" ? kills.drake :
              t.name === "Herald" ? kills.herald :
              t.name === "Baron" ? kills.baron :
              null;
            const { ready, label, etaSec } = etaFor(t, killedAt, liveTime);
            // Progress bar — visualise how close we are to spawn.
            // Width: 0% when far away, 100% when ready. Helps the user
            // glance at the card and feel urgency without doing math.
            const total = t.respawnSec || t.firstSpawnSec;
            const progress = ready
              ? 100
              : Math.max(0, Math.min(100, 100 - (etaSec / total) * 100));
            return (
              <div
                key={t.name}
                className={`relative rounded p-2 border overflow-hidden ${
                  ready ? "border-good ring-2 ring-good/40 bg-good/5 animate-pulse" : t.ringColor
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Icon className={`w-3.5 h-3.5 ${t.color}`} />
                  <p className={`text-sm font-semibold ${t.color}`}>{t.name}</p>
                </div>
                <p className={`text-xs tabular-nums ${ready ? "text-good font-bold" : "text-white/85"}`}>
                  {ready ? "↑ Spawn ahora" : `Próximo: ${label}`}
                </p>
                {killedAt !== null && t.respawnSec > 0 && (
                  <p className="text-[9px] text-white/40 mt-0.5">
                    último a {formatMMSS(killedAt)}
                  </p>
                )}
                {/* Progress bar — animates as the timer counts down. */}
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5">
                  <div
                    className={`h-full transition-all duration-1000 ${
                      ready ? "bg-good" : t.fillColor
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            );
          }
          // No live data — static reference card.
          return (
            <div
              key={t.name}
              className={`rounded p-2 border ${t.ringColor}`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <Icon className={`w-3.5 h-3.5 ${t.color}`} />
                <p className={`text-sm font-semibold ${t.color}`}>{t.name}</p>
              </div>
              <p className="text-[11px] text-white/65 tabular-nums">
                1ª spawn: {Math.round(t.firstSpawnSec / 60)}min
              </p>
              {t.respawnSec > 0 && (
                <p className="text-[11px] text-white/65 tabular-nums">
                  Respawn: {Math.round(t.respawnSec / 60)}min
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-white/45 leading-snug">
        💡 Wardea río 30s antes del spawn. Empuja waves laterales primero.
      </p>
    </div>
  );
}
