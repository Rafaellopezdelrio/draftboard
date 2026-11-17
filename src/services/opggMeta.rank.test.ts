// fetchOpggMetaForRank: the tier list of one rank bracket, five lane requests
// through the proxy. All lanes or nothing.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchProxyJson } from "./proxyFetch";
import { fetchOpggMetaForRank, OPGG_RANK_TIMEOUT_MS } from "./opggMeta";

vi.mock("./riotApi", () => ({ getRiotProxyUrl: vi.fn(() => "https://proxy.test") }));
vi.mock("./proxyFetch", () => ({ fetchProxyJson: vi.fn() }));
vi.mock("./breadcrumbs", () => ({ trackFetch: vi.fn() }));

const mFetch = vi.mocked(fetchProxyJson);
const NAMES = new Map([
  ["Ahri", "103"],
  ["Garen", "86"],
  ["Jinx", "222"],
]);
const row = (name: string, tier = "S", games = 5000) => ({
  name,
  tier,
  winRate: 0.52,
  pickRate: 0.08,
  banRate: 0.03,
  kda: 2.5,
  rank: 1,
  games,
});
const laneOf = (url: string) => new URL(url).searchParams.get("lane");

beforeEach(() => {
  mFetch.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("fetchOpggMetaForRank", () => {
  it("asks the five lanes for that rank and maps them to roles, keeping the games", async () => {
    mFetch.mockImplementation(async (url: string) => {
      const lane = laneOf(url);
      if (lane === "mid") return { champions: [row("Ahri", "S", 904)] };
      if (lane === "adc") return { champions: [row("Jinx", "A")] };
      return { champions: [row("Garen", "B")] };
    });

    const meta = await fetchOpggMetaForRank("diamond_plus", NAMES);

    const urls = mFetch.mock.calls.map((c) => c[0]);
    expect(urls).toHaveLength(5);
    expect(urls.every((u) => u.startsWith("https://proxy.test/opgg/tierlist-rank?tier=diamond_plus&lane="))).toBe(true);
    expect(urls.map(laneOf).sort()).toEqual(["adc", "jungle", "mid", "support", "top"]);
    expect(meta).toContainEqual({
      championKey: "103",
      role: "MIDDLE",
      tier: "S",
      winRate: 0.52,
      pickRate: 0.08,
      banRate: 0.03,
      games: 904,
    });
    expect(meta.find((m) => m.championKey === "222")?.role).toBe("BOTTOM");
    expect(meta.filter((m) => m.championKey === "86").map((m) => m.role).sort()).toEqual(["JUNGLE", "TOP", "UTILITY"]);
  });

  it("skips a champion the app does not know", async () => {
    mFetch.mockResolvedValue({ champions: [row("Ahri"), row("Brand New Champ")] });
    const meta = await fetchOpggMetaForRank("gold", NAMES);
    expect(meta).toHaveLength(5);
    expect(meta.every((m) => m.championKey === "103")).toBe(true);
  });

  it("gives nothing when one lane comes back empty", async () => {
    mFetch.mockImplementation(async (url: string) =>
      laneOf(url) === "jungle" ? { champions: [] } : { champions: [row("Ahri")] }
    );
    expect(await fetchOpggMetaForRank("gold", NAMES)).toEqual([]);
  });

  it("gives nothing when one lane fails", async () => {
    mFetch.mockImplementation(async (url: string) => {
      if (laneOf(url) === "top") throw new Error("HTTP 502");
      return { champions: [row("Ahri")] };
    });
    expect(await fetchOpggMetaForRank("gold", NAMES)).toEqual([]);
  });

  it("gives up after the time limit instead of holding the load", async () => {
    vi.useFakeTimers();
    mFetch.mockImplementation(() => new Promise(() => {}));
    const pending = fetchOpggMetaForRank("gold", NAMES);
    await vi.advanceTimersByTimeAsync(OPGG_RANK_TIMEOUT_MS);
    expect(await pending).toEqual([]);
  });
});
