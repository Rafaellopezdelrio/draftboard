// @vitest-environment jsdom
//
// Lock down the health aggregation logic:
//   - "offline" beats everything (no network OR no worker)
//   - "degraded" after a fetch failure within the 5min window
//   - "ok" otherwise
//   - Snap back to "ok" after the window expires
//
// We mock useNetworkStatus so the OS/worker probe doesn't run during
// tests. fetchNotify is real — its emitter is module-state we reset.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHealthStatus } from "./useHealthStatus";
import {
  emitFetchFailure,
  _resetFetchNotifyForTests,
} from "../services/fetchNotify";

// Mock useNetworkStatus to a happy default. Individual tests override
// via vi.mocked(...).mockReturnValueOnce(...) when they need offline.
vi.mock("./useNetworkStatus", () => ({
  useNetworkStatus: vi.fn(() => ({
    online: true,
    workerReachable: true,
    ok: true,
    lastOkAt: Date.now(),
    retry: vi.fn(),
  })),
}));

import { useNetworkStatus } from "./useNetworkStatus";

beforeEach(() => {
  _resetFetchNotifyForTests();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  // restore default happy mock
  vi.mocked(useNetworkStatus).mockReturnValue({
    online: true,
    workerReachable: true,
    ok: true,
    lastOkAt: Date.now(),
    retry: vi.fn(),
  });
});

describe("useHealthStatus", () => {
  it("returns level=ok when network is fine and no failures recorded", () => {
    const { result } = renderHook(() => useHealthStatus());
    expect(result.current.level).toBe("ok");
    expect(result.current.label).toBe("OK");
  });

  it("returns level=offline when navigator.onLine is false", () => {
    vi.mocked(useNetworkStatus).mockReturnValue({
      online: false,
      workerReachable: false,
      ok: false,
      lastOkAt: null,
      retry: vi.fn(),
    });
    const { result } = renderHook(() => useHealthStatus());
    expect(result.current.level).toBe("offline");
    expect(result.current.label).toBe("Sin conexión");
  });

  it("returns level=offline with 'Backend caído' when worker probe fails", () => {
    vi.mocked(useNetworkStatus).mockReturnValue({
      online: true,
      workerReachable: false,
      ok: false,
      lastOkAt: null,
      retry: vi.fn(),
    });
    const { result } = renderHook(() => useHealthStatus());
    expect(result.current.level).toBe("offline");
    expect(result.current.label).toBe("Backend caído");
  });

  it("flips to degraded when a fetch failure is emitted", () => {
    const { result } = renderHook(() => useHealthStatus());
    expect(result.current.level).toBe("ok");
    act(() => {
      emitFetchFailure("op.gg meta", new Error("boom"));
    });
    expect(result.current.level).toBe("degraded");
    expect(result.current.lastFailureSource).toBe("op.gg meta");
    expect(result.current.detail).toContain("op.gg meta");
  });

  it("offline still wins over a recent degraded signal", () => {
    const { result, rerender } = renderHook(() => useHealthStatus());
    act(() => {
      emitFetchFailure("DDragon", new Error("x"));
    });
    expect(result.current.level).toBe("degraded");
    // Network dies — must promote to offline.
    vi.mocked(useNetworkStatus).mockReturnValue({
      online: false,
      workerReachable: false,
      ok: false,
      lastOkAt: null,
      retry: vi.fn(),
    });
    rerender();
    expect(result.current.level).toBe("offline");
  });

  it("snaps back to ok after the 5min degraded window expires", () => {
    const { result } = renderHook(() => useHealthStatus());
    act(() => {
      emitFetchFailure("Pro builds", new Error("x"));
    });
    expect(result.current.level).toBe("degraded");
    // Advance past 5min — the internal 30s tick fires + the window check
    // returns false → level snaps to ok.
    act(() => {
      vi.advanceTimersByTime(5 * 60_000 + 1_000);
    });
    expect(result.current.level).toBe("ok");
  });
});
