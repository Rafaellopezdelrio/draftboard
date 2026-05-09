import { useEffect, useState } from "react";
import { useDraftStore } from "../state/draftStore";

const PHASE_LABEL: Record<string, string> = {
  PLANNING: "Planning",
  BAN_PICK: "Ban/Pick",
  FINALIZATION: "Finalización",
  GAME_STARTING: "Empieza...",
};

export function PhaseTimer() {
  const phase = useDraftStore((s) => s.phase);
  const timerSec = useDraftStore((s) => s.timerSec);
  const [now, setNow] = useState(Date.now());
  const [anchor, setAnchor] = useState<{ ts: number; sec: number } | null>(null);

  useEffect(() => {
    if (timerSec === null) {
      setAnchor(null);
      return;
    }
    setAnchor({ ts: Date.now(), sec: timerSec });
  }, [timerSec, phase]);

  useEffect(() => {
    if (!anchor) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [anchor]);

  if (!phase) return null;
  const remaining = anchor
    ? Math.max(0, anchor.sec - Math.floor((now - anchor.ts) / 1000))
    : timerSec ?? 0;

  return (
    <span className="text-xs px-2 py-1 rounded bg-bg-elev border border-border-subtle text-white/80">
      {PHASE_LABEL[phase] ?? phase} · {remaining}s
    </span>
  );
}
