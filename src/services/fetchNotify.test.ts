// Lock down the fetchNotify pub/sub contract: throttling per source,
// multiple subscribers, unsubscribe, defensive subscriber errors. This
// module is the bridge between async service failures and the React
// toast layer — silent breakage here = user sees blank panels with no
// explanation.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  emitFetchFailure,
  subscribeFetchFailure,
  _resetFetchNotifyForTests,
} from "./fetchNotify";

beforeEach(() => {
  _resetFetchNotifyForTests();
  vi.useRealTimers();
});

describe("fetchNotify", () => {
  it("delivers to subscribers when emitting", () => {
    const fn = vi.fn();
    subscribeFetchFailure(fn);
    const dispatched = emitFetchFailure("op.gg meta", new Error("boom"));
    expect(dispatched).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({
      source: "op.gg meta",
      error: expect.any(Error),
    });
  });

  it("throttles repeated emissions from the same source within 30s", () => {
    const fn = vi.fn();
    subscribeFetchFailure(fn);
    expect(emitFetchFailure("op.gg meta", new Error("a"))).toBe(true);
    expect(emitFetchFailure("op.gg meta", new Error("b"))).toBe(false);
    expect(emitFetchFailure("op.gg meta", new Error("c"))).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT throttle different sources against each other", () => {
    const fn = vi.fn();
    subscribeFetchFailure(fn);
    expect(emitFetchFailure("op.gg meta", new Error("a"))).toBe(true);
    expect(emitFetchFailure("DDragon", new Error("b"))).toBe(true);
    expect(emitFetchFailure("Pro builds", new Error("c"))).toBe(true);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("allows re-emission after the 30s window expires", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    subscribeFetchFailure(fn);
    expect(emitFetchFailure("op.gg meta", new Error("a"))).toBe(true);
    vi.advanceTimersByTime(29_999);
    expect(emitFetchFailure("op.gg meta", new Error("b"))).toBe(false);
    vi.advanceTimersByTime(2);
    expect(emitFetchFailure("op.gg meta", new Error("c"))).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("delivers to multiple subscribers in parallel", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeFetchFailure(a);
    subscribeFetchFailure(b);
    emitFetchFailure("DDragon", new Error("x"));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe stops further delivery to that listener only", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeFetchFailure(a);
    subscribeFetchFailure(b);
    offA();
    emitFetchFailure("DDragon", new Error("x"));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("a thrown subscriber doesn't break sibling subscribers or the emitter", () => {
    const bad = vi.fn(() => {
      throw new Error("subscriber bug");
    });
    const good = vi.fn();
    subscribeFetchFailure(bad);
    subscribeFetchFailure(good);
    // emit must not throw despite the bad subscriber
    expect(() =>
      emitFetchFailure("DDragon", new Error("x"))
    ).not.toThrow();
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });

  it("returns false (no dispatch) when the source is throttled", () => {
    subscribeFetchFailure(() => {});
    expect(emitFetchFailure("op.gg meta", new Error("a"))).toBe(true);
    expect(emitFetchFailure("op.gg meta", new Error("b"))).toBe(false);
  });
});
