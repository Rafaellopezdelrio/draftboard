import { describe, it, expect, vi, beforeEach } from "vitest";

// Control the HTTP layer (isTauri() is true under the test setup, so riotApi's
// httpFetch routes through @tauri-apps/plugin-http).
const httpFetchMock = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => httpFetchMock(...args),
}));

import { getAccount } from "./riotApi";

function res429(retryAfter: string) {
  return {
    status: 429,
    ok: false,
    headers: {
      get: (h: string) => (h.toLowerCase() === "retry-after" ? retryAfter : null),
    },
  };
}

const cfg = {
  region: "euw1",
  riotIdName: "x",
  riotIdTag: "EUW",
  apiKey: "k",
} as Parameters<typeof getAccount>[0];

describe("riotApi — rate-limit (429) retry is bounded", () => {
  beforeEach(() => httpFetchMock.mockReset());

  it("throws after a capped number of 429 retries instead of looping forever", async () => {
    vi.useFakeTimers();
    httpFetchMock.mockResolvedValue(res429("1"));
    const settled = getAccount(cfg).then(
      () => "resolved",
      () => "rejected"
    );
    await vi.runAllTimersAsync();
    expect(await settled).toBe("rejected");
    // Initial call + 5 bounded retries = 6 — not unbounded.
    expect(httpFetchMock).toHaveBeenCalledTimes(6);
    vi.useRealTimers();
  });

  it("clamps Retry-After: 0 so a broken proxy can't busy-loop", async () => {
    vi.useFakeTimers();
    httpFetchMock.mockResolvedValue(res429("0"));
    const settled = getAccount(cfg).then(
      () => "resolved",
      () => "rejected"
    );
    await vi.runAllTimersAsync();
    expect(await settled).toBe("rejected");
    expect(httpFetchMock).toHaveBeenCalledTimes(6);
    vi.useRealTimers();
  });
});
