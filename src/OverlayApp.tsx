// Compact in-game overlay rendered in the "overlay" Tauri window.
// Separate React entry from the main App because the overlay needs:
//   - No layout chrome (header, prefs panel, etc)
//   - Minimal footprint (auto-positions in a corner, click-through default)
//   - Different lifecycle (only mounted while in a live game)
//
// Shares the data-fetching hook (useLiveGame) with the main panel — same
// numbers, same source.

import { useEffect, useMemo, useRef } from "react";
import {
  Activity,
  Crown,
  GripHorizontal,
  Sparkles,
  Sword,
  Timer,
  X,
} from "lucide-react";
import { useLiveGame, useLiveGameTime } from "./hooks/useLiveGame";
import {
  assertOverlayTopmost,
  setOverlayClickthrough,
  setOverlaySize,
  setOverlayVisible,
} from "./services/overlay";
import {
  findMyPlayer,
  attributeObjectives,
  type LiveGamePlayer,
} from "./services/liveClient";
import {
  coachLiveGame,
  type LiveCoachSeverity,
} from "./engine/liveCoachEngine";
import { displayGameMode } from "./data/gameModeNames";

function ovCoachColor(sev: LiveCoachSeverity): string {
  switch (sev) {
    case "critical":
      return "text-bad";
    case "warn":
      return "text-meh";
    case "good":
      return "text-good";
    default:
      return "text-white/70";
  }
}

const DRAGON_RESPAWN_SEC = 5 * 60;
const BARON_RESPAWN_SEC = 6 * 60;
const FIRST_DRAGON_SPAWN_SEC = 5 * 60;

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function OverlayApp() {
  const liveState = useLiveGame(true);
  const { inGame, snapshot } = liveState;
  // Smooth 1s interpolation of the 2s-poll gameTime — used by the
  // objective countdowns + the header clock so the user sees seconds
  // tick down naturally.
  const liveGameTime = useLiveGameTime(liveState);

  // Click-through DESIGN NOTE: see prior commit message — pure click-through
  // creates a catch-22 where mouseEnter never fires. The overlay is small
  // enough that staying always-interactive is the right trade.
  useEffect(() => {
    setOverlayClickthrough(false);
  }, []);

  useEffect(() => {
    if (!inGame) setOverlayVisible(false);
  }, [inGame]);

  // Re-assert HWND_TOPMOST every 1s WHILE we're meant to be visible
  // (in-game). Windows demotes our topmost flag whenever the LoL
  // window receives focus, so without this loop the overlay slides
  // behind the game after the first click into LoL. We deliberately
  // skip the assertion while !inGame: re-asserting on a hidden window
  // is wasted IPC AND historically caused the overlay to flash back
  // into view (when paired with SWP_SHOWWINDOW — now fixed Rust-side).
  useEffect(() => {
    if (!inGame) return;
    assertOverlayTopmost();
    const id = setInterval(() => {
      assertOverlayTopmost();
    }, 1000);
    return () => clearInterval(id);
  }, [inGame]);

  // Shrink-wrap the overlay WINDOW to the rendered chip's size so the
  // transparent margins around it aren't part of any window — clicks
  // there fall through to LoL underneath naturally.
  //
  // CRITICAL: only observe the chip while inGame. Out of game we render
  // an empty `h-screen w-screen` div as a placeholder — observing IT
  // would set the Tauri window size to the FULL screen + create a
  // feedback loop (window resize → ResizeObserver fires → setOverlaySize
  // → window resize → ...) burning CPU continuously. Skip entirely
  // when !inGame; the window is hidden anyway via setOverlayVisible.
  //
  // Dep array intentionally omits `snapshot` — re-running the entire
  // observer setup every 2s poll (every snapshot ref change) added
  // unnecessary IPC + churn. The ResizeObserver already catches real
  // size changes via its callback; we don't need to re-mount it.
  const chipRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!inGame) return;
    const el = chipRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      // Pad so the chip's outer ring/shadow doesn't get clipped.
      const pad = 6;
      setOverlaySize(
        Math.ceil(rect.width) + pad * 2,
        Math.ceil(rect.height) + pad * 2
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [inGame]);

  const timers = useMemo(() => {
    if (!snapshot) return null;
    let lastDragon: number | null = null;
    let lastBaron: number | null = null;
    for (const ev of snapshot.events) {
      if (ev.EventName === "DragonKill") lastDragon = ev.EventTime;
      else if (ev.EventName === "BaronKill") lastBaron = ev.EventTime;
    }
    const gameTime = snapshot.gameData.gameTime;
    const nextDragonAt =
      lastDragon !== null
        ? lastDragon + DRAGON_RESPAWN_SEC
        : gameTime < FIRST_DRAGON_SPAWN_SEC
          ? FIRST_DRAGON_SPAWN_SEC
          : null;
    const nextBaronAt =
      lastBaron !== null ? lastBaron + BARON_RESPAWN_SEC : null;
    return { nextDragonAt, nextBaronAt, gameTime };
  }, [snapshot]);

  if (!inGame || !snapshot) {
    // No active game → render NOTHING visible. The Tauri window itself
    // is hidden by LiveGamePanel's `setOverlayVisible(false)` effect
    // when `inGame` flips false; during the brief race between hide
    // command and React unmount we want a fully transparent surface so
    // the user never sees a stray placeholder chip.
    //
    // Historical note: we used to render an "Overlay listo · esperando
    // partida" placeholder so the manual "Forzar overlay (test)" command
    // had something visible. Users complained it leaked into normal flow
    // during the loading screen. The test command still works — it just
    // makes the (now invisible) window mount; verify by triggering it
    // AFTER minions spawn so there's real data to render.
    return (
      <div
        ref={chipRef}
        className="h-screen w-screen pointer-events-none"
        style={{ backgroundColor: "rgba(0,0,0,0)" }}
      />
    );
  }

  const gameTime = liveGameTime; // smooth 1s interpolation
  const me = snapshot.activePlayer;

  // Determine the local player's TEAM from allPlayers. Hardcoding
  // allies=ORDER, enemies=CHAOS was wrong — when the user is on CHAOS,
  // the "Aliados" section would show enemies and vice versa. Fixes the
  // "ARAM CHAOS doesn't detect enemies" complaint.
  //
  // findMyPlayer() handles all the Riot-ID-vs-summonerName edge cases
  // (gameName, gameName#tag, normalised, etc) so this works even on
  // patches where the two sides spell the name differently.
  const myRecord = findMyPlayer(me, snapshot.allPlayers);
  const myTeam = myRecord?.team ?? "ORDER";
  const enemyTeam = myTeam === "ORDER" ? "CHAOS" : "ORDER";

  let orderKills = 0;
  let chaosKills = 0;
  for (const p of snapshot.allPlayers) {
    if (p.team === "ORDER") orderKills += p.scores.kills;
    else chaosKills += p.scores.kills;
  }
  const allies = snapshot.allPlayers.filter((p) => p.team === myTeam);
  const enemies = snapshot.allPlayers.filter((p) => p.team === enemyTeam);
  const myKills = myTeam === "ORDER" ? orderKills : chaosKills;
  const theirKills = myTeam === "ORDER" ? chaosKills : orderKills;

  // Personal stats taken from the same `myRecord` discovered above for
  // team detection — saves a second lookup.
  const cs = myRecord?.scores.creepScore ?? 0;
  const csPerMin = gameTime > 0 ? (cs / gameTime) * 60 : 0;
  const kda = myRecord?.scores
    ? `${myRecord.scores.kills}/${myRecord.scores.deaths}/${myRecord.scores.assists}`
    : "0/0/0";
  const ward = myRecord?.scores.wardScore ?? 0;

  // Live coaching in the overlay — same engine as the main panel, so the
  // overlay actually COACHES (soul/baron/deaths/lane/HP) instead of only
  // mirroring the scoreboard. Derived from the official Live Client snapshot.
  const laneOpponent =
    enemies.find((p) => myRecord?.position && p.position === myRecord.position) ??
    null;
  const control = attributeObjectives(snapshot.events, snapshot.allPlayers);
  const liveCoach = coachLiveGame({
    me: myRecord,
    laneOpponent,
    gameTime,
    nextDragonAt: timers?.nextDragonAt ?? null,
    nextBaronAt: timers?.nextBaronAt ?? null,
    currentGold: me?.currentGold ?? 0,
    myTeam,
    dragonsByTeam: control.dragonsByTeam,
    lastBaronTeam: control.lastBaronTeam,
    lastBaronAt: control.lastBaronAt,
    myHpPct:
      me?.championStats && me.championStats.maxHealth > 0
        ? me.championStats.currentHealth / me.championStats.maxHealth
        : null,
  });

  const close = async () => {
    await setOverlayVisible(false);
  };

  return (
    <div className="h-screen w-screen text-white text-xs select-none">
      <div
        ref={chipRef}
        // backdrop-blur removed for perf: chip background is already
        // opaque (0.97 alpha), and the always-topmost overlay window
        // DWM recompositor cost outweighs the visual gain.
        className="m-1.5 rounded-lg ring-1 ring-white/40 px-3 py-2 flex flex-col gap-2 shadow-2xl w-fit"
        style={{
          backgroundColor: "rgba(6, 8, 16, 0.97)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08) inset",
        }}
      >
        {/* Header: drag handle + close */}
        <div
          data-tauri-drag-region
          className="flex items-center justify-between cursor-move"
        >
          {/* Drag-target children must be pointer-events-none so the drag
              region attribute on the parent receives mousedown. Otherwise
              the Activity icon / gameMode label / GripHorizontal swallow
              the event and the user can't move the window. The close X
              button explicitly re-enables pointer events so it stays
              clickable. */}
          <div className="flex items-center gap-1.5 pointer-events-none">
            <Activity className="w-3 h-3 text-good animate-pulse" />
            <span className="text-[9px] uppercase tracking-widest text-good font-semibold">
              {displayGameMode(snapshot.gameData.gameMode)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <GripHorizontal className="w-3 h-3 text-white/30 pointer-events-none" />
            <button
              onClick={close}
              className="text-white/40 hover:text-white transition pointer-events-auto"
              aria-label="Cerrar overlay"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Score banner: my-team kills | timer | enemy-team kills.
            Blue = my team regardless of ORDER/CHAOS — what matters is
            "are WE winning the kill score". */}
        <div className="flex items-center justify-between px-1">
          <span
            className="text-blue-300 font-bold tabular-nums text-base leading-none"
            title="Tu equipo"
          >
            {myKills}
          </span>
          <span className="font-bold tabular-nums text-white text-sm leading-none">
            {formatTime(gameTime)}
          </span>
          <span
            className="text-red-300 font-bold tabular-nums text-base leading-none"
            title="Equipo enemigo"
          >
            {theirKills}
          </span>
        </div>

        {/* Live coach — the actionable layer (soul/baron/deaths/lane/HP). */}
        {liveCoach.length > 0 && (
          <div className="border-t border-white/10 pt-1.5 space-y-0.5">
            {liveCoach.map((c) => (
              <p
                key={c.key}
                className={`text-[10px] leading-tight ${ovCoachColor(c.severity)}`}
              >
                • {c.text}
              </p>
            ))}
          </div>
        )}

        {/* Your personal stats — KDA + CS + Gold + Lvl + Ward */}
        {me && (
          <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[10px] border-t border-white/10 pt-1.5">
            <Stat label="KDA" value={kda} accent />
            <Stat label="CS" value={`${cs} (${csPerMin.toFixed(1)})`} />
            <Stat label="Lvl" value={String(me.level)} />
            <Stat label="Gold" value={Math.round(me.currentGold).toLocaleString()} />
            <Stat label="Ward" value={String(ward)} />
            {me.championStats && (
              <Stat
                label="HP"
                value={`${Math.round(me.championStats.currentHealth)}/${Math.round(me.championStats.maxHealth)}`}
              />
            )}
          </div>
        )}

        {/* Objective timers */}
        {timers && (timers.nextDragonAt !== null || timers.nextBaronAt !== null) && (
          <div className="border-t border-white/10 pt-1.5 space-y-0.5">
            {timers.nextDragonAt !== null && (
              <ObjectiveRow
                icon={<Sparkles className="w-2.5 h-2.5 text-orange-300" />}
                label="Drake"
                etaSec={timers.nextDragonAt - timers.gameTime}
              />
            )}
            {timers.nextBaronAt !== null && (
              <ObjectiveRow
                icon={<Crown className="w-2.5 h-2.5 text-purple-300" />}
                label="Baron"
                etaSec={timers.nextBaronAt - timers.gameTime}
              />
            )}
          </div>
        )}

        {/* Teams at-a-glance: ally + enemy rows with champ + lvl + KDA */}
        {allies.length > 0 && (
          <div className="border-t border-white/10 pt-1.5 space-y-0.5">
            <p className="text-[8px] uppercase tracking-widest text-blue-300/80 font-semibold">
              Aliados
            </p>
            {allies.map((p) => (
              <PlayerLine key={p.summonerName} p={p} />
            ))}
          </div>
        )}
        {enemies.length > 0 && (
          <div className="border-t border-white/10 pt-1.5 space-y-0.5">
            <p className="text-[8px] uppercase tracking-widest text-red-300/80 font-semibold">
              Enemigos
            </p>
            {enemies.map((p) => (
              <PlayerLine key={p.summonerName} p={p} enemy />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-white/35 uppercase tracking-widest text-[8px]">
        {label}
      </span>
      <span
        className={`tabular-nums font-medium ${
          accent ? "text-accent" : "text-white"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function ObjectiveRow({
  icon,
  label,
  etaSec,
}: {
  icon: React.ReactNode;
  label: string;
  etaSec: number;
}) {
  const ready = etaSec <= 0;
  return (
    <div className="flex items-center justify-between text-[10px]">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-white/65">{label}</span>
      </div>
      {ready ? (
        <span className="text-good font-semibold uppercase text-[9px]">
          spawn
        </span>
      ) : (
        <span className="flex items-center gap-0.5 tabular-nums text-white/55">
          <Timer className="w-2 h-2" />
          {formatTime(etaSec)}
        </span>
      )}
    </div>
  );
}

/**
 * Single player row inside the team list. Compact: champion name +
 * level + KDA, color-coded by team. Sword glyph indicates the player
 * with the most kills on their team — quick visual for "biggest threat".
 */
function PlayerLine({
  p,
  enemy = false,
}: {
  p: LiveGamePlayer;
  enemy?: boolean;
}) {
  const kda = `${p.scores.kills}/${p.scores.deaths}/${p.scores.assists}`;
  const isCarrying = p.scores.kills >= 5;
  return (
    <div className="flex items-center justify-between text-[10px]">
      <div className="flex items-center gap-1 min-w-0">
        {isCarrying && (
          <Sword
            className={`w-2 h-2 shrink-0 ${
              enemy ? "text-red-300" : "text-blue-300"
            }`}
          />
        )}
        <span className="text-white/80 truncate">{p.championName}</span>
        <span className="text-white/35 tabular-nums shrink-0">
          {p.level}
        </span>
      </div>
      <span className="tabular-nums text-white/55 shrink-0">{kda}</span>
    </div>
  );
}
