// Lock down the shape + sane defaults of the centralised config. These
// values feed prod URLs, polling cadences and timeouts. A bad value here
// shows up as user-visible perf or correctness regressions.

import { describe, it, expect } from "vitest";
import {
  NETWORK_TIMEOUTS_MS,
  POLL_INTERVALS_MS,
  TERMS_VERSION,
  WORKER_BASE_URL,
  WORKER_HEALTH_URL,
  WORKER_UPDATER_URL,
} from "./config";

describe("config", () => {
  it("TERMS_VERSION is a positive integer (>=1 → user has been prompted)", () => {
    expect(Number.isInteger(TERMS_VERSION)).toBe(true);
    expect(TERMS_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("WORKER_BASE_URL is the HTTPS Cloudflare Worker", () => {
    expect(WORKER_BASE_URL).toMatch(/^https:\/\/.*\.workers\.dev$/);
  });

  it("derived URLs are children of the base URL", () => {
    expect(WORKER_HEALTH_URL.startsWith(WORKER_BASE_URL)).toBe(true);
    expect(WORKER_UPDATER_URL.startsWith(WORKER_BASE_URL)).toBe(true);
  });

  it("polling intervals are positive milliseconds within sane bounds", () => {
    for (const [name, ms] of Object.entries(POLL_INTERVALS_MS)) {
      expect(ms, name).toBeGreaterThan(0);
      expect(ms, name).toBeLessThanOrEqual(60_000); // nothing slower than 60s
    }
  });

  it("liveGame is faster than liveGameSlow (active polling tighter than idle)", () => {
    expect(POLL_INTERVALS_MS.liveGame).toBeLessThan(POLL_INTERVALS_MS.liveGameSlow);
  });

  it("overlayTopmost is at least 500ms (avoid CPU thrash from SetWindowPos)", () => {
    expect(POLL_INTERVALS_MS.overlayTopmost).toBeGreaterThanOrEqual(500);
  });

  it("network timeouts are between 1s and 10s (aggressive but not flaky)", () => {
    for (const [name, ms] of Object.entries(NETWORK_TIMEOUTS_MS)) {
      expect(ms, name).toBeGreaterThanOrEqual(1_000);
      expect(ms, name).toBeLessThanOrEqual(10_000);
    }
  });

  it("worker health probe interval is much larger than per-probe timeout", () => {
    // Otherwise probes pile up — if interval == timeout we never get an
    // idle moment.
    expect(POLL_INTERVALS_MS.workerHealth).toBeGreaterThan(
      NETWORK_TIMEOUTS_MS.healthProbe * 5
    );
  });
});
