// Performance measurement utilities. Track boot time, render budgets,
// and slow-operation warnings without depending on a dev-only profiler.
//
// Why this exists in prod code:
//   - Sentry's tracesSampleRate is 0 (cost + privacy) so we don't ship
//     auto-tracing. We DO want lightweight startup measurement that
//     warns when the app boots slower than expected.
//   - A user-visible perf budget (e.g. "boot > 2s") logs to Sentry as a
//     breadcrumb so when they later crash, we see the slow boot was a
//     red flag.
//
// API:
//   mark("event-name")     → save a timestamp under that name
//   measure("a", "b")      → ms between mark("a") and mark("b")
//   measureFromBoot("x")   → ms since the bundle first ran
//   warnIfSlow(ms, budget, label)  → log breadcrumb if over budget

import { trackEvent } from "./breadcrumbs";

const marks = new Map<string, number>();
const BOOT_MS = typeof performance !== "undefined" ? performance.now() : Date.now();

/** Save a high-resolution timestamp under `name`. Overwrites if called
 * twice — the LATEST mark wins. */
export function mark(name: string): void {
  marks.set(name, perfNow());
}

/** Milliseconds between two prior marks. Returns NaN if either is
 * missing — caller should treat NaN as "couldn't measure". */
export function measure(from: string, to: string): number {
  const a = marks.get(from);
  const b = marks.get(to);
  if (a === undefined || b === undefined) return NaN;
  return b - a;
}

/** Milliseconds since the bundle first executed (rough "time since boot"). */
export function measureFromBoot(label?: string): number {
  const ms = perfNow() - BOOT_MS;
  if (label) marks.set(label, perfNow());
  return ms;
}

/** Log a breadcrumb when an operation took longer than its budget. Keeps
 * the perf signal in our Sentry trail so we can correlate slow runs with
 * later crashes. */
export function warnIfSlow(
  elapsedMs: number,
  budgetMs: number,
  label: string,
  extra?: Record<string, unknown>
): void {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= budgetMs) return;
  trackEvent(
    "fetch",
    `Slow operation: ${label}`,
    { elapsedMs: Math.round(elapsedMs), budgetMs, ...extra },
    "warning"
  );
}

/** Cross-environment monotonic time source. */
function perfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
