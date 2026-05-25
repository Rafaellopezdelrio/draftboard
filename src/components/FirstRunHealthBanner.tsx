// Proactive banner shown ONCE per session if any critical subsystem
// isn't working at boot. Surfaces problems early so the user doesn't
// have to click around wondering why panels are empty.
//
// Conditions checked:
//   - Worker backend reachable (else: meta/tier-list/builds dead)
//   - LCU detected (informational, not blocking — user might just be
//     opening the app outside of LoL)
//   - Network online (else: nothing works)
//
// Lives at the top of the main layout (above panels) so the user sees
// it on first paint after boot if relevant. Dismissed per session —
// re-evaluated on next launch.

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useNetworkStatus } from "../hooks/useNetworkStatus";

interface Props {
  /** LCU connection status from useLcuSync. Used informationally —
   * if false, we don't BLOCK on it (user might be browsing the app
   * outside a match). */
  lcuConnected: boolean;
  /** Opens DiagnosticsView for the user to see the full health table. */
  onShowDiagnostics: () => void;
}

/** Wait this long after mount before evaluating health. Gives the
 * network probe + LCU watcher time to settle so we don't flash a false
 * "backend down" banner during the boot race. */
const SETTLE_DELAY_MS = 4000;

export function FirstRunHealthBanner({ lcuConnected, onShowDiagnostics }: Props) {
  const net = useNetworkStatus();
  const [dismissed, setDismissed] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSettled(true), SETTLE_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  if (dismissed || !settled) return null;

  // Build the issue list. Show only when at least one BLOCKING issue
  // is present. LCU-not-connected is informational, never alone is
  // enough to show the banner — that's normal (user opens app first,
  // launches LoL later).
  const issues: string[] = [];
  if (!net.online) issues.push("Sin conexión a internet");
  if (net.online && !net.workerReachable) issues.push("Backend no responde (Cloudflare Worker)");
  if (issues.length === 0) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] max-w-lg bg-bad/90 border border-bad/60 rounded-lg px-4 py-2.5 shadow-2xl flex items-start gap-2 animate-[scaleIn_180ms_ease-out]"
    >
      <AlertTriangle className="w-4 h-4 text-white shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0 text-xs">
        <p className="font-semibold text-white">Problemas detectados al arrancar</p>
        <ul className="text-white/85 list-disc list-inside mt-0.5 space-y-0.5">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
        {!lcuConnected && (
          <p className="text-white/60 mt-1">
            (LoL client no detectado — normal si no lo has abierto)
          </p>
        )}
        <button
          type="button"
          onClick={onShowDiagnostics}
          className="mt-1.5 text-[11px] underline underline-offset-2 text-white/90 hover:text-white"
        >
          Abrir diagnóstico
        </button>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Cerrar"
        className="text-white/60 hover:text-white shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
