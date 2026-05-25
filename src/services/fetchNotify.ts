// Centralised "fetch failed" notifier. Service layers call
// `emitFetchFailure(source, err)` after a withRetry chain exhausts
// instead of silently returning `[]`/`null`. A single subscriber in
// App.tsx surfaces a toast so the user knows WHY a panel went blank.
//
// Why a custom pub/sub (not just calling useToast from services):
//   - Services run outside React's render tree — they can't grab the
//     ToastContext directly.
//   - We want throttling per source so a 30s outage doesn't spam 12
//     identical toasts (every panel hits the same dead proxy).
//   - Keeps the service layer pure / framework-free — only App.tsx
//     knows about toasts.
//
// Throttle policy: at most one notification per `source` every
// THROTTLE_MS. If a second failure for the same source arrives during
// the window, it's swallowed. Different sources fire independently
// (so "op.gg meta" + "DDragon" can both notify within 1s).

export interface FetchFailurePayload {
  /** Short human-readable origin. Shown in the toast title. Examples:
   * "op.gg meta", "DDragon patches", "Pro builds". Keep under ~20 chars. */
  source: string;
  /** The error object/value that ultimately rejected. May be any type
   * (Error, string, unknown). Subscribers stringify defensively. */
  error: unknown;
}

type Listener = (payload: FetchFailurePayload) => void;

const listeners = new Set<Listener>();
const lastFiredAt = new Map<string, number>();

/** ms between allowed notifications for the same source. 30s is long
 * enough to avoid spam during a sustained outage, short enough that a
 * user who comes back from coffee still sees a fresh notification. */
const THROTTLE_MS = 30_000;

/** Subscribe to fetch failure notifications. Returns an unsubscribe
 * function. Use in React via useEffect with cleanup. */
export function subscribeFetchFailure(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Notify all subscribers of a fetch failure, subject to per-source
 * throttling. Safe to call from any service / thread. Never throws.
 * Returns true if the event was actually dispatched (not throttled). */
export function emitFetchFailure(source: string, error: unknown): boolean {
  const now = Date.now();
  const last = lastFiredAt.get(source) ?? 0;
  if (now - last < THROTTLE_MS) return false;
  lastFiredAt.set(source, now);
  // Snapshot listeners so a subscriber removing itself during dispatch
  // (e.g. App.tsx unmount during HMR) doesn't mutate the iteration.
  const snapshot = Array.from(listeners);
  for (const fn of snapshot) {
    try {
      fn({ source, error });
    } catch {
      // Subscriber bug must never break the emitter.
    }
  }
  return true;
}

/** Test-only: reset the throttle map so consecutive test cases start
 * with a clean slate. Not exported from the package barrel — only
 * tests reach in for this. */
export function _resetFetchNotifyForTests(): void {
  lastFiredAt.clear();
  listeners.clear();
}
