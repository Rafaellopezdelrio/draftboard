import { describe, it, expect, vi, beforeEach } from "vitest";

// httpFetch (httpClient) routes through @tauri-apps/plugin-http under the test
// setup (isTauri() is true), so mock that module to control responses.
const httpFetchMock = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => httpFetchMock(...args),
}));

import { fetchProxyJson } from "./proxyFetch";

function res(status: number, body: unknown, retryAfter?: string) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (h: string) =>
        h.toLowerCase() === "retry-after" ? (retryAfter ?? null) : null,
    },
    json: async () => body,
  };
}

const URL = "https://proxy.example/opgg/tierlist";

describe("fetchProxyJson", () => {
  beforeEach(() => httpFetchMock.mockReset());

  it("returns the parsed JSON body on 200", async () => {
    httpFetchMock.mockResolvedValue(res(200, { ok: true, n: 3 }));
    await expect(fetchProxyJson<{ ok: boolean; n: number }>(URL)).resolves.toEqual({
      ok: true,
      n: 3,
    });
    expect(httpFetchMock).toHaveBeenCalledOnce();
  });

  it("retries on a 5xx then succeeds", async () => {
    vi.useFakeTimers();
    httpFetchMock
      .mockResolvedValueOnce(res(503, null))
      .mockResolvedValueOnce(res(200, { v: 1 }));
    const p = fetchProxyJson<{ v: number }>(URL);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ v: 1 });
    expect(httpFetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("throws immediately on a non-429 4xx (no retry — bad params, not flake)", async () => {
    vi.useFakeTimers();
    httpFetchMock.mockResolvedValue(res(404, null));
    const settled = fetchProxyJson(URL).then(() => "ok", () => "rejected");
    await vi.runAllTimersAsync();
    expect(await settled).toBe("rejected");
    expect(httpFetchMock).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("retries a 429 (honouring Retry-After) then gives up after the cap", async () => {
    vi.useFakeTimers();
    httpFetchMock.mockResolvedValue(res(429, null, "1"));
    const settled = fetchProxyJson(URL).then(() => "ok", () => "rejected");
    await vi.runAllTimersAsync();
    expect(await settled).toBe("rejected");
    // 3 attempts total (initial + 2 retries) — bounded, not a busy-loop.
    expect(httpFetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
