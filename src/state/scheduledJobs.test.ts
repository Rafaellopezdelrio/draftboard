import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const svc = vi.hoisted(() => ({
  syncPersonalData: vi.fn(),
  getLastAggregationTimestamp: vi.fn(),
  aggregateFromMaster: vi.fn(),
  fetchLatestPatch: vi.fn(),
  loadSettings: vi.fn(),
  aggregateFromProPlay: vi.fn(),
  getProPlayLastRun: vi.fn(),
  loadChampionDb: vi.fn(),
}));

vi.mock("../services/personalDataSync", () => ({ syncPersonalData: svc.syncPersonalData }));
vi.mock("../services/aggregateRepo", () => ({
  getLastAggregationTimestamp: svc.getLastAggregationTimestamp,
}));
vi.mock("../services/metaAggregator", () => ({ aggregateFromMaster: svc.aggregateFromMaster }));
vi.mock("../services/dataDragon", () => ({ fetchLatestPatch: svc.fetchLatestPatch }));
vi.mock("../services/settingsRepo", () => ({ loadSettings: svc.loadSettings }));
vi.mock("../services/proPlayAggregator", () => ({
  aggregateFromProPlay: svc.aggregateFromProPlay,
  getProPlayLastRun: svc.getProPlayLastRun,
}));
vi.mock("../services/championDb", () => ({ loadChampionDb: svc.loadChampionDb }));

import { useScheduledJobs, PATCH_UPDATED_EVENT } from "./scheduledJobs";
import { usePrefsStore } from "./prefsStore";
import type { Preferences } from "./prefsStore";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DB = { patch: "16.1.1", champions: {} };
const CFG = { apiKey: "test-key", region: "euw1" };

function setPrefs(p: Partial<Preferences>) {
  const prefs = usePrefsStore.getState().prefs;
  usePrefsStore.setState({ prefs: { ...prefs, ...p } });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
  for (const fn of Object.values(svc)) fn.mockReset();
  svc.syncPersonalData.mockResolvedValue(undefined);
  svc.fetchLatestPatch.mockResolvedValue("16.1.1");
  svc.getProPlayLastRun.mockResolvedValue({ ts: null, games: 0 });
  svc.loadChampionDb.mockResolvedValue(DB);
  svc.aggregateFromProPlay.mockResolvedValue(undefined);
  svc.loadSettings.mockResolvedValue(CFG);
  svc.getLastAggregationTimestamp.mockResolvedValue(null);
  svc.aggregateFromMaster.mockResolvedValue(undefined);
  setPrefs({ metaSource: "dpm", proPlayDaysWindow: 30 });
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useScheduledJobs — personal sync", () => {
  it("syncs immediately on mount, then every 5 minutes", async () => {
    renderHook(() => useScheduledJobs());
    expect(svc.syncPersonalData).toHaveBeenCalledTimes(1);
    await advance(5 * MIN);
    expect(svc.syncPersonalData).toHaveBeenCalledTimes(2);
    await advance(5 * MIN);
    expect(svc.syncPersonalData).toHaveBeenCalledTimes(3);
  });

  it("skips a tick while the previous sync is still in flight", async () => {
    let resolveSlow!: () => void;
    renderHook(() => useScheduledJobs());
    svc.syncPersonalData.mockImplementationOnce(
      () => new Promise<void>((r) => (resolveSlow = r))
    );
    await advance(5 * MIN); // starts the slow run
    await advance(5 * MIN); // in flight → no-op
    expect(svc.syncPersonalData).toHaveBeenCalledTimes(2);
    resolveSlow();
    await advance(5 * MIN);
    expect(svc.syncPersonalData).toHaveBeenCalledTimes(3);
  });

  it("keeps retrying after a failed sync", async () => {
    svc.syncPersonalData.mockRejectedValue(new Error("LCU offline"));
    renderHook(() => useScheduledJobs());
    await advance(10 * MIN);
    expect(svc.syncPersonalData).toHaveBeenCalledTimes(3);
  });
});

describe("useScheduledJobs — hourly meta aggregation", () => {
  it("runs both pro play and SoloQ aggregation when stale (default dpm source)", async () => {
    renderHook(() => useScheduledJobs());
    await advance(HOUR);
    expect(svc.loadChampionDb).toHaveBeenCalledWith(false);
    expect(svc.aggregateFromProPlay).toHaveBeenCalledWith(DB, "16.1.1", 30, expect.any(Function));
    expect(svc.aggregateFromMaster).toHaveBeenCalledWith(CFG, "16.1.1", expect.any(Function));
  });

  it("skips pro play when it ran within the last 12h", async () => {
    svc.getProPlayLastRun.mockResolvedValue({ ts: Date.now() - 2 * HOUR, games: 40 });
    svc.getLastAggregationTimestamp.mockResolvedValue(Date.now() - 13 * HOUR);
    renderHook(() => useScheduledJobs());
    await advance(HOUR);
    expect(svc.aggregateFromProPlay).not.toHaveBeenCalled();
    expect(svc.aggregateFromMaster).toHaveBeenCalledTimes(1);
  });

  it("re-runs pro play once the last run is older than 12h", async () => {
    svc.getProPlayLastRun.mockResolvedValue({ ts: Date.now() - 13 * HOUR, games: 40 });
    renderHook(() => useScheduledJobs());
    await advance(HOUR);
    expect(svc.aggregateFromProPlay).toHaveBeenCalledTimes(1);
  });

  it("skips SoloQ when aggregated recently or when there is no Riot key", async () => {
    svc.getLastAggregationTimestamp.mockResolvedValue(Date.now() - HOUR);
    renderHook(() => useScheduledJobs());
    await advance(HOUR);
    expect(svc.aggregateFromMaster).not.toHaveBeenCalled();

    svc.loadSettings.mockResolvedValue({ apiKey: "" });
    svc.getLastAggregationTimestamp.mockClear();
    await advance(HOUR);
    expect(svc.getLastAggregationTimestamp).not.toHaveBeenCalled();
    expect(svc.aggregateFromMaster).not.toHaveBeenCalled();
  });

  it("metaSource=soloq skips pro play entirely", async () => {
    setPrefs({ metaSource: "soloq" });
    renderHook(() => useScheduledJobs());
    await advance(HOUR);
    expect(svc.getProPlayLastRun).not.toHaveBeenCalled();
    expect(svc.aggregateFromMaster).toHaveBeenCalledTimes(1);
  });

  it("metaSource=proplay skips SoloQ entirely", async () => {
    setPrefs({ metaSource: "proplay" });
    renderHook(() => useScheduledJobs());
    await advance(HOUR);
    expect(svc.loadSettings).not.toHaveBeenCalled();
    expect(svc.aggregateFromProPlay).toHaveBeenCalledTimes(1);
  });

  it("does not overlap a slow aggregation and recovers after an error", async () => {
    let finishSlow!: () => void;
    svc.getProPlayLastRun.mockImplementationOnce(
      () => new Promise((r) => (finishSlow = () => r({ ts: null, games: 0 })))
    );
    renderHook(() => useScheduledJobs());
    await advance(HOUR); // slow run starts
    await advance(HOUR); // still in flight → skipped
    expect(svc.getProPlayLastRun).toHaveBeenCalledTimes(1);
    finishSlow();
    await advance(0);
    expect(svc.aggregateFromProPlay).toHaveBeenCalledTimes(1);

    svc.getProPlayLastRun.mockRejectedValueOnce(new Error("Leaguepedia 429"));
    await advance(HOUR); // errors, swallowed
    await advance(HOUR); // flag was released → runs again
    expect(svc.getProPlayLastRun).toHaveBeenCalledTimes(3);
    expect(svc.aggregateFromProPlay).toHaveBeenCalledTimes(2);
  });
});

describe("useScheduledJobs — patch poll", () => {
  it("dispatches the patch-updated event when the 6h poll sees a new patch", async () => {
    const onPatch = vi.fn();
    window.addEventListener(PATCH_UPDATED_EVENT, onPatch);
    setPrefs({ metaSource: "proplay" });
    svc.getProPlayLastRun.mockResolvedValue({ ts: Date.now(), games: 1 });
    renderHook(() => useScheduledJobs());
    await advance(0); // seed resolves → knownPatch = 16.1.1

    svc.fetchLatestPatch.mockResolvedValue("16.2.1");
    await advance(6 * HOUR);
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect((onPatch.mock.calls[0][0] as CustomEvent).detail).toEqual({
      previous: "16.1.1",
      latest: "16.2.1",
    });

    await advance(6 * HOUR); // same patch again → no new event
    expect(onPatch).toHaveBeenCalledTimes(1);
    window.removeEventListener(PATCH_UPDATED_EVENT, onPatch);
  });

  it("does not fire a false positive when the seed fetch failed, and survives poll errors", async () => {
    const onPatch = vi.fn();
    window.addEventListener(PATCH_UPDATED_EVENT, onPatch);
    setPrefs({ metaSource: "proplay" });
    svc.fetchLatestPatch.mockRejectedValueOnce(new Error("offline"));
    renderHook(() => useScheduledJobs());
    await advance(0);

    svc.fetchLatestPatch.mockResolvedValue("16.2.1");
    await advance(6 * HOUR); // first successful poll only seeds
    expect(onPatch).not.toHaveBeenCalled();

    svc.fetchLatestPatch.mockRejectedValue(new Error("DNS"));
    await expect(advance(6 * HOUR)).resolves.toBeUndefined();
    expect(onPatch).not.toHaveBeenCalled();
    window.removeEventListener(PATCH_UPDATED_EVENT, onPatch);
  });
});

describe("useScheduledJobs — cleanup", () => {
  it("stops every interval on unmount", async () => {
    const { unmount } = renderHook(() => useScheduledJobs());
    await advance(0);
    unmount();
    svc.syncPersonalData.mockClear();
    svc.fetchLatestPatch.mockClear();
    await advance(12 * HOUR);
    expect(svc.syncPersonalData).not.toHaveBeenCalled();
    expect(svc.fetchLatestPatch).not.toHaveBeenCalled();
  });
});
