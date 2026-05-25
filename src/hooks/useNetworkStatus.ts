// Cheap online/offline detection via the browser's NetworkInformation API +
// navigator.onLine. Returns `false` only when the OS reports we lost
// connectivity OR our actual fetch probes start failing.
//
// We pair the browser-event signal with a 60s probe to our Cloudflare
// Worker `/health` endpoint. navigator.onLine alone lies often (the OS
// says "online" when the router is up but DNS is dead). The worker probe
// catches that case too.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  NETWORK_TIMEOUTS_MS,
  POLL_INTERVALS_MS,
  WORKER_HEALTH_URL,
} from "../config";

export interface NetworkStatus {
  /** OS-reported online state. Cheap, but unreliable on flaky networks. */
  online: boolean;
  /** Our worker reachable. Updated every 60s. false ⇒ remote APIs degraded. */
  workerReachable: boolean;
  /** Combined: trustworthy "we can talk to our backend" signal. */
  ok: boolean;
  /** Timestamp (ms) of the last successful probe. */
  lastOkAt: number | null;
  /** Force an immediate re-probe (used by NetworkStatusBanner "Reintentar"). */
  retry: () => Promise<void>;
}

export function useNetworkStatus(): NetworkStatus {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [workerReachable, setWorkerReachable] = useState<boolean>(true);
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const cancelledRef = useRef(false);

  // Listen to OS connectivity events.
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  /** One-shot worker probe. Exposed via `retry()` for the banner button
   * and reused by the periodic timer below. */
  const probe = useCallback(async (): Promise<boolean> => {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), NETWORK_TIMEOUTS_MS.healthProbe);
      const res = await fetch(WORKER_HEALTH_URL, {
        signal: ac.signal,
        cache: "no-store",
      });
      clearTimeout(t);
      if (cancelledRef.current) return false;
      const ok = res.ok;
      setWorkerReachable(ok);
      if (ok) setLastOkAt(Date.now());
      return ok;
    } catch {
      if (!cancelledRef.current) setWorkerReachable(false);
      return false;
    }
  }, []);

  // Periodic worker health probe.
  useEffect(() => {
    cancelledRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = async () => {
      await probe();
      if (!cancelledRef.current) {
        timer = setTimeout(loop, POLL_INTERVALS_MS.workerHealth);
      }
    };
    loop();
    return () => {
      cancelledRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [probe]);

  return {
    online,
    workerReachable,
    ok: online && workerReachable,
    lastOkAt,
    retry: async () => {
      await probe();
    },
  };
}
