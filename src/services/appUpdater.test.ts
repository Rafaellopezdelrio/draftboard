import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const plugins = vi.hoisted(() => ({ check: vi.fn(), relaunch: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: plugins.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: plugins.relaunch }));

import { checkForUpdate, installUpdate, useUpdateCheck } from "./appUpdater";
import { usePrefsStore } from "../state/prefsStore";

type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

function fakeUpdate(events: DownloadEvent[] = [], fail?: Error) {
  return {
    available: true,
    version: "0.5.0",
    currentVersion: "0.4.2",
    body: "Notas de la versión",
    downloadAndInstall: vi.fn(async (cb: (e: DownloadEvent) => void) => {
      for (const e of events) cb(e);
      if (fail) throw fail;
    }),
  };
}

function setTauri(on: boolean) {
  if (on) {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      value: {},
      writable: true,
      configurable: true,
    });
  } else {
    delete (globalThis as Record<string, unknown>).__TAURI_INTERNALS__;
  }
}

beforeEach(() => {
  plugins.check.mockReset();
  plugins.relaunch.mockReset().mockResolvedValue(undefined);
  setTauri(true);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  setTauri(true);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("checkForUpdate", () => {
  it("reports unavailable outside the desktop app without calling the plugin", async () => {
    setTauri(false);
    expect(await checkForUpdate()).toEqual({ available: false });
    expect(plugins.check).not.toHaveBeenCalled();
  });

  it("maps an available update to version info", async () => {
    plugins.check.mockResolvedValue(fakeUpdate());
    expect(await checkForUpdate("beta")).toEqual({
      available: true,
      version: "0.5.0",
      currentVersion: "0.4.2",
      releaseNotes: "Notas de la versión",
    });
  });

  it("drops a null release body to undefined", async () => {
    plugins.check.mockResolvedValue({ ...fakeUpdate(), body: null });
    expect((await checkForUpdate()).releaseNotes).toBeUndefined();
  });

  it("reports unavailable when there is no update", async () => {
    plugins.check.mockResolvedValueOnce(null);
    expect(await checkForUpdate()).toEqual({ available: false });
    plugins.check.mockResolvedValueOnce({ available: false });
    expect(await checkForUpdate()).toEqual({ available: false });
  });

  it("swallows plugin errors (never blocks startup)", async () => {
    plugins.check.mockRejectedValue(new Error("signature mismatch"));
    expect(await checkForUpdate()).toEqual({ available: false });
    expect(console.warn).toHaveBeenCalledWith("[updater] check failed:", expect.any(Error));
  });
});

describe("installUpdate", () => {
  it("returns false outside the desktop app", async () => {
    setTauri(false);
    expect(await installUpdate()).toBe(false);
    expect(plugins.check).not.toHaveBeenCalled();
  });

  it("returns false without relaunching when nothing is available", async () => {
    plugins.check.mockResolvedValue(null);
    expect(await installUpdate()).toBe(false);
    expect(plugins.relaunch).not.toHaveBeenCalled();
  });

  it("reports cumulative download progress, then relaunches", async () => {
    const update = fakeUpdate([
      { event: "Started", data: { contentLength: 1000 } },
      { event: "Progress", data: { chunkLength: 400 } },
      { event: "Progress", data: { chunkLength: 600 } },
      { event: "Finished" },
    ]);
    plugins.check.mockResolvedValue(update);
    const onProgress = vi.fn();
    expect(await installUpdate(onProgress)).toBe(true);
    expect(onProgress.mock.calls).toEqual([
      [400, 1000],
      [1000, 1000],
      [1000, 1000],
    ]);
    expect(plugins.relaunch).toHaveBeenCalledTimes(1);
  });

  it("treats a missing content length as 0 and works without a progress callback", async () => {
    const onProgress = vi.fn();
    plugins.check.mockResolvedValue(
      fakeUpdate([
        { event: "Started", data: {} },
        { event: "Progress", data: { chunkLength: 50 } },
      ])
    );
    expect(await installUpdate(onProgress)).toBe(true);
    expect(onProgress).toHaveBeenCalledWith(50, 0);

    plugins.check.mockResolvedValue(fakeUpdate([{ event: "Finished" }]));
    expect(await installUpdate()).toBe(true);
  });

  it("returns false and does not relaunch when the download fails", async () => {
    plugins.check.mockResolvedValue(fakeUpdate([], new Error("disk full")));
    expect(await installUpdate()).toBe(false);
    expect(plugins.relaunch).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("[updater] install failed:", expect.any(Error));
  });
});

describe("useUpdateCheck", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const prefs = usePrefsStore.getState().prefs;
    usePrefsStore.setState({ prefs: { ...prefs, updateChannel: "stable" } });
  });

  it("checks 3s after mount and exposes the result", async () => {
    plugins.check.mockResolvedValue(fakeUpdate());
    const { result } = renderHook(() => useUpdateCheck());
    expect(result.current).toEqual({ available: false });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2999);
    });
    expect(plugins.check).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await vi.waitFor(() => expect(result.current.available).toBe(true));
    expect(result.current.version).toBe("0.5.0");
  });

  it("never checks when disabled", async () => {
    renderHook(() => useUpdateCheck(false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(plugins.check).not.toHaveBeenCalled();
  });

  it("cancels the pending check on unmount", async () => {
    const { unmount } = renderHook(() => useUpdateCheck());
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(plugins.check).not.toHaveBeenCalled();
  });

  it("re-checks when the update channel changes", async () => {
    plugins.check.mockResolvedValue(null);
    renderHook(() => useUpdateCheck());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await vi.waitFor(() => expect(plugins.check).toHaveBeenCalledTimes(1));

    act(() => {
      const prefs = usePrefsStore.getState().prefs;
      usePrefsStore.setState({ prefs: { ...prefs, updateChannel: "beta" } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await vi.waitFor(() => expect(plugins.check).toHaveBeenCalledTimes(2));
  });
});
