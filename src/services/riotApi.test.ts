import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Control the HTTP layer (isTauri() is true under the test setup, so riotApi's
// httpFetch routes through @tauri-apps/plugin-http).
const httpFetchMock = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => httpFetchMock(...args),
}));

import {
  getAccount,
  getAccountByRiotId,
  getRecentMatchIds,
  getSummonerByPuuid,
  getSummonerByPuuidPlatform,
  getLeagueEntriesBySummoner,
  getLeagueEntriesByPuuid,
  getCurrentGameByPuuid,
  getMasterLeague,
  getPuuidBySummonerId,
  getTopMasteries,
  getMatch,
  getMatchFull,
  getMatchTimeline,
  setRiotProxyUrl,
  getRiotProxyUrl,
  type Region,
  type RiotConfig,
} from "./riotApi";
import { setUiLocale } from "../i18n";

function res429(retryAfter: string) {
  return {
    status: 429,
    ok: false,
    headers: {
      get: (h: string) => (h.toLowerCase() === "retry-after" ? retryAfter : null),
    },
  };
}

const cfg = {
  region: "euw1",
  riotIdName: "x",
  riotIdTag: "EUW",
  apiKey: "k",
} as Parameters<typeof getAccount>[0];

describe("riotApi — rate-limit (429) retry is bounded", () => {
  beforeEach(() => httpFetchMock.mockReset());

  it("throws after a capped number of 429 retries instead of looping forever", async () => {
    vi.useFakeTimers();
    httpFetchMock.mockResolvedValue(res429("1"));
    const settled = getAccount(cfg).then(
      () => "resolved",
      () => "rejected"
    );
    await vi.runAllTimersAsync();
    expect(await settled).toBe("rejected");
    // Initial call + 5 bounded retries = 6 — not unbounded.
    expect(httpFetchMock).toHaveBeenCalledTimes(6);
    vi.useRealTimers();
  });

  it("clamps Retry-After: 0 so a broken proxy can't busy-loop", async () => {
    vi.useFakeTimers();
    httpFetchMock.mockResolvedValue(res429("0"));
    const settled = getAccount(cfg).then(
      () => "resolved",
      () => "rejected"
    );
    await vi.runAllTimersAsync();
    expect(await settled).toBe("rejected");
    expect(httpFetchMock).toHaveBeenCalledTimes(6);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Client behaviour: routing, proxy mode, error mapping, retries, DTO mapping.
// ---------------------------------------------------------------------------

function res(status: number, body: unknown = null, retryAfter: string | null = null) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (h: string) => (h.toLowerCase() === "retry-after" ? retryAfter : null),
    },
    json: async () => body,
  };
}

const baseCfg: RiotConfig = {
  apiKey: "  RGAPI-test-key  ",
  region: "euw1",
  riotIdName: "Faker",
  riotIdTag: "KR1",
};
const ACCOUNT = { puuid: "PUUID-1", gameName: "Faker", tagLine: "KR1" };

/** URL of the n-th (0-based) request the client made. */
const urlOf = (n = 0) => httpFetchMock.mock.calls[n][0] as string;

// The module-level rate limiter (95 req / 2 min) remembers every request made
// in this file. Each test jumps the fake clock well past the window so earlier
// tests' requests never throttle later ones.
let clock = Date.now() + 10_000_000;

describe("riotApi — client", () => {
  beforeEach(() => {
    httpFetchMock.mockReset();
    setRiotProxyUrl(null);
    vi.useFakeTimers();
    clock += 10 * 60_000;
    vi.setSystemTime(clock);
  });
  afterEach(() => {
    vi.useRealTimers();
    setRiotProxyUrl(null);
  });

  describe("direct mode (own API key)", () => {
    it("calls the regional account route with an encoded Riot ID and a trimmed X-Riot-Token", async () => {
      httpFetchMock.mockResolvedValue(res(200, ACCOUNT));
      const out = await getAccount({ ...baseCfg, riotIdName: "Señor Ñ", riotIdTag: "EU W" });
      expect(out).toEqual(ACCOUNT);
      expect(httpFetchMock).toHaveBeenCalledOnce();
      expect(httpFetchMock).toHaveBeenCalledWith(
        "https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Se%C3%B1or%20%C3%91/EU%20W",
        { headers: { "X-Riot-Token": "RGAPI-test-key" } }
      );
    });

    it.each<[Region, string]>([
      ["euw1", "europe"],
      ["eun1", "europe"],
      ["tr1", "europe"],
      ["ru", "europe"],
      ["na1", "americas"],
      ["br1", "americas"],
      ["la1", "americas"],
      ["la2", "americas"],
      ["kr", "asia"],
      ["jp1", "asia"],
      ["oc1", "sea"],
    ])("routes match-v5 for platform %s through the %s cluster", async (region, cluster) => {
      httpFetchMock.mockResolvedValue(res(200, ["EUW1_1"]));
      await expect(getRecentMatchIds({ ...baseCfg, region }, "P1", 7)).resolves.toEqual(["EUW1_1"]);
      expect(urlOf()).toBe(
        `https://${cluster}.api.riotgames.com/lol/match/v5/matches/by-puuid/P1/ids?start=0&count=7`
      );
    });

    it.each<[string, () => Promise<unknown>, string]>([
      [
        "getAccountByRiotId",
        () => getAccountByRiotId(baseCfg, "Some One", "T#1"),
        "https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Some%20One/T%231",
      ],
      [
        "getRecentMatchIds (default count)",
        () => getRecentMatchIds(baseCfg, "P1"),
        "https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/P1/ids?start=0&count=20",
      ],
      [
        "getSummonerByPuuid",
        () => getSummonerByPuuid({ ...baseCfg, region: "kr" }, "P1"),
        "https://kr.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/P1",
      ],
      [
        "getSummonerByPuuidPlatform",
        () => getSummonerByPuuidPlatform(baseCfg, "P2"),
        "https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/P2",
      ],
      [
        "getLeagueEntriesBySummoner",
        () => getLeagueEntriesBySummoner(baseCfg, "S1"),
        "https://euw1.api.riotgames.com/lol/league/v4/entries/by-summoner/S1",
      ],
      [
        "getLeagueEntriesByPuuid",
        () => getLeagueEntriesByPuuid({ ...baseCfg, region: "na1" }, "P1"),
        "https://na1.api.riotgames.com/lol/league/v4/entries/by-puuid/P1",
      ],
      [
        "getMasterLeague",
        () => getMasterLeague(baseCfg),
        "https://euw1.api.riotgames.com/lol/league/v4/masterleagues/by-queue/RANKED_SOLO_5x5",
      ],
      [
        "getTopMasteries (default count)",
        () => getTopMasteries(baseCfg, "P1"),
        "https://euw1.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/P1/top?count=5",
      ],
      [
        "getTopMasteries (custom count)",
        () => getTopMasteries(baseCfg, "P1", 3),
        "https://euw1.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/P1/top?count=3",
      ],
    ])("%s hits the right endpoint", async (_name, call, url) => {
      httpFetchMock.mockResolvedValue(res(200, []));
      await call();
      expect(urlOf()).toBe(url);
    });

    it("getPuuidBySummonerId unwraps the puuid from the summoner DTO", async () => {
      httpFetchMock.mockResolvedValue(res(200, { id: "S1", puuid: "PUUID-from-summoner" }));
      await expect(getPuuidBySummonerId(baseCfg, "S1")).resolves.toBe("PUUID-from-summoner");
      expect(urlOf()).toBe("https://euw1.api.riotgames.com/lol/summoner/v4/summoners/S1");
    });
  });

  describe("proxy mode", () => {
    it("normalises the proxy URL (trim + strip trailing slash) and treats blank as unset", () => {
      setRiotProxyUrl("  https://proxy.test/  ");
      expect(getRiotProxyUrl()).toBe("https://proxy.test");
      setRiotProxyUrl("   ");
      expect(getRiotProxyUrl()).toBeNull();
      setRiotProxyUrl("https://proxy.test");
      setRiotProxyUrl(null);
      expect(getRiotProxyUrl()).toBeNull();
    });

    it("rewrites regional and platform hosts to <proxy>/api/<host>/... and sends no key", async () => {
      setRiotProxyUrl("https://proxy.test/");
      httpFetchMock.mockResolvedValue(res(200, ACCOUNT));
      await getAccount({ ...baseCfg, apiKey: "" });
      await getSummonerByPuuid(baseCfg, "P1");
      expect(httpFetchMock.mock.calls[0]).toEqual([
        "https://proxy.test/api/europe/riot/account/v1/accounts/by-riot-id/Faker/KR1",
        { headers: {} },
      ]);
      expect(httpFetchMock.mock.calls[1]).toEqual([
        "https://proxy.test/api/euw1/lol/summoner/v4/summoners/by-puuid/P1",
        { headers: {} },
      ]);
    });
  });

  describe("error mapping", () => {
    it.each([401, 403])("HTTP %i surfaces the expired-key message without retrying", async (status) => {
      httpFetchMock.mockResolvedValue(res(status));
      await expect(getAccount(baseCfg)).rejects.toThrow(/API key inválida o caducada/);
      expect(httpFetchMock).toHaveBeenCalledOnce();
    });

    it("HTTP 404 surfaces the Riot-ID-not-found message", async () => {
      httpFetchMock.mockResolvedValue(res(404));
      await expect(getAccount(baseCfg)).rejects.toThrow(
        "Riot ID no encontrado. Revisa el nombre y el tag (lo que va después de #)."
      );
      expect(httpFetchMock).toHaveBeenCalledOnce();
    });

    it("other 4xx fail fast with status + original Riot URL", async () => {
      httpFetchMock.mockResolvedValue(res(400));
      await expect(getMasterLeague(baseCfg)).rejects.toThrow(
        "Riot API 400: https://euw1.api.riotgames.com/lol/league/v4/masterleagues/by-queue/RANKED_SOLO_5x5"
      );
      expect(httpFetchMock).toHaveBeenCalledOnce();
    });

    it("retries a 5xx after 1s backoff and returns the eventual success", async () => {
      httpFetchMock.mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200, ACCOUNT));
      const p = getAccount(baseCfg);
      await vi.advanceTimersByTimeAsync(999);
      expect(httpFetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(httpFetchMock).toHaveBeenCalledTimes(2);
      await expect(p).resolves.toEqual(ACCOUNT);
    });

    it("gives up on a persistent 5xx after 3 retries with doubling backoff (1s, 2s, 4s)", async () => {
      const t0 = Date.now();
      const at: number[] = [];
      httpFetchMock.mockImplementation(async () => {
        at.push(Date.now() - t0);
        return res(502);
      });
      const p = getAccount(baseCfg);
      const assertion = expect(p).rejects.toThrow(/^Riot API 502: https:\/\/europe\.api/);
      await vi.runAllTimersAsync();
      await assertion;
      expect(at).toEqual([0, 1_000, 3_000, 7_000]);
    });

    it("retries network failures with doubling backoff (0.5s, 1s, 2s), then reports no connection to Riot API", async () => {
      const t0 = Date.now();
      const at: number[] = [];
      httpFetchMock.mockImplementation(async () => {
        at.push(Date.now() - t0);
        throw new Error("boom");
      });
      const p = getAccount(baseCfg);
      const assertion = expect(p).rejects.toThrow(new Error("Sin conexión a Riot API: Error: boom"));
      await vi.runAllTimersAsync();
      await assertion;
      expect(at).toEqual([0, 500, 1_500, 3_500]);
    });

    it("recovers when the network comes back mid-backoff", async () => {
      httpFetchMock
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(res(200, ACCOUNT));
      const p = getAccount(baseCfg);
      await vi.advanceTimersByTimeAsync(500);
      await expect(p).resolves.toEqual(ACCOUNT);
      expect(httpFetchMock).toHaveBeenCalledTimes(2);
    });

    it("names the proxy as the unreachable target and truncates the error detail to 100 chars", async () => {
      setRiotProxyUrl("https://proxy.test");
      httpFetchMock.mockRejectedValue(new Error("x".repeat(300)));
      const p = getAccount(baseCfg);
      // An Error argument makes toThrow compare the whole message (a string
      // would only check it is a substring, which the untruncated text passes).
      // "Error: " (7 chars) + 93 x's = 100 chars of detail.
      const assertion = expect(p).rejects.toThrow(
        new Error(`Sin conexión a proxy: Error: ${"x".repeat(93)}`)
      );
      await vi.runAllTimersAsync();
      await assertion;
    });
  });

  describe("429 Retry-After handling", () => {
    it.each<[string | null, number]>([
      ["2", 2_000],
      [null, 5_000], // missing header -> 5s default
      ["soon", 5_000], // unparseable -> 5s
      ["0", 1_000], // clamped up to 1s
      ["999", 30_000], // clamped down to 30s
    ])("Retry-After %s waits %ims before retrying", async (header, waitMs) => {
      httpFetchMock
        .mockResolvedValueOnce(res(429, null, header))
        .mockResolvedValueOnce(res(200, ACCOUNT));
      const p = getAccount(baseCfg);
      await vi.advanceTimersByTimeAsync(waitMs - 1);
      expect(httpFetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(httpFetchMock).toHaveBeenCalledTimes(2);
      await expect(p).resolves.toEqual(ACCOUNT);
    });

    it("surfaces the rate-limit message once the retry budget is spent", async () => {
      httpFetchMock.mockResolvedValue(res(429, null, "1"));
      const p = getAccount(baseCfg);
      const assertion = expect(p).rejects.toThrow("Demasiadas peticiones, espera 1 min");
      await vi.runAllTimersAsync();
      await assertion;
    });
  });

  describe("client-side rate limiter", () => {
    it("holds the 96th request in a 2-minute window until the oldest slot expires", async () => {
      httpFetchMock.mockResolvedValue(res(200, ACCOUNT));
      const calls = Array.from({ length: 96 }, () => getAccount(baseCfg));
      await vi.advanceTimersByTimeAsync(0);
      expect(httpFetchMock).toHaveBeenCalledTimes(95);
      // wait = window (120s) - elapsed (0) + 50ms safety margin
      await vi.advanceTimersByTimeAsync(120_049);
      expect(httpFetchMock).toHaveBeenCalledTimes(95);
      await vi.advanceTimersByTimeAsync(1);
      expect(httpFetchMock).toHaveBeenCalledTimes(96);
      await expect(Promise.all(calls)).resolves.toHaveLength(96);
    });
  });

  describe("getCurrentGameByPuuid", () => {
    const GAME = {
      gameId: 1,
      gameStartTime: 0,
      gameLength: 300,
      gameMode: "CLASSIC",
      gameType: "MATCHED_GAME",
      gameQueueConfigId: 420,
      mapId: 11,
      participants: [],
    };

    it("returns the live game from the spectator route", async () => {
      httpFetchMock.mockResolvedValue(res(200, GAME));
      await expect(getCurrentGameByPuuid(baseCfg, "P1")).resolves.toEqual(GAME);
      expect(urlOf()).toBe(
        "https://euw1.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/P1"
      );
    });

    it("returns null when the player is not in game (404)", async () => {
      httpFetchMock.mockResolvedValue(res(404));
      await expect(getCurrentGameByPuuid(baseCfg, "P1")).resolves.toBeNull();
    });

    it("rethrows non-404 failures", async () => {
      httpFetchMock.mockResolvedValue(res(403));
      await expect(getCurrentGameByPuuid(baseCfg, "P1")).rejects.toThrow(
        /API key inválida o caducada/
      );
    });

    // "Not in game" must be detected from the HTTP status, not from the
    // translated error text, or an English UI turns a 404 into an error.
    it("returns null on 404 regardless of UI locale (en)", async () => {
      await setUiLocale("en");
      try {
        httpFetchMock.mockResolvedValue(res(404));
        await expect(getCurrentGameByPuuid(baseCfg, "P1")).resolves.toBeNull();
      } finally {
        await setUiLocale("es");
      }
    });

    // A non-404 error whose text happens to contain "404" (here the request URL
    // embedded in "Riot API 503: <url>") must not be read as "not in game".
    it("rethrows a persistent 5xx even when the puuid contains '404'", async () => {
      httpFetchMock.mockResolvedValue(res(503));
      const p = getCurrentGameByPuuid(baseCfg, "abc404def");
      const assertion = expect(p).rejects.toThrow(/^Riot API 503: /);
      await vi.runAllTimersAsync();
      await assertion;
    });
  });

  describe("match DTO mapping", () => {
    function participant(over: Record<string, unknown> = {}) {
      return {
        puuid: "me",
        participantId: 1,
        championId: 266,
        teamId: 100,
        win: true,
        kills: 5,
        deaths: 2,
        assists: 7,
        totalMinionsKilled: 150,
        neutralMinionsKilled: 12,
        teamPosition: "TOP",
        goldEarned: 11_000,
        totalDamageDealtToChampions: 20_000,
        magicDamageDealtToChampions: 1_000,
        physicalDamageDealtToChampions: 18_000,
        totalDamageTaken: 25_000,
        damageDealtToObjectives: 5_000,
        visionScore: 22,
        wardsPlaced: 8,
        wardsKilled: 3,
        detectorWardsPlaced: 2,
        champLevel: 16,
        item0: 3071,
        item1: 0,
        item2: 3053,
        item3: 0,
        item4: 0,
        item5: 3047,
        item6: 3340,
        summoner1Id: 4,
        summoner2Id: 12,
        perks: { styles: [] },
        ...over,
      };
    }

    const TEAMS = [
      {
        teamId: 100,
        win: true,
        objectives: {
          baron: { kills: 1 },
          dragon: { kills: 3 },
          tower: { kills: 9 },
          riftHerald: { kills: 1 },
          inhibitor: { kills: 2 },
        },
      },
    ];

    function matchDto(participants: ReturnType<typeof participant>[]) {
      return {
        metadata: { matchId: "EUW1_123" },
        info: {
          gameDuration: 1_800,
          gameEndTimestamp: 1_700_000_000_000,
          queueId: 420,
          teams: TEAMS,
          participants,
        },
      };
    }

    const lobby = [
      participant(),
      participant({ puuid: "ally-jg", participantId: 2, championId: 64, teamPosition: "JUNGLE" }),
      participant({ puuid: "enemy-jg", participantId: 6, championId: 121, teamId: 200, teamPosition: "JUNGLE", win: false }),
      participant({ puuid: "enemy-top", participantId: 7, championId: 86, teamId: 200, teamPosition: "TOP", win: false }),
    ];

    it("getMatchFull flattens participants (cs, items, control wards, position)", async () => {
      httpFetchMock.mockResolvedValue(res(200, matchDto(lobby)));
      const m = await getMatchFull(baseCfg, "EUW1_123");
      expect(urlOf()).toBe("https://europe.api.riotgames.com/lol/match/v5/matches/EUW1_123");
      expect(m.matchId).toBe("EUW1_123");
      expect(m.durationSec).toBe(1_800);
      expect(m.endTsMs).toBe(1_700_000_000_000);
      expect(m.queueId).toBe(420);
      expect(m.teams).toEqual(TEAMS);
      expect(m.participants).toHaveLength(4);
      expect(m.participants[0]).toEqual({
        puuid: "me",
        participantId: 1,
        championId: 266,
        teamId: 100,
        position: "TOP",
        win: true,
        kills: 5,
        deaths: 2,
        assists: 7,
        cs: 162, // lane minions + jungle camps
        goldEarned: 11_000,
        totalDamageDealtToChampions: 20_000,
        magicDamageDealtToChampions: 1_000,
        physicalDamageDealtToChampions: 18_000,
        totalDamageTaken: 25_000,
        damageDealtToObjectives: 5_000,
        visionScore: 22,
        wardsPlaced: 8,
        wardsKilled: 3,
        controlWardsBought: 2,
        champLevel: 16,
        items: [3071, 3053, 3047, 3340], // empty slots (0) dropped
        summoner1Id: 4,
        summoner2Id: 12,
        perks: { styles: [] },
      });
    });

    it("getMatch summarises the player's row and finds the lane opponent", async () => {
      httpFetchMock.mockResolvedValue(res(200, matchDto(lobby)));
      await expect(getMatch(baseCfg, "me", "EUW1_123")).resolves.toEqual({
        matchId: "EUW1_123",
        championId: 266,
        win: true,
        kills: 5,
        deaths: 2,
        assists: 7,
        cs: 162,
        durationSec: 1_800,
        gameEndTimestampMs: 1_700_000_000_000,
        queueId: 420,
        position: "TOP",
        opponentChampionId: 86, // enemy TOP, not the enemy jungler
        visionScore: 22,
        goldEarned: 11_000,
      });
    });

    it("getMatch reports opponent 0 when no enemy shares the player's position", async () => {
      httpFetchMock.mockResolvedValue(res(200, matchDto(lobby.slice(0, 3))));
      const s = await getMatch(baseCfg, "me", "EUW1_123");
      expect(s.opponentChampionId).toBe(0);
    });

    it("getMatch throws when the puuid did not play the match", async () => {
      httpFetchMock.mockResolvedValue(res(200, matchDto(lobby)));
      await expect(getMatch(baseCfg, "stranger", "EUW1_123")).rejects.toThrow(
        "PUUID not in match"
      );
    });

    it("getMatchTimeline maps participantId -> puuid and passes frames through", async () => {
      const frames = [
        {
          timestamp: 60_000,
          events: [{ type: "ITEM_PURCHASED", timestamp: 1_000, participantId: 1, itemId: 1055 }],
          participantFrames: {},
        },
      ];
      httpFetchMock.mockResolvedValue(
        res(200, {
          metadata: { matchId: "EUW1_123", participants: ["a", "b"] },
          info: {
            frames,
            participants: [
              { participantId: 1, puuid: "a" },
              { participantId: 2, puuid: "b" },
            ],
          },
        })
      );
      const t = await getMatchTimeline({ ...baseCfg, region: "kr" }, "KR_9");
      expect(urlOf()).toBe("https://asia.api.riotgames.com/lol/match/v5/matches/KR_9/timeline");
      expect(t).toEqual({ matchId: "EUW1_123", participantToPuuid: { 1: "a", 2: "b" }, frames });
    });
  });
});
