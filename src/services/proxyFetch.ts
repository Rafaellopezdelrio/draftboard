// Shared GET-JSON-through-the-proxy helper. opggMeta / opggBuilds /
// opggMatchups / dpmTierlist / proBuilds each carried a byte-identical
// withRetry(...) block (only the response type differed). Hoisting it here
// gives one place to tune the retry policy + one resilience seam if a source
// changes shape — the callers keep their own caching, fallbacks and
// post-processing.

import { withRetry, RateLimitError, throwIfRateLimited } from "./retry";
import { httpFetch } from "./httpClient";
import { trackFetch } from "./breadcrumbs";

/**
 * GET `url` and parse the JSON body, with 3 retries (exp backoff) on flake/5xx
 * and on 429 (honouring Retry-After via throwIfRateLimited). 4xx other than 429
 * are surfaced immediately — they're bad params, not flake. Logs a breadcrumb
 * on success and on each retry. Throws on final failure; the caller decides the
 * fallback (empty list / null / cached value).
 */
export function fetchProxyJson<T>(url: string): Promise<T> {
  return withRetry(
    async () => {
      const res = await httpFetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      // Rate-limit: throwIfRateLimited reads Retry-After + throws RateLimitError
      // so withRetry honours the server's hint instead of exp backoff.
      throwIfRateLimited(res, url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      trackFetch(url, "ok");
      return (await res.json()) as T;
    },
    {
      attempts: 3,
      baseDelayMs: 500,
      // Retry 429 (handled above via RateLimitError + Retry-After) + flake/5xx.
      // Other 4xx are non-retriable programmer errors — surface immediately.
      shouldRetry: (err) => {
        if (err instanceof RateLimitError) return true;
        return !String((err as Error)?.message ?? "").match(/HTTP 4\d\d/);
      },
      onRetry: (e, n) =>
        trackFetch(url, "fail", `attempt ${n}: ${String(e).slice(0, 80)}`),
    }
  );
}
