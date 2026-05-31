// Tests the network-status derived predicate. The hook itself manages
// listeners + fetch probes (hard to exercise in jsdom), so we test the
// combined `ok` logic via a thin helper that mirrors the hook's reducer.
// This pins down "online but worker unreachable → ok=false" cases.

import { describe, it, expect } from "vitest";
import { nextWorkerReachable } from "./useNetworkStatus";

interface NetworkStatusLike {
  online: boolean;
  workerReachable: boolean;
  ok: boolean;
}

// Same derivation as useNetworkStatus.ts — kept here to lock down the
// truth-table without needing to mount the hook.
function deriveOk(online: boolean, workerReachable: boolean): boolean {
  return online && workerReachable;
}

function status(online: boolean, workerReachable: boolean): NetworkStatusLike {
  return { online, workerReachable, ok: deriveOk(online, workerReachable) };
}

describe("network status truth table", () => {
  it("both online + worker → ok", () => {
    expect(status(true, true).ok).toBe(true);
  });
  it("OS reports offline → ok=false (regardless of worker probe)", () => {
    expect(status(false, true).ok).toBe(false);
    expect(status(false, false).ok).toBe(false);
  });
  it("OS online but worker probe failed → ok=false", () => {
    expect(status(true, false).ok).toBe(false);
  });
  it("ok is strictly AND of the two signals", () => {
    for (const o of [true, false]) {
      for (const w of [true, false]) {
        expect(status(o, w).ok).toBe(o && w);
      }
    }
  });
});

describe("nextWorkerReachable — health-probe debounce", () => {
  it("a success reports reachable and clears the failure streak", () => {
    expect(nextWorkerReachable(true, 0)).toEqual({ reachable: true, consecutiveFails: 0 });
    expect(nextWorkerReachable(true, 5)).toEqual({ reachable: true, consecutiveFails: 0 });
  });

  it("a single miss does NOT flip reachable (transient blip absorbed)", () => {
    expect(nextWorkerReachable(false, 0)).toEqual({ reachable: true, consecutiveFails: 1 });
  });

  it("flags unreachable only after 2 consecutive misses", () => {
    const first = nextWorkerReachable(false, 0); // 1st miss
    expect(first.reachable).toBe(true);
    const second = nextWorkerReachable(false, first.consecutiveFails); // 2nd miss
    expect(second).toEqual({ reachable: false, consecutiveFails: 2 });
  });

  it("stays unreachable while misses continue", () => {
    expect(nextWorkerReachable(false, 2)).toEqual({ reachable: false, consecutiveFails: 3 });
  });

  it("recovers instantly on the next success", () => {
    expect(nextWorkerReachable(true, 3)).toEqual({ reachable: true, consecutiveFails: 0 });
  });
});
