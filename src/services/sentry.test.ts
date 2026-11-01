// Lifecycle + beforeSend/beforeBreadcrumb scrubbing for the Sentry wrapper.
// The DSN is read at module load, so every test stubs the env and re-imports.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ErrorEvent, Breadcrumb } from "@sentry/react";

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  close: vi.fn(),
  setUser: vi.fn(),
  setTags: vi.fn(),
  getCurrentScope: vi.fn(),
}));

vi.mock("@sentry/react", () => ({
  init: sdk.init,
  close: sdk.close,
  setUser: sdk.setUser,
  getCurrentScope: sdk.getCurrentScope,
  ErrorBoundary: () => null,
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

type InitOpts = {
  dsn: string;
  release: string;
  tracesSampleRate: number;
  replaysSessionSampleRate: number;
  replaysOnErrorSampleRate: number;
  ignoreErrors: string[];
  beforeSend: (e: ErrorEvent) => ErrorEvent | null;
  beforeBreadcrumb: (c: Breadcrumb) => Breadcrumb;
};

const DSN = "https://public@o1.ingest.sentry.io/123";

async function loadSentry(dsn: string | undefined = DSN) {
  vi.resetModules();
  vi.stubEnv("VITE_SENTRY_DSN", dsn ?? "");
  return import("./sentry");
}

async function initAndGetOpts(): Promise<InitOpts> {
  const mod = await loadSentry();
  mod.initSentry();
  return sdk.init.mock.calls[0][0] as InitOpts;
}

beforeEach(() => {
  sdk.init.mockReset();
  sdk.close.mockReset().mockResolvedValue(true);
  sdk.setUser.mockReset();
  sdk.setTags.mockReset();
  sdk.getCurrentScope.mockReset().mockReturnValue({ setTags: sdk.setTags });
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("initSentry", () => {
  it("does not init when telemetry is opted out, even with a DSN", async () => {
    const mod = await loadSentry();
    mod.initSentry({ enabled: false });
    expect(sdk.init).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("opt-out"));
  });

  it("does not init when no DSN is configured", async () => {
    const mod = await loadSentry("");
    mod.initSentry();
    expect(sdk.init).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("no DSN"));
  });

  it("inits once with the DSN, a draftboard release and zero sampling", async () => {
    const mod = await loadSentry();
    mod.initSentry();
    mod.initSentry(); // second call is a no-op
    expect(sdk.init).toHaveBeenCalledTimes(1);
    const opts = sdk.init.mock.calls[0][0] as InitOpts;
    expect(opts.dsn).toBe(DSN);
    expect(opts.release).toMatch(/^draftboard@\S+$/);
    expect(opts.tracesSampleRate).toBe(0);
    expect(opts.replaysSessionSampleRate).toBe(0);
    expect(opts.replaysOnErrorSampleRate).toBe(0);
    expect(opts.ignoreErrors).toContain("Network request failed");
  });
});

describe("beforeSend", () => {
  it("drops Vite HMR noise even when the refresh frame is in a later exception value", async () => {
    const { beforeSend } = await initAndGetOpts();
    const event = {
      exception: {
        values: [
          { type: "Error", value: "component stack", stacktrace: { frames: [{ filename: "/src/App.tsx" }] } },
          { type: "ReferenceError", value: "x", stacktrace: { frames: [{ function: "performReactRefresh" }] } },
        ],
      },
    } as unknown as ErrorEvent;
    expect(beforeSend(event)).toBeNull();
    const byFile = {
      exception: { values: [{ type: "E", stacktrace: { frames: [{ filename: "/@react-refresh" }] } }] },
    } as unknown as ErrorEvent;
    expect(beforeSend(byFile)).toBeNull();
  });

  it("fingerprints by type + first non-vendor file (hash stripped) + normalised message", async () => {
    const { beforeSend } = await initAndGetOpts();
    const event = {
      exception: {
        values: [
          {
            type: "TypeError",
            value: "Aatrox not found 42",
            stacktrace: {
              frames: [
                { filename: "/src/App.tsx" },
                { filename: "https://tauri.localhost/assets/index.abc123def.js" },
                { filename: "/node_modules/react-dom/client.js" },
              ],
            },
          },
        ],
      },
    } as unknown as ErrorEvent;
    const out = beforeSend(event)!;
    expect(out.fingerprint).toEqual(["TypeError", "index.js", "{Name} not found {n}"]);
  });

  it("falls back to Error/unknown when the exception has no type or frames", async () => {
    const { beforeSend } = await initAndGetOpts();
    const event = { exception: { values: [{ value: "boom" }] } } as unknown as ErrorEvent;
    expect(beforeSend(event)!.fingerprint).toEqual(["Error", "unknown", "boom"]);
  });

  it("scrubs secrets from the request URL and breadcrumbs", async () => {
    const { beforeSend } = await initAndGetOpts();
    const event = {
      request: { url: "https://x.dev/api?key=AIzaSECRET123&champ=1" },
      breadcrumbs: [
        { data: { url: "https://euw1.api.riotgames.com/?api_key=RGAPI-aaaa-bbbb" } },
        { message: "called with sk-ant-abcdef123" },
        { data: { status: 200 } },
      ],
    } as unknown as ErrorEvent;
    const out = beforeSend(event)!;
    expect(out.request!.url).toBe("https://x.dev/api?key=***&champ=1");
    expect(out.breadcrumbs![0].data!.url).not.toContain("RGAPI-aaaa");
    expect(out.breadcrumbs![1].message).toBe("called with sk-ant-***");
    expect(out.breadcrumbs![2].data).toEqual({ status: 200 });
  });

  it("replaces user identity with an anonymous hash only", async () => {
    const { beforeSend } = await initAndGetOpts();
    const out = beforeSend({
      user: { id: "puuid-123", email: "a@b.c", username: "Faker" },
    } as unknown as ErrorEvent)!;
    expect(out.user).toEqual({ id: expect.stringMatching(/^anon-[0-9a-z]+$/) });
    expect(JSON.stringify(out.user)).not.toContain("puuid-123");
    const noId = beforeSend({ user: { email: "a@b.c" } } as unknown as ErrorEvent)!;
    expect(noId.user).toEqual({ id: undefined });
  });

  it("strips the Windows username from stack frame paths", async () => {
    const { beforeSend } = await initAndGetOpts();
    const out = beforeSend({
      exception: {
        values: [
          {
            type: "Error",
            value: "x",
            stacktrace: { frames: [{ filename: "C:\\Users\\rafael\\AppData\\app.js" }, {}] },
          },
        ],
      },
    } as unknown as ErrorEvent)!;
    expect(out.exception!.values![0].stacktrace!.frames![0].filename).toBe(
      "C:\\Users\\***\\AppData\\app.js"
    );
  });

  it("passes through a plain event untouched", async () => {
    const { beforeSend } = await initAndGetOpts();
    const event = { message: "hello" } as unknown as ErrorEvent;
    expect(beforeSend(event)).toEqual({ message: "hello" });
  });
});

describe("beforeBreadcrumb", () => {
  it("redacts secrets in url data and message at capture time", async () => {
    const { beforeBreadcrumb } = await initAndGetOpts();
    const out = beforeBreadcrumb({
      data: { url: "https://g.dev/v1?key=AIzaXYZ" },
      message: "token gsk_ABC123",
    });
    expect(out.data!.url).toBe("https://g.dev/v1?key=***");
    expect(out.message).toBe("token gsk_***");
    expect(beforeBreadcrumb({ category: "ui.click" })).toEqual({ category: "ui.click" });
  });
});

describe("shutdownSentry", () => {
  it("resolves true without closing when never initialised", async () => {
    const mod = await loadSentry();
    await expect(mod.shutdownSentry()).resolves.toBe(true);
    expect(sdk.close).not.toHaveBeenCalled();
  });

  it("closes with a 2s flush and allows re-init afterwards", async () => {
    const mod = await loadSentry();
    mod.initSentry();
    await mod.shutdownSentry();
    expect(sdk.close).toHaveBeenCalledWith(2000);
    mod.initSentry();
    expect(sdk.init).toHaveBeenCalledTimes(2);
  });
});

describe("setSentryAnonUser", () => {
  it("is a no-op before init", async () => {
    const mod = await loadSentry();
    mod.setSentryAnonUser("puuid");
    expect(sdk.setUser).not.toHaveBeenCalled();
  });

  it("clears the user for an empty PUUID and sets a stable hash otherwise", async () => {
    const mod = await loadSentry();
    mod.initSentry();
    mod.setSentryAnonUser(null);
    expect(sdk.setUser).toHaveBeenLastCalledWith(null);
    mod.setSentryAnonUser("abc-puuid");
    mod.setSentryAnonUser("abc-puuid");
    const [first, second] = sdk.setUser.mock.calls.slice(1).map((c) => c[0]);
    expect(first).toEqual({ id: expect.stringMatching(/^anon-/) });
    expect(first).toEqual(second);
    expect(first.id).not.toContain("abc-puuid");
  });
});

describe("setSentryGlobalTags", () => {
  it("is a no-op before init", async () => {
    const mod = await loadSentry();
    mod.setSentryGlobalTags({ patch: "16.1" });
    expect(sdk.getCurrentScope).not.toHaveBeenCalled();
  });

  it("drops null/undefined tags and keeps falsy booleans", async () => {
    const mod = await loadSentry();
    mod.initSentry();
    mod.setSentryGlobalTags({ patch: "16.1", region: null, locale: undefined, inGame: false });
    expect(sdk.setTags).toHaveBeenCalledWith({ patch: "16.1", inGame: false });
  });

  it("swallows scope errors so telemetry never breaks the app", async () => {
    const mod = await loadSentry();
    mod.initSentry();
    sdk.getCurrentScope.mockImplementation(() => {
      throw new Error("no scope");
    });
    expect(() => mod.setSentryTags({ lcuConnected: true })).not.toThrow();
  });
});
