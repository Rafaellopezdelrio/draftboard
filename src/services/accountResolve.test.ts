import { describe, it, expect, vi, beforeEach } from "vitest";

const loadSettings = vi.hoisted(() => vi.fn());
const saveSettings = vi.hoisted(() => vi.fn());
const getCurrentSummoner = vi.hoisted(() => vi.fn());
const getAccount = vi.hoisted(() => vi.fn());
const proxy = vi.hoisted(() => ({ url: "https://server.test" as string | null }));
vi.mock("./settingsRepo", () => ({ loadSettings, saveSettings }));
vi.mock("./lcuService", () => ({ getCurrentSummoner }));
vi.mock("./riotApi", () => ({ getAccount, getRiotProxyUrl: () => proxy.url }));

import { regionFromClient, resolveAccount, settingsOrDefault } from "./accountResolve";

beforeEach(() => {
  proxy.url = "https://server.test";
  loadSettings.mockReset().mockResolvedValue(null);
  saveSettings.mockReset().mockResolvedValue(undefined);
  getCurrentSummoner.mockReset().mockResolvedValue({ puuid: "lcu-format", gameName: "Rafa", tagLine: "EUW", region: "EUW" });
  getAccount.mockReset().mockResolvedValue({ puuid: "riot-format" });
});

describe("regionFromClient", () => {
  it("maps the client's short names and platform ids, and rejects the unknown", () => {
    expect(regionFromClient("EUW")).toBe("euw1");
    expect(regionFromClient("eune")).toBe("eun1");
    expect(regionFromClient("LA2")).toBe("la2");
    expect(regionFromClient("KR")).toBe("kr");
    expect(regionFromClient("PBE")).toBeNull();
    expect(regionFromClient(undefined)).toBeNull();
  });
});

describe("resolveAccount", () => {
  it("returns saved settings untouched when they already have a puuid", async () => {
    const saved = { apiKey: "", region: "kr", riotIdName: "A", riotIdTag: "B", puuid: "p" };
    loadSettings.mockResolvedValue(saved);
    expect(await resolveAccount()).toBe(saved);
    expect(getCurrentSummoner).not.toHaveBeenCalled();
  });

  it("clean install: reads the account from the client, asks Riot for the puuid and saves it", async () => {
    const out = await resolveAccount();
    const expected = { apiKey: "", region: "euw1", riotIdName: "Rafa", riotIdTag: "EUW", puuid: "riot-format" };
    expect(getAccount).toHaveBeenCalledWith({ apiKey: "", region: "euw1", riotIdName: "Rafa", riotIdTag: "EUW" });
    expect(saveSettings).toHaveBeenCalledWith(expected);
    // Never the client's own puuid: it is a different format.
    expect(out).toEqual(expected);
  });

  it("gives null and saves nothing when the client is closed, the region is unknown or Riot fails", async () => {
    getCurrentSummoner.mockResolvedValue(null);
    expect(await resolveAccount()).toBeNull();
    getCurrentSummoner.mockResolvedValue({ puuid: "x", gameName: "Rafa", tagLine: "EUW", region: "PBE" });
    expect(await resolveAccount()).toBeNull();
    getCurrentSummoner.mockResolvedValue({ puuid: "x", gameName: "Rafa", tagLine: "EUW", region: "EUW" });
    getAccount.mockRejectedValue(new Error("down"));
    expect(await resolveAccount()).toBeNull();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("does nothing without the server and without a personal key", async () => {
    proxy.url = null;
    expect(await resolveAccount()).toBeNull();
    expect(getCurrentSummoner).not.toHaveBeenCalled();
  });

  it("shares one run between concurrent callers", async () => {
    const [a, b] = await Promise.all([resolveAccount(), resolveAccount()]);
    expect(a).toBe(b);
    expect(getAccount).toHaveBeenCalledTimes(1);
  });
});

describe("settingsOrDefault", () => {
  it("uses the client's region when nothing is saved, and EUW as the last resort", async () => {
    getCurrentSummoner.mockResolvedValue({ puuid: "x", region: "NA" });
    expect((await settingsOrDefault()).region).toBe("na1");
    getCurrentSummoner.mockResolvedValue(null);
    expect((await settingsOrDefault()).region).toBe("euw1");
  });
});
