import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Breadcrumbs are telemetry (Sentry); mock them so we can check which fetch
// outcomes the service reports.
vi.mock("./breadcrumbs", () => ({ trackFetch: vi.fn() }));

import { fetchChampionDetail, fetchChampions, fetchLatestPatch } from "./dataDragon";
import { trackFetch } from "./breadcrumbs";

const mTrack = vi.mocked(trackFetch);
const fetchMock = vi.fn();

const VERSIONS_URL = "https://ddragon.leagueoflegends.com/api/versions.json";

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function fail(status: number) {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  mTrack.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchLatestPatch", () => {
  it("returns the newest version from versions.json", async () => {
    fetchMock.mockResolvedValue(ok(["15.20.1", "15.19.1"]));
    await expect(fetchLatestPatch()).resolves.toBe("15.20.1");
    expect(fetchMock).toHaveBeenCalledWith(VERSIONS_URL);
    expect(mTrack).toHaveBeenCalledWith(VERSIONS_URL, "ok");
  });

  it("retries a failed HTTP response and reports each retry", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok(["15.20.1"]));
    const p = fetchLatestPatch();
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("15.20.1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mTrack).toHaveBeenCalledWith(VERSIONS_URL, "fail", "attempt 1");
  });

  it("rejects with the HTTP status after 3 failed attempts", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(fail(500));
    const p = fetchLatestPatch();
    const assertion = expect(p).rejects.toThrow("DDragon versions: HTTP 500");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("fetchChampions", () => {
  const LIST = {
    data: {
      Aatrox: {
        id: "Aatrox",
        key: "266",
        name: "Aatrox",
        title: "the Darkin Blade",
        tags: ["Fighter", "Tank"],
        image: { full: "Aatrox.png" },
      },
      // Ids below are not in CHAMPION_ARCHETYPES, so archetypes come from tags.
      // Tags are split so no branch's output is masked by another tag's.
      Newblade: {
        id: "Newblade",
        key: "9001",
        name: "Newblade",
        title: "t",
        tags: ["Assassin", "Mage"],
        image: { full: "Newblade.png" },
      },
      Warden: {
        id: "Warden",
        key: "9002",
        name: "Warden",
        title: "t",
        tags: ["Tank", "Support"],
        image: { full: "Warden.png" },
      },
      Bruiser: {
        id: "Bruiser",
        key: "9004",
        name: "Bruiser",
        title: "t",
        tags: ["Fighter"],
        image: { full: "Bruiser.png" },
      },
      Sniper: {
        id: "Sniper",
        key: "9005",
        name: "Sniper",
        title: "t",
        tags: ["Marksman"],
        image: { full: "Sniper.png" },
      },
      Oddity: {
        id: "Oddity",
        key: "9003",
        name: "Oddity",
        title: "t",
        tags: ["Specialist"],
        image: { full: "Oddity.png" },
      },
    },
  };

  it("fetches the en_US list by default and keys champions by numeric key", async () => {
    fetchMock.mockResolvedValue(ok(LIST));
    const out = await fetchChampions("15.20.1");
    const url = "https://ddragon.leagueoflegends.com/cdn/15.20.1/data/en_US/champion.json";
    expect(fetchMock).toHaveBeenCalledWith(url);
    expect(mTrack).toHaveBeenCalledWith(url, "ok");
    expect(Object.keys(out).sort()).toEqual(["266", "9001", "9002", "9003", "9004", "9005"]);
    expect(out["266"]).toEqual({
      id: "Aatrox",
      key: "266",
      name: "Aatrox",
      title: "the Darkin Blade",
      iconUrl: "https://ddragon.leagueoflegends.com/cdn/15.20.1/img/champion/Aatrox.png",
      splashUrl: "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_0.jpg",
      tags: ["Fighter", "Tank"],
      roles: ["TOP", "JUNGLE", "UTILITY"], // union of tag roles, deduped
      archetypes: ["frontline", "sustain-dps"], // curated entry wins over tags
    });
  });

  it("honours a custom locale", async () => {
    fetchMock.mockResolvedValue(ok({ data: {} }));
    await expect(fetchChampions("15.20.1", "es_ES")).resolves.toEqual({});
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ddragon.leagueoflegends.com/cdn/15.20.1/data/es_ES/champion.json"
    );
  });

  it("infers roles and archetypes from tags for champions missing from the curated map", async () => {
    fetchMock.mockResolvedValue(ok(LIST));
    const out = await fetchChampions("15.20.1");

    expect(out["9001"].roles).toEqual(["JUNGLE", "MIDDLE", "UTILITY"]);
    expect(new Set(out["9001"].archetypes)).toEqual(
      new Set(["burst", "pick", "poke", "wave-clear"])
    );

    expect(out["9002"].roles).toEqual(["TOP", "UTILITY"]);
    expect(new Set(out["9002"].archetypes)).toEqual(new Set(["frontline", "engage", "peel"]));

    expect(out["9004"].roles).toEqual(["TOP", "JUNGLE"]);
    expect(out["9004"].archetypes).toEqual(["sustain-dps"]);

    expect(out["9005"].roles).toEqual(["BOTTOM"]);
    expect(out["9005"].archetypes).toEqual(["sustain-dps"]);

    // Unknown tag → MIDDLE fallback role, no archetypes.
    expect(out["9003"].roles).toEqual(["MIDDLE"]);
    expect(out["9003"].archetypes).toEqual([]);
  });

  it("rejects with the HTTP status after retries are exhausted", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(fail(404));
    const p = fetchChampions("0.0.0");
    const assertion = expect(p).rejects.toThrow("DDragon champions: HTTP 404");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mTrack).toHaveBeenCalledWith(
      "https://ddragon.leagueoflegends.com/cdn/0.0.0/data/en_US/champion.json",
      "fail",
      "attempt 2"
    );
  });
});

describe("fetchChampionDetail", () => {
  // DETAIL_CACHE is module-level; each test uses its own patch to stay isolated.
  const detail = (name: string) => ({
    id: "Ahri",
    name,
    title: "t",
    lore: "l",
    tags: ["Mage"],
    passive: { name: "p", description: "d" },
    spells: [],
    info: { attack: 3, defense: 4, magic: 8, difficulty: 5 },
  });

  it("fetches the es_ES detail by default and caches it per patch+champion", async () => {
    fetchMock.mockResolvedValue(ok({ data: { Ahri: detail("Ahri ES") } }));
    const first = await fetchChampionDetail("1.0.1", "Ahri");
    expect(first?.name).toBe("Ahri ES");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ddragon.leagueoflegends.com/cdn/1.0.1/data/es_ES/champion/Ahri.json"
    );

    const second = await fetchChampionDetail("1.0.1", "Ahri");
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("falls back to en_US when the localized file is missing, and caches that", async () => {
    fetchMock
      .mockResolvedValueOnce(fail(403))
      .mockResolvedValueOnce(ok({ data: { Ahri: detail("Ahri EN") } }));
    const out = await fetchChampionDetail("1.0.2", "Ahri");
    expect(out?.name).toBe("Ahri EN");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://ddragon.leagueoflegends.com/cdn/1.0.2/data/en_US/champion/Ahri.json"
    );
    await fetchChampionDetail("1.0.2", "Ahri");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when both the localized and en_US files are missing", async () => {
    fetchMock.mockResolvedValue(fail(404));
    await expect(fetchChampionDetail("1.0.3", "Ahri")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null (and does not cache) when the payload lacks the champion", async () => {
    fetchMock.mockResolvedValue(ok({ data: {} }));
    await expect(fetchChampionDetail("1.0.4", "Ahri")).resolves.toBeNull();
    await expect(fetchChampionDetail("1.0.4", "Ahri")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when the en_US fallback payload lacks the champion", async () => {
    fetchMock.mockResolvedValueOnce(fail(404)).mockResolvedValueOnce(ok({ data: {} }));
    await expect(fetchChampionDetail("1.0.5", "Ahri")).resolves.toBeNull();
  });

  it("returns null instead of throwing on a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchChampionDetail("1.0.6", "Ahri")).resolves.toBeNull();
  });
});
