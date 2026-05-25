// Pushes a live health summary into the system tray tooltip so the
// user can hover the icon and see "LCU: OK · Worker: OK · v0.3.0"
// without opening the app. Composes the existing connectivity signals
// (useNetworkStatus + lcuStatus) with the app version label.
//
// One source of truth — no separate Rust background watcher. We just
// invoke `set_tray_tooltip` whenever the inputs change.

import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface Args {
  lcuConnected: boolean;
  workerReachable: boolean;
  online: boolean;
  version: string;
}

export function useTrayHealth({
  lcuConnected,
  workerReachable,
  online,
  version,
}: Args): void {
  useEffect(() => {
    if (!isTauri()) return;
    // Compose the tooltip: status emoji per signal + version trailer.
    // Tauri tooltips on Windows truncate around ~127 chars — we stay
    // far below that.
    const lcuIcon = lcuConnected ? "✓" : "—";
    const netIcon = !online ? "✗" : workerReachable ? "✓" : "!";
    const overall = lcuConnected && workerReachable && online ? "OK" : "Parcial";
    const text = `Draftboard v${version} · ${overall}\nLCU: ${lcuIcon}  ·  Backend: ${netIcon}`;
    invoke("set_tray_tooltip", { text }).catch(() => {
      // command may not exist in older builds — non-fatal
    });
  }, [lcuConnected, workerReachable, online, version]);
}
