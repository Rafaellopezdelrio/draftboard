import { describe, it, expect, vi, beforeEach } from "vitest";
import { championLookup, fetchGridProGames, readSeries, type ProGames } from "./gridProPlay";
import type { ChampionDb } from "../types/champion";

const httpFetch = vi.fn();
const fetchProxyJson = vi.fn();
let proxy: string | null = "https://server.test";
vi.mock("./httpClient", () => ({ httpFetch: (...a: unknown[]) => httpFetch(...a) }));
vi.mock("./proxyFetch", () => ({ fetchProxyJson: (...a: unknown[]) => fetchProxyJson(...a) }));
vi.mock("./riotApi", () => ({ getRiotProxyUrl: () => proxy }));

const champ = (key: string, id: string, name = id) => ({ key, id, name });
const db = {
  champions: {
    "150": champ("150", "Gnar"),
    "234": champ("234", "Viego"),
    "268": champ("268", "Azir"),
    "222": champ("222", "Jinx"),
    "526": champ("526", "Rell"),
    "24": champ("24", "Jax"),
    "254": champ("254", "Vi"),
    "61": champ("61", "Orianna"),
    "81": champ("81", "Ezreal"),
    "43": champ("43", "Karma"),
    "145": champ("145", "Kaisa", "Kai'Sa"),
    "62": champ("62", "MonkeyKing", "Wukong"),
    "20": champ("20", "Nunu", "Nunu & Willump"),
  },
} as unknown as ChampionDb;

const state = (id = "77") => ({
  id,
  finished: true,
  games: [
    {
      n: 1,
      teams: [
        { name: "T1", won: true, picks: ["Gnar", "Viego", "Azir", "Jinx", "Rell"], bans: ["Kai'Sa", "Wukong"] },
        { name: "GEN", won: false, picks: ["Jax", "Vi", "Orianna", "Ezreal", "Karma"], bans: ["Kai'Sa"] },
      ],
    },
  ],
});
const empty = (): ProGames => ({ picks: [], bans: new Map(), games: 0 });

beforeEach(() => {
  proxy = "https://server.test";
  httpFetch.mockReset();
  fetchProxyJson.mockReset();
});

describe("championLookup", () => {
  it("matches display names, DDragon ids and names with punctuation", () => {
    const find = championLookup(db);
    expect(find("Kai'Sa")).toBe("145");
    expect(find("KaiSa")).toBe("145");
    expect(find("Wukong")).toBe("62");
    expect(find("Nunu & Willump")).toBe("20");
    expect(find("Not A Champion")).toBeNull();
  });
});

describe("readSeries", () => {
  it("gives each team's five champions a role and credits the winner", () => {
    const out = empty();
    readSeries(db, state(), championLookup(db), out);
    expect(out.games).toBe(1);
    expect(out.picks).toHaveLength(10);
    expect(out.picks.find((p) => p.championKey === "222")).toMatchObject({ role: "BOTTOM", win: true, gameId: "GRID_77_1" });
    expect(out.picks.find((p) => p.championKey === "254")).toMatchObject({ role: "JUNGLE", win: false });
    expect(new Set(out.picks.filter((p) => p.win).map((p) => p.role)).size).toBe(5);
  });

  it("counts a champion banned by both teams once per game", () => {
    const out = empty();
    readSeries(db, state(), championLookup(db), out);
    expect(out.bans.get("145")).toBe(1);
    expect(out.bans.get("62")).toBe(1);
  });

  it("skips a game where no champion is recognised", () => {
    const out = empty();
    const s = state();
    s.games[0].teams.forEach((t) => (t.picks = ["??", "???"]));
    readSeries(db, s, championLookup(db), out);
    expect(out.games).toBe(0);
  });
});

describe("fetchGridProGames", () => {
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

  it("returns null when the server has no GRID key yet, with a single attempt", async () => {
    httpFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "grid not configured" }) });
    expect(await fetchGridProGames(db, 14, () => {}, 1_800_000_000_000)).toBeNull();
    expect(httpFetch).toHaveBeenCalledTimes(1);
    expect(fetchProxyJson).not.toHaveBeenCalled();
  });

  it("returns null without Draftboard's server", async () => {
    proxy = null;
    expect(await fetchGridProGames(db, 14, () => {})).toBeNull();
    expect(httpFetch).not.toHaveBeenCalled();
  });

  it("pages the series list, reads each series and survives one failing", async () => {
    vi.useFakeTimers();
    httpFetch
      .mockResolvedValueOnce(ok({ total: 3, next: "c1", series: [{ id: "1" }, { id: "2" }] }))
      .mockResolvedValueOnce(ok({ total: 3, next: null, series: [{ id: "3" }] }));
    fetchProxyJson
      .mockResolvedValueOnce(state("1"))
      .mockRejectedValueOnce(new Error("HTTP 404"))
      .mockResolvedValueOnce(state("3"));
    const run = fetchGridProGames(db, 14, () => {}, Date.UTC(2026, 10, 15));
    await vi.runAllTimersAsync();
    const out = await run;
    vi.useRealTimers();
    expect(String(httpFetch.mock.calls[0][0])).toContain("/grid/series?from=2026-11-01T00:00:00Z&to=2026-11-15T00:00:00Z");
    expect(String(httpFetch.mock.calls[1][0])).toContain("&after=c1");
    expect(fetchProxyJson).toHaveBeenCalledTimes(3);
    expect(out?.games).toBe(2);
    expect(out?.picks).toHaveLength(20);
  });
});
