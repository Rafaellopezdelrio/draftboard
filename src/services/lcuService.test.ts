import { describe, it, expect, vi, beforeEach } from "vitest";

// We have to mock the Tauri APIs before importing the service.
const mockListen = vi.fn();
const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("subscribeStatus — regression for 'stuck on Esperando cliente after F5' bug", () => {
  beforeEach(() => {
    mockListen.mockReset();
    mockInvoke.mockReset();
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      value: {},
      writable: true,
      configurable: true,
    });
  });

  it("seeds the callback with the current cached status (lcu_status command)", async () => {
    // Simulate: the watcher already connected before frontend mounted.
    // The "lcu:status" event has already fired; subscribeStatus must query
    // the cached status via invoke so the UI doesn't stay on "disconnected".
    mockListen.mockResolvedValue(() => {});
    mockInvoke.mockResolvedValue({ connected: true, reason: null });

    const { subscribeStatus } = await import("./lcuService");
    const cb = vi.fn();
    await subscribeStatus(cb);

    expect(mockInvoke).toHaveBeenCalledWith("lcu_status");
    expect(cb).toHaveBeenCalledWith({ connected: true, reason: null });
  });

  it("subscribes to the lcu:status event BEFORE querying current state (no event loss)", async () => {
    const order: string[] = [];
    mockListen.mockImplementation(async () => {
      order.push("listen");
      return () => {};
    });
    mockInvoke.mockImplementation(async () => {
      order.push("invoke");
      return { connected: false, reason: "lockfile not found" };
    });

    const { subscribeStatus } = await import("./lcuService");
    await subscribeStatus(vi.fn());

    expect(order).toEqual(["listen", "invoke"]);
  });

  it("survives missing lcu_status command (older binary)", async () => {
    mockListen.mockResolvedValue(() => {});
    mockInvoke.mockRejectedValue(new Error("command not found"));

    const { subscribeStatus } = await import("./lcuService");
    const cb = vi.fn();
    // Should NOT throw
    await expect(subscribeStatus(cb)).resolves.toBeTypeOf("function");
  });

  it("returns the unlisten function so callers can clean up", async () => {
    const unlisten = vi.fn();
    mockListen.mockResolvedValue(unlisten);
    mockInvoke.mockResolvedValue({ connected: false });

    const { subscribeStatus } = await import("./lcuService");
    const ret = await subscribeStatus(vi.fn());
    expect(typeof ret).toBe("function");
    ret();
    expect(unlisten).toHaveBeenCalled();
  });
});
