// Always-visible diagnostic strip showing the state of every tracking
// subsystem. Lives below the main header so when something fails the
// user sees exactly WHERE — LCU disconnected? Champ select not detected?
// Live game polling stuck? Each pill turns red/yellow when its data is
// stale or missing.
//
// Purpose: when the user says "tracking didn't work", we don't have to
// guess. The bar shows last-update timestamps + counts so we can read
// the failure directly from the screen instead of digging logs.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { Wifi, WifiOff, Swords, Activity, Clock } from "lucide-react";
import type { LcuStatus } from "../services/lcuService";
import type { GamePhase } from "../state/inGameDetection";
import { useDraftStore } from "../state/draftStore";
import { useLiveGame } from "../hooks/useLiveGame";

interface Props {
  lcuStatus: LcuStatus;
  gamePhase: GamePhase | null;
}

export function TrackingStatusBar({ lcuStatus, gamePhase }: Props) {
  const { t } = useTranslation();
  // Only the three slot arrays are read (for hasDraftData); shallow-select so
  // the always-mounted bar doesn't re-render on every unrelated store mutation
  // on top of its own 1s tick.
  const draftState = useDraftStore(
    useShallow((s) => ({ ally: s.ally, enemy: s.enemy, bans: s.bans }))
  );
  const liveGame = useLiveGame(true);

  // Tick every second so "Xs ago" updates without each consumer re-rendering.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Last LCU update timestamp comes from the draft store's last setPick
  // mutation. We can't track it directly; instead we infer from whether
  // we have a draft state and what phase the game is in.
  const hasDraftData =
    draftState.ally.some((s) => s.championKey) ||
    draftState.enemy.some((s) => s.championKey) ||
    draftState.bans.ally.length > 0 ||
    draftState.bans.enemy.length > 0;

  const banCount = draftState.bans.ally.length + draftState.bans.enemy.length;
  const pickCount =
    draftState.ally.filter((s) => s.championKey).length +
    draftState.enemy.filter((s) => s.championKey).length;

  // Live game freshness — green if we have a snapshot fresher than 10s.
  // Yellow if stale (>10s), red if no snapshot when phase=InProgress.
  const liveFreshSec = liveGame.snapshotAt
    ? Math.floor((Date.now() - liveGame.snapshotAt) / 1000)
    : null;
  const expectingLive = gamePhase === "InProgress";
  const liveOK = liveGame.inGame && (liveFreshSec ?? 999) < 10;
  const liveStale = liveGame.inGame && (liveFreshSec ?? 999) >= 10;
  const liveMissing = expectingLive && !liveGame.inGame;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-elev/30 border border-border-subtle/40 rounded-md text-[10px] uppercase tracking-wider flex-wrap">
      {/* LCU connection */}
      <Pill
        icon={lcuStatus.connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
        label="LCU"
        value={lcuStatus.connected ? "OK" : "OFF"}
        color={lcuStatus.connected ? "good" : "bad"}
        title={lcuStatus.reason ?? (lcuStatus.connected ? t("tracking.lcuOn") : t("tracking.lcuOff"))}
      />

      {/* Champ select tracking */}
      <Pill
        icon={<Swords className="w-3 h-3" />}
        label="Draft"
        value={hasDraftData ? `${banCount}b ${pickCount}p` : "—"}
        color={hasDraftData ? "good" : "muted"}
        title={
          hasDraftData
            ? t("tracking.draftDetected", { bans: banCount, picks: pickCount })
            : t("tracking.draftNone")
        }
      />

      {/* Game phase */}
      <Pill
        icon={<Clock className="w-3 h-3" />}
        label={t("tracking.phaseLabel")}
        value={gamePhase ?? "—"}
        color={gamePhase ? "info" : "muted"}
        title={t("tracking.phaseTitle", { phase: gamePhase ?? t("tracking.phaseNone") })}
      />

      {/* Live game */}
      <Pill
        icon={<Activity className={`w-3 h-3 ${liveOK ? "animate-pulse" : ""}`} />}
        label="Live"
        value={
          liveOK && liveGame.snapshot
            ? `${Math.floor((liveGame.snapshot.gameData.gameTime ?? 0) / 60)}m (${liveFreshSec}s)`
            : liveStale
              ? `stale ${liveFreshSec}s`
              : liveMissing
                ? t("tracking.missing")
                : "—"
        }
        color={liveOK ? "good" : liveStale ? "warn" : liveMissing ? "bad" : "muted"}
        title={
          liveOK
            ? t("tracking.liveOk")
            : liveStale
              ? t("tracking.liveStale")
              : liveMissing
                ? t("tracking.liveMissing")
                : t("tracking.liveIdle")
        }
      />
    </div>
  );
}

function Pill({
  icon,
  label,
  value,
  color,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "good" | "bad" | "warn" | "info" | "muted";
  title?: string;
}) {
  const palette = {
    good: "bg-good/10 text-good ring-good/40",
    bad: "bg-bad/15 text-bad ring-bad/50",
    warn: "bg-meh/15 text-meh ring-meh/50",
    info: "bg-accent/10 text-accent ring-accent/40",
    muted: "bg-white/5 text-white/45 ring-white/10",
  }[color];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ring-1 font-medium ${palette}`}
      title={title}
    >
      {icon}
      <span className="opacity-70">{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}
