// Mounted-hook behavior: OS online/offline events, the periodic worker probe
// (debounce, timeout, hidden-window skip) and retry(). The pure debounce
// reducer is covered in useNetworkStatus.test.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useNetworkStatus } from "./useNetworkStatus";
import { WORKER_HEALTH_URL, POLL_INTERVALS_MS, NETWORK_TIMEOUTS_MS } from "../config";

const fetchMock = vi.fn();

function ok() {
  return Promise.resolve({ ok: true } as Response);
}
function bad() {
  return Promise.resolve({ ok: false } as Response);
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

let hidden = false;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  // Drop the instance overrides so the jsdom prototype getters come back.
  delete (document as unknown as Record<string, unknown>).hidden;
  delete (navigator as unknown as Record<string, unknown>).onLine;
});

describe("useNetworkStatus", () => {
  it("probes the worker on mount and records the success time", async () => {
    fetchMock.mockImplementation(ok);
    const { result } = renderHook(() => useNetworkStatus());
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      WORKER_HEALTH_URL,
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) })
    );
    expect(result.current.workerReachable).toBe(true);
    expect(result.current.ok).toBe(true);
    expect(result.current.lastOkAt).toBe(Date.now());
  });

  it("starts from navigator.onLine and follows offline/online events", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    fetchMock.mockImplementation(ok);
    const { result } = renderHook(() => useNetworkStatus());
    await flush();
    expect(result.current.online).toBe(false);
    expect(result.current.ok).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current.online).toBe(true);
    expect(result.current.ok).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.online).toBe(false);
    expect(result.current.ok).toBe(false);
  });

  it("flags the worker unreachable only after two consecutive failed probes", async () => {
    fetchMock.mockImplementation(bad);
    const { result } = renderHook(() => useNetworkStatus());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.workerReachable).toBe(true); // single miss absorbed

    await flush(POLL_INTERVALS_MS.workerHealth);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.workerReachable).toBe(false);
    expect(result.current.ok).toBe(false);
    expect(result.current.lastOkAt).toBeNull();
  });

  it("retry() re-probes immediately and recovers on success", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useNetworkStatus());
    await flush();
    await flush(POLL_INTERVALS_MS.workerHealth);
    expect(result.current.workerReachable).toBe(false);

    fetchMock.mockImplementation(ok);
    await act(async () => {
      await result.current.retry();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.workerReachable).toBe(true);
    expect(result.current.lastOkAt).toBe(Date.now());
  });

  it("aborts a hung probe after the health timeout and counts it as a miss", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          signal = init.signal!;
          signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
        })
    );
    const { result } = renderHook(() => useNetworkStatus());
    await flush(NETWORK_TIMEOUTS_MS.healthProbe - 1);
    expect(signal!.aborted).toBe(false);
    await flush(1);
    expect(signal!.aborted).toBe(true);
    expect(result.current.workerReachable).toBe(true); // first miss absorbed

    // Next tick hangs too: the second aborted probe flips the worker unreachable.
    await flush(POLL_INTERVALS_MS.workerHealth + NETWORK_TIMEOUTS_MS.healthProbe);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.workerReachable).toBe(false);
  });

  it("does not probe while the window is hidden and resumes when visible", async () => {
    hidden = true;
    fetchMock.mockImplementation(ok);
    renderHook(() => useNetworkStatus());
    await flush();
    await flush(POLL_INTERVALS_MS.workerHealth);
    expect(fetchMock).not.toHaveBeenCalled();

    hidden = false;
    await flush(POLL_INTERVALS_MS.workerHealth);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops polling on unmount", async () => {
    fetchMock.mockImplementation(ok);
    const { unmount } = renderHook(() => useNetworkStatus());
    await flush();
    unmount();
    await flush(POLL_INTERVALS_MS.workerHealth * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps retry referentially stable across renders", async () => {
    fetchMock.mockImplementation(ok);
    const { result, rerender } = renderHook(() => useNetworkStatus());
    const first = result.current.retry;
    await flush();
    rerender();
    expect(result.current.retry).toBe(first);
  });
});
