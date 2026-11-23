// reports.ts: sendReport throws when the report did not arrive; the usage
// counter only runs with consent, once per view per session, and the
// install id is random and forgotten on opt-out.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendReport, trackUsage, trackFeature, forgetInstallId, technicalDetails, reportInstall, __testOnly_resetUsage } from "./reports";

let fetchMock: ReturnType<typeof vi.fn>;

class MemStorage {
  store = new Map<string, string>();
  getItem(k: string) { return this.store.get(k) ?? null; }
  setItem(k: string, v: string) { this.store.set(k, v); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", new MemStorage());
  __testOnly_resetUsage();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const body = (i = 0) => JSON.parse(fetchMock.mock.calls[i][1].body);

describe("sendReport", () => {
  it("posts kind, message, version and details to /report", async () => {
    await sendReport("bug", "se cuelga", "Windows NT 10.0");
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/report$/);
    expect(body()).toMatchObject({ kind: "bug", message: "se cuelga", details: "Windows NT 10.0" });
    expect(typeof body().version).toBe("string");
  });

  it("throws when the server does not accept it", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));
    await expect(sendReport("suggestion", "x")).rejects.toThrow("HTTP 503");
  });
});

describe("trackUsage", () => {
  it("does nothing without consent", () => {
    trackUsage("open");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("draftboard:install-id")).toBeNull();
  });

  it("with consent sends a random install id, once per view per session", () => {
    localStorage.setItem("draftboard:telemetry", "true");
    trackUsage("open");
    trackUsage("open");
    trackUsage("CoachView");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/usage$/);
    expect(body(0).id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body(1)).toMatchObject({ id: body(0).id, view: "CoachView" });
  });

  it("forgetInstallId removes the id", () => {
    localStorage.setItem("draftboard:telemetry", "true");
    trackUsage("open");
    forgetInstallId();
    expect(localStorage.getItem("draftboard:install-id")).toBeNull();
  });
});

describe("trackFeature", () => {
  it("counts a feature on the same opt-in counter, as f-<name>, once per session", () => {
    trackFeature("voice-natural");
    expect(fetchMock).not.toHaveBeenCalled(); // no consent, nothing sent

    localStorage.setItem("draftboard:telemetry", "true");
    trackFeature("voice-natural");
    trackFeature("voice-natural");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body(0)).toMatchObject({ view: "f-voice-natural" });
  });
});

describe("technicalDetails", () => {
  it("names the app version and the Windows build only", () => {
    expect(technicalDetails()).toMatch(/^Draftboard \S+ · /);
  });
});

describe("reportInstall", () => {
  it("sends only the version to /install, with no id", () => {
    vi.stubEnv("DEV", false);
    reportInstall();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/install$/);
    expect(Object.keys(body())).toEqual(["version"]);
    expect(localStorage.getItem("draftboard:install-id")).toBeNull();
  });

  it("is not sent from the DEV build", () => {
    vi.stubEnv("DEV", true);
    reportInstall();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
