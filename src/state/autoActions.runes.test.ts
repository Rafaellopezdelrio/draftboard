// Auto-runes source order. Live game 2026-10-29: Kayn locked, the item set
// and spells were pushed but no rune page — the only rune source was the
// local synced aggregate, which was empty, so apply() returned silently.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { pickAutoRunePage, queueRuneApply } from "./autoActions";
import * as opgg from "../services/opggBuilds";
import * as lolvvv from "../services/lolvvvBuilds";
import * as agg from "../services/aggregateRepo";
import * as lcu from "../services/lcuService";
import type { ChampionDb } from "../types/champion";

vi.mock("../services/opggBuilds", async (importActual) => {
  const actual = await importActual<typeof import("../services/opggBuilds")>();
  return { ...actual, fetchOpggBuild: vi.fn() };
});
vi.mock("../services/lolvvvBuilds", () => ({ fetchLolvvvBuild: vi.fn() }));
vi.mock("../services/aggregateRepo", () => ({ loadAggregatedRunes: vi.fn() }));
vi.mock("../services/lcuService", () => ({
  applyRunesResult: vi.fn(async () => ({ ok: true })),
  applySummonerSpells: vi.fn(),
  pushItemSet: vi.fn(),
}));

const db = { patch: "16.21.1", champions: { "141": { id: "Kayn", key: "141", name: "Kayn" } } } as unknown as ChampionDb;

const opggRunes = (pickRate: number, keystone: string) => ({
  primaryPage: "Domination",
  primaryRunes: [keystone, "Sudden Impact", "Grisly Mementos", "Treasure Hunter"],
  secondaryPage: "Inspiration",
  secondaryRunes: ["Magical Footwear", "Cosmic Insight"],
  statMods: ["5008", "5008", "5001"],
  play: 100,
  pickRate,
});

describe("pickAutoRunePage", () => {
  beforeEach(() => {
    vi.mocked(opgg.fetchOpggBuild).mockReset();
    vi.mocked(lolvvv.fetchLolvvvBuild).mockReset();
    vi.mocked(lolvvv.fetchLolvvvBuild).mockResolvedValue(null);
    vi.mocked(agg.loadAggregatedRunes).mockReset();
  });

  it("falls back to op.gg's most popular page when lolvvv has nothing for the role", async () => {
    vi.mocked(opgg.fetchOpggBuild).mockResolvedValue({
      runes: [opggRunes(0.2, "Electrocute"), opggRunes(0.6, "Dark Harvest")],
    } as unknown as opgg.OpggBuild);
    const page = await pickAutoRunePage(db, "141", "JUNGLE");
    expect(page?.name).toBe("Draftboard · Kayn JUNGLE");
    expect(page?.selectedPerkIds[0]).toBe(8128); // Dark Harvest, the 60% page
    expect(lolvvv.fetchLolvvvBuild).toHaveBeenCalled(); // asked first
  });

  it("uses the lolvvv pro page first for the same role (owner preference)", async () => {
    vi.mocked(opgg.fetchOpggBuild).mockResolvedValue(null);
    vi.mocked(lolvvv.fetchLolvvvBuild).mockResolvedValue({
      role: "JUNGLE",
      runePage: { primaryStyleId: 8000, subStyleId: 8300, selectedPerkIds: [8010, 9111, 9104, 8017, 8347, 8304, 5005, 5008, 5001], pickRate: 0.9 },
    } as unknown as lolvvv.LolvvvBuild);
    const page = await pickAutoRunePage(db, "141", "JUNGLE");
    expect(page).toMatchObject({ name: "Draftboard · Kayn JUNGLE", primaryStyleId: 8000 });
    expect(opgg.fetchOpggBuild).not.toHaveBeenCalled();
  });

  it("ignores a lolvvv page scraped for another role, then uses the local aggregate", async () => {
    vi.mocked(opgg.fetchOpggBuild).mockRejectedValue(new Error("offline"));
    vi.mocked(lolvvv.fetchLolvvvBuild).mockResolvedValue({ role: "TOP", runePage: { primaryStyleId: 1, subStyleId: 2, selectedPerkIds: [] } } as unknown as lolvvv.LolvvvBuild);
    const PERKS = [8128, 8143, 8140, 8135, 8304, 8347];
    const SHARDS = [5008, 5008, 5001];
    vi.mocked(agg.loadAggregatedRunes).mockResolvedValue({ primaryStyle: 8100, subStyle: 8300, perks: PERKS, shards: SHARDS } as never);
    const page = await pickAutoRunePage(db, "141", "JUNGLE");
    expect(page).toEqual({ name: "Draftboard · Kayn JUNGLE", primaryStyleId: 8100, subStyleId: 8300, selectedPerkIds: [...PERKS, ...SHARDS] });
  });

  it("returns null when no source has a page", async () => {
    vi.mocked(opgg.fetchOpggBuild).mockResolvedValue(null);
    vi.mocked(lolvvv.fetchLolvvvBuild).mockResolvedValue(null);
    vi.mocked(agg.loadAggregatedRunes).mockResolvedValue(null);
    expect(await pickAutoRunePage(db, "141", "JUNGLE")).toBeNull();
  });
});

describe("queueRuneApply", () => {
  beforeEach(() => {
    vi.mocked(lcu.applyRunesResult).mockClear();
    vi.mocked(opgg.fetchOpggBuild).mockReset();
    vi.mocked(lolvvv.fetchLolvvvBuild).mockReset();
    vi.mocked(lolvvv.fetchLolvvvBuild).mockResolvedValue(null);
    vi.mocked(agg.loadAggregatedRunes).mockReset();
  });

  it("drops a request superseded while it was still fetching (latest wins)", async () => {
    // A (Annie) starts fetching op.gg slowly; B (Kayn) is queued meanwhile.
    let releaseA!: (v: unknown) => void;
    vi.mocked(opgg.fetchOpggBuild)
      .mockImplementationOnce(() => new Promise((r) => (releaseA = r)) as never)
      .mockResolvedValueOnce({ runes: [opggRunes(0.5, "Dark Harvest")] } as never);
    const twoChamps = {
      patch: "16.21.1",
      champions: { "1": { id: "Annie", key: "1", name: "Annie" }, "141": { id: "Kayn", key: "141", name: "Kayn" } },
    } as unknown as ChampionDb;
    const q = { gen: 0, tail: Promise.resolve() };
    const a = queueRuneApply(q, twoChamps, "1", "MIDDLE", vi.fn());
    await vi.waitFor(() => expect(opgg.fetchOpggBuild).toHaveBeenCalledTimes(1));
    const b = queueRuneApply(q, twoChamps, "141", "JUNGLE", vi.fn());
    releaseA({ runes: [opggRunes(0.5, "Electrocute")] });
    await a;
    await b;
    // Only Kayn reached the client; Annie's late page was dropped.
    expect(vi.mocked(lcu.applyRunesResult).mock.calls.map((c) => c[0].name)).toEqual(["Draftboard · Kayn JUNGLE"]);
  });

  it("calls onFail when no source has a page, so a later lock can retry", async () => {
    vi.mocked(opgg.fetchOpggBuild).mockResolvedValue(null);
    vi.mocked(lolvvv.fetchLolvvvBuild).mockResolvedValue(null);
    vi.mocked(agg.loadAggregatedRunes).mockResolvedValue(null);
    const onFail = vi.fn();
    await queueRuneApply({ gen: 0, tail: Promise.resolve() }, db, "141", "JUNGLE", onFail);
    expect(onFail).toHaveBeenCalledOnce();
  });
});
