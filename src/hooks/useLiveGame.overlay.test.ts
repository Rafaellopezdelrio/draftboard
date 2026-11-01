// Regression: the overlay subscribes via an async listen(). If the hook
// unmounts before listen() resolves, cleanup runs with no unlisten handle
// yet — the listener must still be released once listen() settles.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const unlisten = vi.fn();
let resolveListen: (fn: () => void) => void = () => {};
const listen = vi.fn(
  () => new Promise<() => void>((resolve) => (resolveListen = resolve)),
);

vi.mock("@tauri-apps/api/event", () => ({ listen, emit: vi.fn() }));
vi.mock("../services/overlay", () => ({ isOverlayWindow: () => true }));

import { useLiveGame } from "./useLiveGame";

describe("useLiveGame — overlay listener cleanup", () => {
  beforeEach(() => {
    unlisten.mockReset();
    listen.mockClear();
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      writable: true,
      configurable: true,
    });
  });

  it("unmount before listen() resolves → listener still released", async () => {
    const { unmount } = renderHook(() => useLiveGame());
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());

    unmount();
    resolveListen(unlisten);
    await vi.waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
  });

  it("unmount after listen() resolves → released exactly once", async () => {
    const { unmount } = renderHook(() => useLiveGame());
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    resolveListen(unlisten);
    await Promise.resolve();
    await Promise.resolve();

    unmount();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
