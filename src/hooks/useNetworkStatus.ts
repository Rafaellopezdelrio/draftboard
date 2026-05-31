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

/** Consecutive failed probes required before flagging the worker unreachable.
 *  Debounces transient misses (worker cold start, DNS spike, momentary wifi
 *  drop) so the health banner doesn't flap on a single slow probe. */
const HEALTH_FAIL_THRESHOLD = 2;

/** Pure debounce reducer for the worker-health probe. A success clears the
 *  failure streak and reports reachable. A failure increments the streak and
 *  only reports unreachable once it reaches HEALTH_FAIL_THRESHOLD — so a lone
 *  slow/failed probe is ignored. (OS-level offline is handled separately +
 *  immediately via navigator.onLine, so real outages still surface fast.) */
export function nextWorkerReachable(
  probeOk: boolean,
  consecutiveFails: number
): { reachable: boolean; consecutiveFails: number } {
  if (probeOk) return { reachable: true, consecutiveFails: 0 };
  const fails = consecutiveFails + 1;
  return { reachable: fails < HEALTH_FAIL_THRESHOLD, consecutiveFails: fails };
}

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
  // Consecutive failed probes — drives the debounce so a single miss can't
  // flip workerReachable (see nextWorkerReachable).
  const consecutiveFailsRef = useRef(0);

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
    let ok = false;
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), NETWORK_TIMEOUTS_MS.healthProbe);
      const res = await fetch(WORKER_HEALTH_URL, {
        signal: ac.signal,
        cache: "no-store",
      });
      clearTimeout(t);
      ok = res.ok;
    } catch {
      ok = false;
    }
    if (cancelledRef.current) return ok;
    // Debounce transient misses: a lone failed/slow probe must not flip the
    // banner — only flag degraded after HEALTH_FAIL_THRESHOLD consecutive
    // misses; a success clears the streak instantly.
    const next = nextWorkerReachable(ok, consecutiveFailsRef.current);
    consecutiveFailsRef.current = next.consecutiveFails;
    setWorkerReachable(next.reachable);
    if (ok) setLastOkAt(Date.now());
    return ok;
  }, []);

  // Periodic worker health probe.
  useEffect(() => {
    cancelledRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = async () => {
      // Skip probing when window is hidden — no point burning a fetch
      // every 60s on a minimised app. Re-schedule a slow tick so we
      // wake up promptly when visibility comes back.
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(loop, POLL_INTERVALS_MS.workerHealth);
        return;
      }
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
