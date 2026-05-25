// Generic exponential-backoff retry for network ops. Wraps any
// `() => Promise<T>` and retries on rejection with growing delays. Use
// for: champion DB refresh, patch notes fetch, op.gg meta, anywhere a
// transient 5xx / timeout / abort would otherwise show a hard error.
//
// Defaults: 3 attempts, base 500ms, doubles each time, capped at 5s. So
// the cumulative wait across all 3 retries is ~500 + 1000 + 2000 = 3.5s.
//
// Why caller-supplied factory instead of (url, opts)? Because fetches in
// this codebase route through different transports — `fetch`, Tauri's
// `invoke`, even GraphQL clients. The fn-based signature works for all.
//
// Rate-limit awareness: if `fn` throws a RateLimitError with
// `retryAfterMs`, withRetry uses THAT delay instead of its own exp
// backoff for the next attempt. This stops us hammering a 429-ing
// endpoint and respects the server's Retry-After hint. When the hint
// exceeds `maxRateLimitWaitMs` we stop retrying entirely — pointless
// to block the UI for 60s waiting on a real rate limit.

/** Throw from inside a withRetry fn when the server returns 429 (or
 * the equivalent for the API you're calling). Pass `retryAfterMs` from
 * the Retry-After header so the retry loop waits the right amount. */
export class RateLimitError extends Error {
  readonly retryAfterMs?: number;
  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** Convenience: inside a withRetry fn, call this on the response object
 * to centralise 429 handling. If the response is rate-limited, throws
 * a RateLimitError pre-loaded with the parsed Retry-After. No-op when
 * the response is fine. Works with both Tauri's plugin-http response
 * and native fetch Response (both expose .status and .headers.get). */
export function throwIfRateLimited(
  res: { status: number; headers: { get: (k: string) => string | null } },
  contextLabel?: string
): void {
  if (res.status !== 429) return;
  const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
  throw new RateLimitError(
    contextLabel ? `HTTP 429 ${contextLabel}` : "HTTP 429",
    retryAfterMs
  );
}

/** Parse the HTTP Retry-After header value into ms. Accepts both
 * forms defined by RFC 7231 §7.1.3:
 *   - `Retry-After: 120`                  (delta-seconds)
 *   - `Retry-After: Wed, 21 Oct 2026 ...` (HTTP-date)
 * Returns undefined for missing / unparseable / past-date values so
 * the caller can fall back to its own backoff. */
export function parseRetryAfter(headerValue: string | null | undefined): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  // Delta-seconds form: integer >= 0.
  if (/^\d+$/.test(trimmed)) {
    const secs = Number.parseInt(trimmed, 10);
    if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
    return undefined;
  }
  // HTTP-date form: parse and subtract from now. Require at least one
  // letter so Date.parse doesn't latch onto numeric-looking junk like
  // "12.5" (implementation-defined behaviour across JS engines).
  if (!/[A-Za-z]/.test(trimmed)) return undefined;
  const ts = Date.parse(trimmed);
  if (Number.isFinite(ts)) {
    const delta = ts - Date.now();
    // Treat past dates as "retry immediately" — but cap negatives at 0
    // so we don't accidentally pass a negative delay to setTimeout.
    return Math.max(0, delta);
  }
  return undefined;
}

export interface RetryOptions {
  /** Total attempts including the first call. Default: 3. */
  attempts?: number;
  /** Initial delay before first retry, in ms. Default: 500. */
  baseDelayMs?: number;
  /** Maximum single-delay cap, in ms. Default: 5000. */
  maxDelayMs?: number;
  /** Per-attempt timeout in ms. 0 = disabled (let the underlying fetch
   * hang indefinitely). Default: 15000 — secure-by-default so a stalled
   * proxy / dead connection never leaves the UI in a permanent loading
   * state. Callers that need long-running ops (file downloads, slow
   * imports) should pass a larger value or 0 to opt out. */
  timeoutMs?: number;
  /** Hard cap on how long we'll honour a RateLimitError's
   * retryAfterMs. If the server tells us to wait longer than this, we
   * stop retrying immediately and surface the error to the caller.
   * Default: 30000ms — anything longer feels like a real outage and
   * the UI should fall back to cached / empty state. */
  maxRateLimitWaitMs?: number;
  /** Optional predicate: return false to stop retrying on a specific
   * error (e.g. 401 unauthorized — retry won't fix it). */
  shouldRetry?: (err: unknown, attemptNumber: number) => boolean;
  /** Called once per retry, just before the wait. Hook for logging/UI. */
  onRetry?: (err: unknown, attemptNumber: number, delayMs: number) => void;
}

const DEFAULTS = {
  attempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  // 15s per attempt. With 3 attempts + ~3.5s cumulative backoff, the
  // worst-case user wait before "loading failed" is ~50s. Anything
  // longer feels broken; anything shorter makes us flaky under slow
  // mobile / hotel wifi.
  timeoutMs: 15000,
  maxRateLimitWaitMs: 30000,
  shouldRetry: () => true,
  onRetry: () => {},
} as const;

/** Try `fn` with exponential backoff. Resolves the last successful
 * result, or rejects with the LAST error if every attempt failed. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const cfg = { ...DEFAULTS, ...opts };
  let lastError: unknown;
  for (let i = 1; i <= cfg.attempts; i++) {
    try {
      if (cfg.timeoutMs > 0) {
        return await withTimeout(fn(), cfg.timeoutMs);
      }
      return await fn();
    } catch (err) {
      lastError = err;
      if (i >= cfg.attempts) break;
      if (!cfg.shouldRetry(err, i)) break;
      // Rate-limit path: honour the server's Retry-After hint instead
      // of our own backoff. If the hint exceeds maxRateLimitWaitMs we
      // give up immediately rather than block the UI for ages.
      let delay: number;
      if (err instanceof RateLimitError && typeof err.retryAfterMs === "number") {
        if (err.retryAfterMs > cfg.maxRateLimitWaitMs) {
          // Bail — don't fire onRetry (we're not retrying) and surface
          // the original error to the caller.
          break;
        }
        delay = err.retryAfterMs;
      } else {
        // exp backoff with jitter: base * 2^(i-1) ± up to 30%
        const exp = cfg.baseDelayMs * Math.pow(2, i - 1);
        const capped = Math.min(exp, cfg.maxDelayMs);
        delay = capped * (0.7 + Math.random() * 0.6); // 70-130%
      }
      cfg.onRetry(err, i, delay);
      await sleep(delay);
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}
