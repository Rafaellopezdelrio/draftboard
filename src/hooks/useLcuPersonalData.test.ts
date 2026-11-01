import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const m = vi.hoisted(() => ({
  lcuMasteries: vi.fn(),
  lcuRank: vi.fn(),
  loadSettings: vi.fn(),
  getTopMasteries: vi.fn(),
  getLeagueEntriesByPuuid: vi.fn(),
  getRiotProxyUrl: vi.fn(),
  setCoachEloBucket: vi.fn(),
  getCurrentSummoner: vi.fn(),
  setSentryAnonUser: vi.fn(),
}));

vi.mock("../services/lcuPersonalData", () => ({ lcuMasteries: m.lcuMasteries, lcuRank: m.lcuRank }));
vi.mock("../services/settingsRepo", () => ({ loadSettings: m.loadSettings }));
vi.mock("../services/riotApi", () => ({
  getTopMasteries: m.getTopMasteries,
  getLeagueEntriesByPuuid: m.getLeagueEntriesByPuuid,
  getRiotProxyUrl: m.getRiotProxyUrl,
}));
vi.mock("../engine/coachEngine", () => ({ setCoachEloBucket: m.setCoachEloBucket }));
vi.mock("../services/lcuService", () => ({ getCurrentSummoner: m.getCurrentSummoner }));
vi.mock("../services/sentry", () => ({ setSentryAnonUser: m.setSentryAnonUser }));

import { useLcuPersonalData } from "./useLcuPersonalData";

const M_LCU = [{ championId: 266, championLevel: 7, championPoints: 300000, lastPlayTime: 1 }];
const M_RIOT = [{ championId: 103, championLevel: 5, championPoints: 50000, lastPlayTime: 2 }];
const CFG = { puuid: "my-puuid", apiKey: "test-key", region: "euw1" };

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.loadSettings.mockResolvedValue(null);
  m.lcuMasteries.mockResolvedValue([]);
  m.lcuRank.mockResolvedValue(null);
  m.getRiotProxyUrl.mockReturnValue(null);
  m.getCurrentSummoner.mockResolvedValue(null);
});

/** Resolves once the async effect reached its last step (summoner lookup). */
async function settled() {
  await waitFor(() => expect(m.getCurrentSummoner).toHaveBeenCalled());
}

describe("useLcuPersonalData", () => {
  it("uses LCU masteries and rank without touching the Riot API", async () => {
    m.loadSettings.mockResolvedValue(CFG);
    m.lcuMasteries.mockResolvedValue(M_LCU);
    m.lcuRank.mockResolvedValue({ tier: "GOLD", division: "II" });
    const { result } = renderHook(() => useLcuPersonalData(true));
    await waitFor(() => expect(result.current.rankTier).toBe("GOLD"));
    expect(result.current.masteries).toEqual(M_LCU);
    expect(m.setCoachEloBucket).toHaveBeenCalledWith("GOLD");
    expect(m.getTopMasteries).not.toHaveBeenCalled();
    expect(m.getLeagueEntriesByPuuid).not.toHaveBeenCalled();
  });

  it("falls back to the Riot API (personal key) for masteries and solo-queue rank", async () => {
    m.loadSettings.mockResolvedValue(CFG);
    m.getTopMasteries.mockResolvedValue(M_RIOT);
    m.getLeagueEntriesByPuuid.mockResolvedValue([
      { queueType: "RANKED_FLEX_SR", tier: "DIAMOND" },
      { queueType: "RANKED_SOLO_5x5", tier: "PLATINUM" },
    ]);
    const { result } = renderHook(() => useLcuPersonalData(false));
    await waitFor(() => expect(result.current.masteries).toEqual(M_RIOT));
    await waitFor(() => expect(result.current.rankTier).toBe("PLATINUM"));
    expect(m.getTopMasteries).toHaveBeenCalledWith(CFG, "my-puuid", 20);
    expect(m.getLeagueEntriesByPuuid).toHaveBeenCalledWith(CFG, "my-puuid");
    expect(m.setCoachEloBucket).toHaveBeenCalledWith("PLATINUM");
  });

  it("treats the shared proxy as Riot access when there is no personal key", async () => {
    const cfg = { puuid: "my-puuid", apiKey: "" };
    m.loadSettings.mockResolvedValue(cfg);
    m.getRiotProxyUrl.mockReturnValue("https://proxy.example.test");
    m.getTopMasteries.mockResolvedValue(M_RIOT);
    m.getLeagueEntriesByPuuid.mockResolvedValue([]);
    const { result } = renderHook(() => useLcuPersonalData(false));
    await waitFor(() => expect(result.current.masteries).toEqual(M_RIOT));
    await settled();
    expect(result.current.rankTier).toBeNull();
    expect(m.setCoachEloBucket).not.toHaveBeenCalled();
  });

  it("skips Riot fallback without a PUUID or without key/proxy", async () => {
    m.loadSettings.mockResolvedValue({ apiKey: "k" }); // no puuid
    const { result, rerender } = renderHook(({ c }) => useLcuPersonalData(c), {
      initialProps: { c: false },
    });
    await settled();
    expect(m.getTopMasteries).not.toHaveBeenCalled();
    expect(result.current).toEqual({ masteries: [], rankTier: null });

    m.getCurrentSummoner.mockClear();
    m.loadSettings.mockResolvedValue({ puuid: "p", apiKey: "" }); // no key, no proxy
    rerender({ c: true });
    await settled();
    expect(m.getTopMasteries).not.toHaveBeenCalled();
    expect(m.getLeagueEntriesByPuuid).not.toHaveBeenCalled();
  });

  it("swallows Riot fallback failures and leaves defaults", async () => {
    m.loadSettings.mockResolvedValue(CFG);
    m.getTopMasteries.mockRejectedValue(new Error("429"));
    m.getLeagueEntriesByPuuid.mockRejectedValue(new Error("403"));
    const { result } = renderHook(() => useLcuPersonalData(false));
    await settled();
    expect(result.current).toEqual({ masteries: [], rankTier: null });
  });

  it("tags Sentry with the current summoner's PUUID when known", async () => {
    m.getCurrentSummoner.mockResolvedValue({ puuid: "lcu-puuid" });
    renderHook(() => useLcuPersonalData(true));
    await waitFor(() => expect(m.setSentryAnonUser).toHaveBeenCalledWith("lcu-puuid"));
  });

  it("leaves Sentry untouched when there is no summoner or the lookup throws", async () => {
    const { rerender } = renderHook(({ c }) => useLcuPersonalData(c), {
      initialProps: { c: true },
    });
    await settled();
    m.getCurrentSummoner.mockReset().mockRejectedValue(new Error("LCU offline"));
    rerender({ c: false });
    await settled();
    await Promise.resolve();
    expect(m.setSentryAnonUser).not.toHaveBeenCalled();
  });

  it("refetches on every connection flip and ignores a stale earlier run", async () => {
    let resolveFirst!: (v: typeof M_LCU) => void;
    m.lcuMasteries
      .mockReturnValueOnce(new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce(M_RIOT);
    const { result, rerender } = renderHook(({ c }) => useLcuPersonalData(c), {
      initialProps: { c: false },
    });
    await waitFor(() => expect(m.lcuMasteries).toHaveBeenCalledTimes(1));
    rerender({ c: true });
    await waitFor(() => expect(result.current.masteries).toEqual(M_RIOT));

    // Older run finishes late; act() flushes its continuation and any render.
    await act(async () => {
      resolveFirst(M_LCU);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.masteries).toEqual(M_RIOT);
    expect(m.lcuRank).toHaveBeenCalledTimes(1);
    expect(m.lcuMasteries).toHaveBeenCalledTimes(2);
  });

  it("stops after unmount while settings are loading", async () => {
    let resolveSettings!: (v: unknown) => void;
    m.loadSettings.mockReturnValue(new Promise((r) => (resolveSettings = r)));
    const { unmount } = renderHook(() => useLcuPersonalData(true));
    unmount();
    await act(async () => {
      resolveSettings(CFG);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(m.lcuMasteries).not.toHaveBeenCalled();
  });
});
