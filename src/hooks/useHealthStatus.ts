// Aggregate app health signal for the footer pill + tray tooltip.
//
// Three levels, picked by the worst current signal:
//   - "ok"       — online + worker reachable + no recent fetch failures
//   - "degraded" — at least one fetch source has failed in last
//                  DEGRADED_WINDOW_MS (proxy 5xx, op.gg scrape down,
//                  DDragon flake). Some panels may show stale data.
//   - "offline"  — OS-level offline OR worker health probe failing.
//
// Why aggregate here vs let each panel decide: the footer pill needs ONE
// global verdict the user can glance at. If three panels each render
// their own "loading…" the user can't tell whether the network is dead
// or one panel is slow. The pill is the single source of truth.
//
// Click handling is delegated — this hook returns state, not UI.

import { useEffect, useState } from "react";
import { useNetworkStatus } from "./useNetworkStatus";
import { subscribeFetchFailure } from "../services/fetchNotify";

export type HealthLevel = "ok" | "degraded" | "offline";

export interface HealthStatus {
  level: HealthLevel;
  /** Short human-readable label for the pill. ES, no shouting. */
  label: string;
  /** Long-form tooltip for hover. Includes the last failing source if
   * we're degraded, so the user knows WHICH backend is flaky. */
  detail: string;
  /** Source name from the most recent fetch failure, if any (used in
   * tooltip + accessibility). */
  lastFailureSource?: string;
}

/** How long after a fetch failure we stay "degraded" before optimistically
 * snapping back to "ok". 5 minutes — short enough that a flake clears
 * itself within a coffee break, long enough that the user notices. */
const DEGRADED_WINDOW_MS = 5 * 60_000;

export function useHealthStatus(): HealthStatus {
  const net = useNetworkStatus();
  const [lastFailure, setLastFailure] = useState<{
    at: number;
    source: string;
  } | null>(null);

  // Subscribe to fetchNotify so any service-layer 5xx or retry-exhaust
  // surfaces here. Throttled at the emitter (30s/source) so no spam.
  useEffect(() => {
    return subscribeFetchFailure(({ source }) => {
      setLastFailure({ at: Date.now(), source });
    });
  }, []);

  // Tick once a minute so the pill clears itself when the degraded
  // window expires (no further failures arrive to trigger a re-render).
  // useState + interval is enough — no need for high-frequency polling.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Offline beats everything. If the OS or worker says we're dead, the
  // pill is red regardless of recent fetch state — those failures would
  // just be downstream noise.
  if (!net.ok) {
    return {
      level: "offline",
      label: net.online ? "Backend caído" : "Sin conexión",
      detail: net.online
        ? "El backend de Draftboard no responde. Funcionalidad limitada hasta que vuelva."
        : "Tu PC ha perdido la conexión a internet. La app sigue usando datos en caché.",
    };
  }

  const failedRecently =
    lastFailure !== null && Date.now() - lastFailure.at < DEGRADED_WINDOW_MS;

  if (failedRecently && lastFailure) {
    return {
      level: "degraded",
      label: "Degradado",
      detail: `Fallo reciente en ${lastFailure.source}. Algunos paneles pueden mostrar datos en caché.`,
      lastFailureSource: lastFailure.source,
    };
  }

  return {
    level: "ok",
    label: "OK",
    detail: "Conexión y backend OK. Datos al día.",
  };
}
