// Pin down the exponential-backoff retry behaviour. Any drift here
// changes how the app responds to flaky networks — too aggressive =
// rate-limit ourselves, too lax = users see "loading" forever.

import { describe, it, expect, vi } from "vitest";
import {
  withRetry,
  RateLimitError,
  parseRetryAfter,
  throwIfRateLimited,
} from "./retry";

function mockResponse(status: number, retryAfter?: string) {
  const headers = new Map<string, string>();
  if (retryAfter !== undefined) headers.set("retry-after", retryAfter);
  return {
    status,
    headers: {
      get: (k: string) => headers.get(k.toLowerCase()) ?? null,
    },
  };
}

describe("withRetry", () => {
  it("returns the first successful result without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on rejection up to `attempts` times", async () => {
    let calls = 0;
    const fn = vi.fn(() => {
      calls++;
      if (calls < 3) return Promise.reject(new Error("nope"));
      return Promise.resolve("done");
    });
    const result = await withRetry(fn, { attempts: 5, baseDelayMs: 1 });
    expect(result).toBe("done");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws the LAST error when all attempts fail", async () => {
    let n = 0;
    const fn = vi.fn(() => Promise.reject(new Error(`err${++n}`)));
    await expect(
      withRetry(fn, { attempts: 3, baseDelayMs: 1 })
    ).rejects.toThrow(/err3/);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops retrying when shouldRetry returns false", async () => {
    let n = 0;
    const fn = vi.fn(() => Promise.reject(new Error(`fatal-${++n}`)));
    await expect(
      withRetry(fn, {
        attempts: 5,
        baseDelayMs: 1,
        shouldRetry: () => false,
      })
    ).rejects.toThrow();
    // 1 attempt total — shouldRetry stopped any retry.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("respects the attempts:1 boundary (no retries)", async () => {
    const fn = vi.fn(() => Promise.reject(new Error("once")));
    await expect(withRetry(fn, { attempts: 1, baseDelayMs: 1 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls onRetry before each backoff delay", async () => {
    const onRetry = vi.fn();
    let n = 0;
    const fn = () => {
      n++;
      return n < 3 ? Promise.reject(new Error("x")) : Promise.resolve("ok");
    };
    await withRetry(fn, { attempts: 5, baseDelayMs: 1, onRetry });
    // 2 retries fired before the 3rd success.
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 1, expect.any(Number));
  });

  it("rejects with a timeout error when timeoutMs is exceeded", async () => {
    // Margin chosen large enough to never flake even on a slow CI runner:
    // 2000ms slow promise vs 50ms timeout = 40× margin. The previous values
    // (100ms vs 20ms) gave only 5× and could race under load.
    const slow = () =>
      new Promise<string>((resolve) => setTimeout(() => resolve("late"), 2000));
    await expect(
      withRetry(slow, { attempts: 1, timeoutMs: 50 })
    ).rejects.toThrow(/Timeout/);
  });

  it("applies the default 15s timeout when caller omits timeoutMs (no infinite hang)", async () => {
    // Secure-by-default contract: omitting timeoutMs uses the 15s default
    // so a stalled proxy can never leave the UI in a permanent loading
    // state. We verify this with fake timers — advance past 15s and the
    // promise must reject with Timeout. Without the default we would
    // wait forever and the test would hang until vitest killed it.
    vi.useFakeTimers();
    try {
      const never = () => new Promise<string>(() => {});
      const rejectedAtTimeout = expect(
        withRetry(never, { attempts: 1 })
      ).rejects.toThrow(/Timeout/);
      // Advance 15001ms — one tick past the default — and the timer fires.
      await vi.advanceTimersByTimeAsync(15001);
      await rejectedAtTimeout;
    } finally {
      vi.useRealTimers();
    }
  });

  it("succeeds within timeout when fn resolves fast enough", async () => {
    // Microtask-resolved promise vs 1s timeout — no scheduler race possible.
    const quick = () => Promise.resolve("fast");
    const result = await withRetry(quick, { attempts: 1, timeoutMs: 1000 });
    expect(result).toBe("fast");
  });

  it("uses RateLimitError.retryAfterMs instead of exp backoff for the next attempt", async () => {
    // Server says "wait 200ms before trying again" — our exp backoff
    // would only wait baseDelayMs=10. The reported delay must match
    // the server hint, not our default curve.
    const delays: number[] = [];
    let n = 0;
    const fn = vi.fn(() => {
      n++;
      if (n === 1) throw new RateLimitError("429", 200);
      return Promise.resolve("ok");
    });
    const out = await withRetry(fn, {
      attempts: 3,
      baseDelayMs: 10,
      onRetry: (_e, _i, d) => delays.push(d),
    });
    expect(out).toBe("ok");
    expect(delays).toEqual([200]);
  });

  it("gives up immediately when retryAfterMs exceeds maxRateLimitWaitMs", async () => {
    // Server tells us to wait 60s but our cap is 5s. We should bail
    // straight to the caller (no further attempts, no onRetry fired).
    const onRetry = vi.fn();
    const fn = vi.fn(() => {
      throw new RateLimitError("rate limited", 60_000);
    });
    await expect(
      withRetry(fn, { attempts: 5, baseDelayMs: 1, maxRateLimitWaitMs: 5_000, onRetry })
    ).rejects.toBeInstanceOf(RateLimitError);
    // Only the first call was made — no retries.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("falls back to exp backoff when RateLimitError has no retryAfterMs", async () => {
    // Server returned 429 but no Retry-After header — caller throws
    // RateLimitError without the hint. We should treat it like any
    // other error and use our own backoff.
    const delays: number[] = [];
    let n = 0;
    const fn = vi.fn(() => {
      n++;
      if (n === 1) throw new RateLimitError("no header");
      return Promise.resolve("ok");
    });
    await withRetry(fn, {
      attempts: 2,
      baseDelayMs: 50,
      onRetry: (_e, _i, d) => delays.push(d),
    });
    expect(delays).toHaveLength(1);
    expect(delays[0]).toBeGreaterThanOrEqual(50 * 0.7);
    expect(delays[0]).toBeLessThanOrEqual(50 * 1.3 + 1);
  });

  it("delays grow exponentially (sanity check on the curve)", async () => {
    // We measure perceived delay between retries by recording the delay
    // each onRetry call reports. With base 10, attempts 4: delays should
    // be ~10, ~20, ~40 (±30% jitter). Cap at 1000 not exceeded.
    const delays: number[] = [];
    let n = 0;
    const fn = () => Promise.reject(new Error(`a${++n}`));
    await expect(
      withRetry(fn, {
        attempts: 4,
        baseDelayMs: 10,
        maxDelayMs: 1000,
        onRetry: (_e, _i, d) => delays.push(d),
      })
    ).rejects.toThrow();
    expect(delays).toHaveLength(3);
    // Each delay should be at least the previous one's lower bound
    // (allowing for jitter 70-130%).
    expect(delays[1]).toBeGreaterThan(delays[0] * 0.5);
    expect(delays[2]).toBeGreaterThan(delays[1] * 0.5);
    // Final delay capped at maxDelayMs * 1.3 (jitter ceiling).
    expect(delays[2]).toBeLessThanOrEqual(1000 * 1.3 + 1);
  });
});

describe("parseRetryAfter", () => {
  it("parses delta-seconds form (integer)", () => {
    expect(parseRetryAfter("120")).toBe(120_000);
    expect(parseRetryAfter("0")).toBe(0);
  });

  it("returns undefined for empty / null / undefined", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter("")).toBeUndefined();
  });

  it("returns undefined for non-numeric, non-date garbage", () => {
    expect(parseRetryAfter("not a number")).toBeUndefined();
    expect(parseRetryAfter("12.5")).toBeUndefined(); // RFC: integer only
  });

  it("parses HTTP-date form and returns positive ms in the future", () => {
    const future = new Date(Date.now() + 60_000).toUTCString();
    const ms = parseRetryAfter(future);
    // Allow ±2s margin for clock skew between Date.now() calls.
    expect(ms).toBeGreaterThan(58_000);
    expect(ms).toBeLessThanOrEqual(60_000);
  });

  it("clamps past dates to 0 (don't pass negative delay to setTimeout)", () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(parseRetryAfter(past)).toBe(0);
  });

  it("trims whitespace around the value", () => {
    expect(parseRetryAfter("  42  ")).toBe(42_000);
  });
});

describe("throwIfRateLimited", () => {
  it("is a no-op when status is not 429", () => {
    expect(() => throwIfRateLimited(mockResponse(200))).not.toThrow();
    expect(() => throwIfRateLimited(mockResponse(500))).not.toThrow();
    expect(() => throwIfRateLimited(mockResponse(404))).not.toThrow();
  });

  it("throws RateLimitError with parsed retryAfterMs on 429", () => {
    try {
      throwIfRateLimited(mockResponse(429, "10"), "https://example.com");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      const rl = e as RateLimitError;
      expect(rl.retryAfterMs).toBe(10_000);
      expect(rl.message).toContain("https://example.com");
    }
  });

  it("throws RateLimitError with undefined retryAfterMs when header missing", () => {
    try {
      throwIfRateLimited(mockResponse(429));
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      expect((e as RateLimitError).retryAfterMs).toBeUndefined();
    }
  });

  it("uses plain HTTP 429 message when contextLabel omitted", () => {
    try {
      throwIfRateLimited(mockResponse(429, "5"));
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toBe("HTTP 429");
    }
  });
});

describe("RateLimitError", () => {
  it("preserves retryAfterMs property", () => {
    const e = new RateLimitError("429", 5000);
    expect(e.retryAfterMs).toBe(5000);
    expect(e.name).toBe("RateLimitError");
    expect(e).toBeInstanceOf(Error);
  });

  it("allows omitting retryAfterMs", () => {
    const e = new RateLimitError("rate limited");
    expect(e.retryAfterMs).toBeUndefined();
  });
});
