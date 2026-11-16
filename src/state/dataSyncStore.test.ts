import { describe, it, expect, beforeEach, vi } from "vitest";
import { DATA_UPDATED_EVENT, runDataSync, useDataSyncStore } from "./dataSyncStore";

beforeEach(() => {
  useDataSyncStore.setState({ running: null, status: "", done: 0, total: 0, result: null });
});

describe("runDataSync", () => {
  it("keeps the progress while running and the message when done", async () => {
    let release!: (text: string) => void;
    const updated = vi.fn();
    window.addEventListener(DATA_UPDATED_EVENT, updated);

    const run = runDataSync(
      "top",
      "starting",
      (onProgress) => {
        onProgress({ phase: "Downloading", done: 3, total: 10 });
        return new Promise<string>((res) => (release = res));
      },
      String
    );
    expect(useDataSyncStore.getState()).toMatchObject({
      running: "top",
      status: "Downloading: 3/10",
      done: 3,
      total: 10,
      result: null,
    });
    expect(updated).not.toHaveBeenCalled();

    release("all done");
    expect(await run).toBe(true);
    expect(useDataSyncStore.getState()).toMatchObject({ running: null, status: "all done", result: "ok" });
    expect(updated).toHaveBeenCalledTimes(1);
    window.removeEventListener(DATA_UPDATED_EVENT, updated);
  });

  it("refuses a second download while one is in flight", async () => {
    let release!: (text: string) => void;
    const first = runDataSync("top", "one", () => new Promise<string>((res) => (release = res)), String);
    const second = vi.fn(async () => "two");

    expect(await runDataSync("pro", "two", second, String)).toBe(false);
    expect(second).not.toHaveBeenCalled();
    expect(useDataSyncStore.getState().running).toBe("top");

    release("ok");
    await first;
  });

  it("keeps the error text, frees the slot and announces nothing", async () => {
    const updated = vi.fn();
    window.addEventListener(DATA_UPDATED_EVENT, updated);

    await runDataSync(
      "soloq",
      "starting",
      async () => {
        throw new Error("timeout");
      },
      (e) => `Failed: ${(e as Error).message}`
    );

    expect(useDataSyncStore.getState()).toMatchObject({ running: null, status: "Failed: timeout", result: "error" });
    expect(updated).not.toHaveBeenCalled();
    window.removeEventListener(DATA_UPDATED_EVENT, updated);
  });

  it("dismiss clears the last result", async () => {
    await runDataSync("pro", "starting", async () => "done", String);
    useDataSyncStore.getState().dismiss();
    expect(useDataSyncStore.getState()).toMatchObject({ status: "", result: null, running: null });
  });
});
