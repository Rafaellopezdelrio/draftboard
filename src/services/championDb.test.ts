import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Champion, CounterEntry, MetaTier, Role } from "../types/champion";

// Every network/DB source loadChampionDb fans out to is mocked; the pipeline
// logic (alias map, off-meta filter, pro demotion, cache) runs for real.
vi.mock("./dataDragon", () => ({
  fetchLatestPatch: vi.fn(),
  fetchChampions: vi.fn(),
}));
vi.mock("./aggregateRepo", () => ({
  loadAggregatedMeta: vi.fn(),
  loadAggregatedCounters: vi.fn(),
}));
vi.mock("./opggMeta", () => ({
  fetchOpggMetaAllRoles: vi.fn(),
  fetchOpggMetaForRank: vi.fn(),
}));
vi.mock("./dpmTierlist", () => ({
  fetchDpmMeta: vi.fn(),
}));

import { loadChampionDb, readChampionDbCacheUnsafe, RANK_LIST_WAIT_MS } from "./championDb";
import { DATA_UPDATED_EVENT } from "../state/dataSyncStore";
import { fetchChampions, fetchLatestPatch } from "./dataDragon";
import { loadAggregatedCounters, loadAggregatedMeta } from "./aggregateRepo";
import { fetchOpggMetaAllRoles, fetchOpggMetaForRank } from "./opggMeta";
import { fetchDpmMeta } from "./dpmTierlist";
import { usePrefsStore } from "../state/prefsStore";

const mPatch = vi.mocked(fetchLatestPatch);
const mChampions = vi.mocked(fetchChampions);
const mAggMeta = vi.mocked(loadAggregatedMeta);
const mAggCounters = vi.mocked(loadAggregatedCounters);
const mOpgg = vi.mocked(fetchOpggMetaAllRoles);
const mOpggRank = vi.mocked(fetchOpggMetaForRank);
const mDpm = vi.mocked(fetchDpmMeta);

const CACHE_KEY = "lol-draft-advisor:championDb:v16";
const PATCH = "15.20.1";
const NOW = new Date("2026-10-01T12:00:00Z").getTime();

// Same in-memory Storage idiom as patchNotes.client.test.ts.
class MemStorage {
  store = new Map<string, string>();
  getItem(k: string) { return this.store.get(k) ?? null; }
  setItem(k: string, v: string) { this.store.set(k, v); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}
function installStorage(storage: MemStorage) {
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    writable: true,
    configurable: true,
  });
}

function champ(id: string, key: string, name = id): Champion {
  return { id, key, name, title: "", iconUrl: "", splashUrl: "", tags: [], roles: [], archetypes: [] };
}
function tier(championKey: string, role: Role, t: MetaTier["tier"], pickRate = 0.1): MetaTier {
  return { championKey, role, tier: t, winRate: 0.52, pickRate, banRate: 0.05 };
}

// Aatrox is TOP-only and Jinx BOTTOM-only in CHAMPION_ROLES; "Brandnew" is
// deliberately absent from it (simulates a champion released after the map).
const CHAMPIONS: Record<string, Champion> = {
  "266": champ("Aatrox", "266"),
  "222": champ("Jinx", "222"),
  "950": champ("Brandnew", "950"),
};
const COUNTERS: CounterEntry[] = [
  { championKey: "266", vsChampionKey: "222", role: "TOP", winRate: 0.55, sampleSize: 40 },
];

/** Wire every source. Defaults: op.gg has data, everything else empty. */
function sources(over: {
  opgg?: MetaTier[];
  soloq?: MetaTier[];
  proplay?: MetaTier[];
  dpm?: MetaTier[];
  opggRank?: MetaTier[];
  champions?: Record<string, Champion>;
} = {}) {
  mPatch.mockResolvedValue(PATCH);
  mChampions.mockResolvedValue(over.champions ?? CHAMPIONS);
  mOpgg.mockResolvedValue(over.opgg ?? [tier("266", "TOP", "A")]);
  mAggMeta.mockImplementation(async (p: string) =>
    p.startsWith("proplay-") ? (over.proplay ?? []) : (over.soloq ?? [])
  );
  mAggCounters.mockResolvedValue(COUNTERS);
  mDpm.mockResolvedValue(over.dpm ?? []);
  mOpggRank.mockResolvedValue(over.opggRank ?? []);
}

let storage: MemStorage;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  storage = new MemStorage();
  installStorage(storage);
  usePrefsStore.setState({ loaded: false });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("loadChampionDb — pipeline (op.gg default source)", () => {
  it("builds the db: op.gg lane lists trusted, pro-play demotion, counts, counters", async () => {
    sources({
      opgg: [
        tier("266", "TOP", "S"), // has pro presence → stays S
        tier("266", "MIDDLE", "B"), // off the hand map, but op.gg lists it for mid → kept
        tier("222", "BOTTOM", "S"), // S with zero pro presence → demoted to A
        tier("950", "JUNGLE", "B"), // not in CHAMPION_ROLES → kept
        tier("9999", "TOP", "A"), // unknown champion key → kept
      ],
      proplay: [tier("266", "TOP", "A", 0.2)],
    });

    const db = await loadChampionDb();

    expect(db.patch).toBe(PATCH);
    expect(db.champions).toBe(CHAMPIONS);
    expect(db.counters).toBe(COUNTERS);
    expect(db.meta).toEqual([
      tier("266", "TOP", "S"),
      tier("266", "MIDDLE", "B"),
      tier("222", "BOTTOM", "A"),
      tier("950", "JUNGLE", "B"),
      tier("9999", "TOP", "A"),
    ]);
    expect(db.metaSourceRequested).toBe("opgg");
    expect(db.metaSourceUsed).toBe("opgg");
    expect(db.metaSourceCounts).toEqual({ opgg: 5, proplay: 1, soloq: 0, dpm: 0 });
    expect(db.fetchedAt).toBe(NOW);

    // SoloQ and pro data are read from separate patch buckets.
    expect(mAggMeta).toHaveBeenCalledWith(PATCH);
    expect(mAggMeta).toHaveBeenCalledWith(`proplay-${PATCH}`);
    expect(mAggCounters).toHaveBeenCalledWith(PATCH);
    expect(mChampions).toHaveBeenCalledWith(PATCH);
    // dpm.lol is only hit when it's the selected source.
    expect(mDpm).not.toHaveBeenCalled();
  });

  it("our own small SoloQ sample still goes through the hand role map", async () => {
    usePrefsStore.setState({
      loaded: true,
      prefs: { ...usePrefsStore.getState().prefs, metaSource: "soloq" },
    });
    sources({
      soloq: [
        tier("266", "TOP", "A"),
        tier("266", "MIDDLE", "B"), // Aatrox mid is off the map → dropped
        tier("950", "JUNGLE", "B"), // not in the map → kept
      ],
    });
    const db = await loadChampionDb();
    expect(db.metaSourceUsed).toBe("soloq");
    expect(db.meta).toEqual([tier("266", "TOP", "A"), tier("950", "JUNGLE", "B")]);
  });

  it("keeps S-tier picks when no pro data has been synced yet", async () => {
    sources({ opgg: [tier("222", "BOTTOM", "S")], proplay: [] });
    const db = await loadChampionDb();
    expect(db.meta).toEqual([tier("222", "BOTTOM", "S")]);
  });

  it("maps op.gg display names and DDragon ids to champion keys, incl. aliases", async () => {
    const aliases: Array<[id: string, opggName: string]> = [
      ["MonkeyKing", "Wukong"],
      ["Belveth", "Bel'Veth"],
      ["Chogath", "Cho'Gath"],
      ["Khazix", "Kha'Zix"],
      ["KogMaw", "Kog'Maw"],
      ["Velkoz", "Vel'Koz"],
      ["RekSai", "Rek'Sai"],
      ["DrMundo", "Dr. Mundo"],
      ["JarvanIV", "Jarvan IV"],
      ["MissFortune", "Miss Fortune"],
      ["MasterYi", "Master Yi"],
      ["AurelionSol", "Aurelion Sol"],
      ["TahmKench", "Tahm Kench"],
      ["TwistedFate", "Twisted Fate"],
      ["XinZhao", "Xin Zhao"],
      ["LeeSin", "Lee Sin"],
      ["Leblanc", "LeBlanc"],
      ["Kaisa", "Kai'Sa"],
      ["KSante", "K'Sante"],
    ];
    const champions: Record<string, Champion> = {};
    aliases.forEach(([id], i) => {
      const key = String(1000 + i);
      // DDragon `name` differs from the op.gg spelling for several of these.
      champions[key] = champ(id, key, `${id}-display`);
    });
    sources({ champions });

    await loadChampionDb();

    const nameToKey = mOpgg.mock.calls[0][0];
    aliases.forEach(([id, opggName], i) => {
      const key = String(1000 + i);
      expect(nameToKey.get(id), id).toBe(key);
      expect(nameToKey.get(`${id}-display`), `${id} display`).toBe(key);
      expect(nameToKey.get(opggName), opggName).toBe(key);
    });
  });

  it("falls back to the curated static list when every source is empty", async () => {
    sources({ opgg: [], soloq: [], proplay: [], dpm: [] });
    const db = await loadChampionDb();
    expect(db.metaSourceUsed).toBe("static");
    // Curated rows exist for Aatrox TOP S and Jinx BOTTOM S; no pro data → no demotion.
    expect(db.meta.map((m) => [m.championKey, m.role, m.tier])).toEqual([
      ["266", "TOP", "S"],
      ["222", "BOTTOM", "S"],
    ]);
  });

  it("propagates a DDragon failure without touching the cache", async () => {
    mPatch.mockRejectedValue(new Error("DDragon versions: HTTP 503"));
    await expect(loadChampionDb()).rejects.toThrow("DDragon versions: HTTP 503");
    expect(storage.getItem(CACHE_KEY)).toBeNull();
  });
});

describe("loadChampionDb — meta source preference", () => {
  it("uses the hydrated prefs store: dpm bracket is fetched and S picks are not pro-demoted", async () => {
    usePrefsStore.setState({
      loaded: true,
      prefs: {
        ...usePrefsStore.getState().prefs,
        metaSource: "dpm",
        dpmTier: "challenger",
        dpmPlatform: "kr",
        dpmTimeframe: "30days",
      },
    });
    sources({
      dpm: [
        tier("266", "TOP", "S+"),
        tier("222", "BOTTOM", "S"), // no pro presence, but dpm skips demotion
        tier("222", "TOP", "A"), // off-meta filter still applies
      ],
      proplay: [tier("266", "TOP", "A")],
    });

    const db = await loadChampionDb();

    expect(mDpm).toHaveBeenCalledOnce();
    const [dpmTier, dpmPlatform, dpmTimeframe, nameToKey] = mDpm.mock.calls[0];
    expect([dpmTier, dpmPlatform, dpmTimeframe]).toEqual(["challenger", "kr", "30days"]);
    expect(nameToKey.get("Jinx")).toBe("222");
    expect(db.metaSourceRequested).toBe("dpm");
    expect(db.metaSourceUsed).toBe("dpm");
    expect(db.meta).toEqual([tier("266", "TOP", "S+"), tier("222", "BOTTOM", "S")]);
    expect(db.metaSourceCounts?.dpm).toBe(3);
  });

  it("by-rank source with dpm empty: op.gg's list for that rank is used, S picks not pro-demoted", async () => {
    usePrefsStore.setState({
      loaded: true,
      prefs: { ...usePrefsStore.getState().prefs, metaSource: "dpm", dpmTier: "gold" },
    });
    sources({
      opgg: [tier("266", "TOP", "A")],
      opggRank: [{ ...tier("222", "BOTTOM", "S"), games: 334206 }],
      proplay: [tier("266", "TOP", "A")],
    });

    const db = await loadChampionDb();

    expect(mOpggRank).toHaveBeenCalledOnce();
    expect(mOpggRank.mock.calls[0][0]).toBe("gold");
    expect(db.metaSourceRequested).toBe("dpm");
    expect(db.metaSourceUsed).toBe("opggRank");
    expect(db.meta).toEqual([{ ...tier("222", "BOTTOM", "S"), games: 334206 }]);
  });

  it("a slow per-rank list does not hold the load: general list now, new data announced when it lands", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    usePrefsStore.setState({
      loaded: true,
      prefs: { ...usePrefsStore.getState().prefs, metaSource: "dpm", dpmTier: "gold" },
    });
    sources({ opgg: [tier("266", "TOP", "A")] });
    let arrive!: (rows: MetaTier[]) => void;
    mOpggRank.mockReturnValue(new Promise((res) => (arrive = res)));
    const updated = vi.fn();
    window.addEventListener(DATA_UPDATED_EVENT, updated);

    const loading = loadChampionDb();
    await vi.advanceTimersByTimeAsync(RANK_LIST_WAIT_MS);
    const db = await loading;
    expect(db.metaSourceUsed).toBe("opgg");
    expect(updated).not.toHaveBeenCalled();

    arrive([tier("222", "BOTTOM", "S")]);
    await vi.advanceTimersByTimeAsync(0);
    expect(updated).toHaveBeenCalledTimes(1);
    window.removeEventListener(DATA_UPDATED_EVENT, updated);
  });

  it("a rank the user just picked is waited for, however long it takes", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    usePrefsStore.setState({
      loaded: true,
      prefs: { ...usePrefsStore.getState().prefs, metaSource: "dpm", dpmTier: "silver" },
    });
    sources({ opgg: [tier("266", "TOP", "A")] });
    let arrive!: (rows: MetaTier[]) => void;
    mOpggRank.mockReturnValue(new Promise((res) => (arrive = res)));
    let done = false;
    const loading = loadChampionDb(true, { waitForRankList: true }).then((db) => ((done = true), db));
    await vi.advanceTimersByTimeAsync(RANK_LIST_WAIT_MS * 3);
    expect(done).toBe(false);
    arrive([tier("222", "BOTTOM", "S")]);
    expect((await loading).metaSourceUsed).toBe("opggRank");
  });

  it("a per-rank list in time is used and announces nothing", async () => {
    usePrefsStore.setState({
      loaded: true,
      prefs: { ...usePrefsStore.getState().prefs, metaSource: "dpm", dpmTier: "gold" },
    });
    sources({ opggRank: [tier("222", "BOTTOM", "S")] });
    const updated = vi.fn();
    window.addEventListener(DATA_UPDATED_EVENT, updated);
    const db = await loadChampionDb();
    await new Promise((r) => setTimeout(r, 0));
    expect(db.metaSourceUsed).toBe("opggRank");
    expect(updated).not.toHaveBeenCalled();
    window.removeEventListener(DATA_UPDATED_EVENT, updated);
  });

  it("by-rank source with no rank data at all: the general op.gg list takes over", async () => {
    usePrefsStore.setState({
      loaded: true,
      prefs: { ...usePrefsStore.getState().prefs, metaSource: "dpm", dpmTier: "gold" },
    });
    sources({ opgg: [tier("266", "TOP", "A")] });
    const db = await loadChampionDb();
    expect(db.metaSourceUsed).toBe("opgg");
  });

  it("another source never asks for the per-rank list", async () => {
    usePrefsStore.setState({
      loaded: true,
      prefs: { ...usePrefsStore.getState().prefs, metaSource: "proplay" },
    });
    sources({ proplay: [tier("266", "TOP", "A")] });
    await loadChampionDb();
    expect(mOpggRank).not.toHaveBeenCalled();
  });

  it("falls back to localStorage prefs before the store hydrates", async () => {
    storage.setItem("lol-draft-prefs", JSON.stringify({ metaSource: "soloq" }));
    sources({ soloq: [tier("950", "MIDDLE", "B")] });
    const db = await loadChampionDb();
    expect(db.metaSourceRequested).toBe("soloq");
    expect(db.metaSourceUsed).toBe("soloq");
    expect(db.meta).toEqual([tier("950", "MIDDLE", "B")]);
  });

  it("fills missing dpm filters from localStorage with defaults", async () => {
    storage.setItem("lol-draft-prefs", JSON.stringify({ metaSource: "dpm", dpmTier: "master_plus" }));
    sources({ dpm: [tier("266", "TOP", "A")] });
    await loadChampionDb();
    const [dpmTier, dpmPlatform, dpmTimeframe] = mDpm.mock.calls[0];
    expect([dpmTier, dpmPlatform, dpmTimeframe]).toEqual(["master_plus", "euw1", "7days"]);
  });

  it("ignores malformed stored prefs and uses op.gg", async () => {
    storage.setItem("lol-draft-prefs", "{not json");
    sources();
    const db = await loadChampionDb();
    expect(db.metaSourceRequested).toBe("opgg");
    expect(mDpm).not.toHaveBeenCalled();
  });

  it("blends pro + soloq when the user picked blend", async () => {
    storage.setItem("lol-draft-prefs", JSON.stringify({ metaSource: "blend" }));
    sources({ opgg: [tier("266", "TOP", "A")], soloq: [tier("950", "JUNGLE", "B")], proplay: [tier("266", "TOP", "B")] });
    const db = await loadChampionDb();
    expect(db.metaSourceUsed).toBe("blend");
    expect(db.meta.map((m) => m.championKey).sort()).toEqual(["266", "950"]);
  });
});

describe("loadChampionDb — localStorage cache", () => {
  it("serves a fresh cache without refetching, and refetches once it is over 1h old", async () => {
    sources();
    const first = await loadChampionDb();
    expect(readChampionDbCacheUnsafe()).toEqual(first);

    vi.setSystemTime(NOW + 59 * 60_000);
    const second = await loadChampionDb();
    expect(second).toEqual(first);
    expect(mPatch).toHaveBeenCalledOnce();

    vi.setSystemTime(NOW + 61 * 60_000);
    const third = await loadChampionDb();
    expect(mPatch).toHaveBeenCalledTimes(2);
    expect(third.fetchedAt).toBe(NOW + 61 * 60_000);
  });

  it("a by-rank list that fell back to the general one is not kept: the next load tries the rank again", async () => {
    usePrefsStore.setState({
      loaded: true,
      prefs: { ...usePrefsStore.getState().prefs, metaSource: "dpm", dpmTier: "gold" },
    });
    sources({ opgg: [tier("266", "TOP", "A")] });
    const missed = await loadChampionDb();
    expect(missed.metaSourceUsed).toBe("opgg");

    mOpggRank.mockResolvedValue([tier("222", "BOTTOM", "S")]);
    const next = await loadChampionDb();
    expect(next.metaSourceUsed).toBe("opggRank");
    // That one is kept as usual.
    expect(await loadChampionDb()).toEqual(next);
    expect(mOpggRank).toHaveBeenCalledTimes(2);
  });

  it("force=true bypasses a fresh cache", async () => {
    sources();
    await loadChampionDb();
    await loadChampionDb(true);
    expect(mPatch).toHaveBeenCalledTimes(2);
  });

  it("readChampionDbCacheUnsafe returns stale data regardless of age", async () => {
    const stale = { patch: "14.1.1", champions: {}, counters: [], meta: [], fetchedAt: NOW - 7 * 86_400_000 };
    storage.setItem(CACHE_KEY, JSON.stringify(stale));
    expect(readChampionDbCacheUnsafe()).toEqual(stale);
  });

  it("treats a corrupt cache entry as missing", async () => {
    storage.setItem(CACHE_KEY, "{corrupt");
    expect(readChampionDbCacheUnsafe()).toBeNull();
    sources();
    const db = await loadChampionDb();
    expect(mPatch).toHaveBeenCalledOnce();
    expect(db.patch).toBe(PATCH);
  });

  it("still returns the db when the cache write fails (quota exceeded)", async () => {
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    sources();
    const db = await loadChampionDb();
    expect(db.patch).toBe(PATCH);
    expect(readChampionDbCacheUnsafe()).toBeNull();
  });
});
