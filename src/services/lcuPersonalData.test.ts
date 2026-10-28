import { describe, it, expect, vi, beforeEach } from "vitest";

// lcuGet() goes through Tauri's invoke("lcu_get_json", { path }).
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import {
  inferPosition,
  lcuMasteries,
  lcuRank,
  lcuRecentMatches,
} from "./lcuPersonalData";

// Build a minimal participant shape matching the LCU response
function p(opts: {
  teamPosition?: string;
  smite?: boolean;
  jungleCS?: number;
  laneCS?: number;
  lane?: string;
  role?: string;
}) {
  const SMITE = 11;
  return {
    stats: {
      teamPosition: opts.teamPosition ?? "",
      neutralMinionsKilled: opts.jungleCS ?? 0,
      totalMinionsKilled: opts.laneCS ?? 0,
    },
    spell1Id: opts.smite ? SMITE : 4,
    spell2Id: 14,
    timeline: { lane: opts.lane, role: opts.role },
  } as never;
}

describe("inferPosition (Renekton-junglae bug regression)", () => {
  it("trusts teamPosition when present (modern matches)", () => {
    expect(inferPosition(p({ teamPosition: "TOP" }), 420)).toBe("TOP");
    expect(inferPosition(p({ teamPosition: "JUNGLE" }), 420)).toBe("JUNGLE");
    expect(inferPosition(p({ teamPosition: "MIDDLE" }), 420)).toBe("MIDDLE");
    expect(inferPosition(p({ teamPosition: "BOTTOM" }), 420)).toBe("BOTTOM");
    expect(inferPosition(p({ teamPosition: "UTILITY" }), 420)).toBe("UTILITY");
  });

  it("ARAM (queue 450) returns empty position", () => {
    expect(inferPosition(p({ teamPosition: "MIDDLE" }), 450)).toBe("");
  });

  it("smite override: legacy lane=JUNGLE but no smite is REJECTED (Renekton bug fix)", () => {
    // The original bug: LCU said lane=JUNGLE for a Renekton TOP game.
    // Without smite, we now refuse to classify as JUNGLE.
    expect(
      inferPosition(p({ lane: "JUNGLE", smite: false, laneCS: 180 }), 420)
    ).toBe("");
  });

  it("smite + jungle CS = JUNGLE (authoritative)", () => {
    expect(
      inferPosition(p({ smite: true, jungleCS: 80, laneCS: 30 }), 420)
    ).toBe("JUNGLE");
  });

  it("smite alone = JUNGLE intent (early game / smite player)", () => {
    expect(
      inferPosition(p({ smite: true, jungleCS: 10, laneCS: 20 }), 420)
    ).toBe("JUNGLE");
  });

  it("high jungle CS + low lane CS without smite = JUNGLE (off-meta)", () => {
    expect(
      inferPosition(p({ jungleCS: 60, laneCS: 40 }), 420)
    ).toBe("JUNGLE");
  });

  it("legacy lane fallback maps MID alias to MIDDLE", () => {
    expect(inferPosition(p({ lane: "MID", laneCS: 150 }), 420)).toBe("MIDDLE");
    expect(inferPosition(p({ lane: "MIDDLE", laneCS: 150 }), 420)).toBe("MIDDLE");
  });

  it("legacy lane=BOTTOM with role=DUO_SUPPORT → UTILITY", () => {
    expect(
      inferPosition(p({ lane: "BOTTOM", role: "DUO_SUPPORT", laneCS: 50 }), 420)
    ).toBe("UTILITY");
  });

  it("legacy lane=BOTTOM with role=DUO_CARRY → BOTTOM", () => {
    expect(
      inferPosition(p({ lane: "BOTTOM", role: "DUO_CARRY", laneCS: 200 }), 420)
    ).toBe("BOTTOM");
  });

  it("very low CS in both lane and jungle suggests UTILITY (support last-resort)", () => {
    expect(inferPosition(p({ laneCS: 30, jungleCS: 5 }), 420)).toBe("UTILITY");
  });

  it("returns empty string for unknowable cases (refuses to guess)", () => {
    expect(inferPosition(p({ lane: "NONE", laneCS: 100 }), 420)).toBe("");
  });
});

describe("inferPosition legacy lane fallbacks", () => {
  it("maps TOP and the BOT alias, and role=SUPPORT on bot lane to UTILITY", () => {
    expect(inferPosition(p({ lane: "TOP", laneCS: 150 }), 420)).toBe("TOP");
    expect(inferPosition(p({ lane: "BOT", role: "CARRY", laneCS: 220 }), 420)).toBe("BOTTOM");
    expect(inferPosition(p({ lane: "BOT", role: "SUPPORT", laneCS: 60 }), 420)).toBe("UTILITY");
  });
});

// ---- LCU fetchers -------------------------------------------------------

interface LcuPartOpts {
  pid?: number;
  champ: number;
  team: number;
  puuid?: string;
  pos?: string;
  win?: boolean;
  kills?: number;
  deaths?: number;
  assists?: number;
  cs?: number;
  jcs?: number;
  vision?: number;
  gold?: number;
}

function lp(o: LcuPartOpts) {
  return {
    ...(o.pid !== undefined ? { participantId: o.pid } : {}),
    ...(o.puuid !== undefined ? { puuid: o.puuid } : {}),
    championId: o.champ,
    teamId: o.team,
    spell1Id: 4,
    spell2Id: 14,
    stats: {
      win: o.win ?? false,
      kills: o.kills ?? 0,
      deaths: o.deaths ?? 0,
      assists: o.assists ?? 0,
      totalMinionsKilled: o.cs ?? 150,
      neutralMinionsKilled: o.jcs ?? 0,
      visionScore: o.vision,
      goldEarned: o.gold,
      teamPosition: o.pos,
    },
    timeline: { lane: "NONE", role: "NONE" },
  };
}

function game(
  gameId: number,
  gameCreation: number,
  queueId: number,
  participants: ReturnType<typeof lp>[],
  identities: Array<[number, string]> = []
) {
  return {
    gameId,
    gameDuration: 1800,
    gameCreation,
    queueId,
    participants,
    participantIdentities: identities.map(([participantId, puuid]) => ({
      participantId,
      player: { puuid },
    })),
  };
}

const history = (...games: ReturnType<typeof game>[]) => ({ games: { games } });

const SUMMONER = "/lol-summoner/v1/current-summoner";
const byPuuid = (count: number) =>
  `/lol-match-history/v1/products/lol/me/matches?begIndex=0&endIndex=${count}`;
const byCurrent = (count: number) =>
  `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${count}`;

/** Serve `routes[path]` for lcu_get_json; unknown paths reject like a 404. */
function routeLcu(routes: Record<string, unknown>) {
  invokeMock.mockImplementation(async (cmd: string, args: { path: string }) => {
    if (cmd !== "lcu_get_json") throw new Error(`unexpected command ${cmd}`);
    if (!(args.path in routes)) throw new Error("404");
    return routes[args.path];
  });
}

function requestedPaths(): string[] {
  return invokeMock.mock.calls.map((c) => (c[1] as { path: string }).path);
}

describe("lcuRecentMatches", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("merges both history endpoints newest-first and maps the local player's stats", async () => {
    const ranked = (kills: number) =>
      game(
        100,
        1_000_000,
        420,
        // pid 1 sits at index 1, so only the participantId match (not the
        // participants[pid - 1] index fallback) finds the local player.
        [
          lp({ pid: 2, champ: 64, team: 100, pos: "JUNGLE" }),
          lp({ pid: 1, champ: 103, team: 100, pos: "MIDDLE", win: true, kills, deaths: 2, assists: 9, cs: 180, jcs: 12, vision: 25, gold: 12000 }),
          lp({ pid: 6, champ: 238, team: 200, pos: "MIDDLE" }),
          lp({ pid: 7, champ: 86, team: 200, pos: "TOP" }),
        ],
        [[1, "me"], [6, "enemy"]]
      );
    // ARAM with an empty participantIdentities array: puuid found inline.
    const aram = game(200, 3_000_000, 450, [
      lp({ champ: 51, team: 100, puuid: "someone" }),
      lp({ champ: 222, team: 200, puuid: "me", kills: 10 }),
    ]);
    // Participants without participantId: identity index fallback (pid 2 -> [1]).
    const indexed = game(
      300,
      2_000_000,
      420,
      [
        lp({ champ: 1, team: 100, pos: "MIDDLE" }),
        lp({ champ: 99, team: 100, pos: "UTILITY", win: true }),
        lp({ champ: 412, team: 200, pos: "UTILITY" }),
      ],
      [[2, "me"]]
    );
    // Local player absent: game skipped.
    const foreign = game(400, 4_000_000, 420, [lp({ pid: 1, champ: 5, team: 100, pos: "TOP" })], [
      [1, "someone-else"],
    ]);
    routeLcu({
      [SUMMONER]: { puuid: "me" },
      [byPuuid(10)]: history(ranked(7), indexed),
      // Same gameId 100 again with different stats: the first copy wins.
      [byCurrent(10)]: history(ranked(99), aram, foreign),
    });

    const out = await lcuRecentMatches(10);

    expect(requestedPaths()).toEqual([SUMMONER, byPuuid(10), byCurrent(10)]);
    expect(invokeMock.mock.calls.every((c) => c[0] === "lcu_get_json")).toBe(true);
    expect(out.map((m) => m.matchId)).toEqual(["LCU_200", "LCU_300", "LCU_100"]);
    expect(out[0]).toMatchObject({
      championId: 222,
      kills: 10,
      queueId: 450,
      position: "",
      opponentChampionId: 0,
      visionScore: null,
      goldEarned: null,
    });
    expect(out[1]).toMatchObject({ championId: 99, win: true, position: "UTILITY", opponentChampionId: 412 });
    expect(out[2]).toEqual({
      matchId: "LCU_100",
      championId: 103,
      win: true,
      kills: 7,
      deaths: 2,
      assists: 9,
      cs: 192,
      durationSec: 1800,
      gameEndTimestampMs: 1_000_000 + 1800 * 1000,
      queueId: 420,
      position: "MIDDLE",
      opponentChampionId: 238,
      visionScore: 25,
      goldEarned: 12000,
    });
  });

  it("returns [] without fetching history when the current summoner has no puuid", async () => {
    routeLcu({ [SUMMONER]: {} });
    expect(await lcuRecentMatches()).toEqual([]);
    expect(requestedPaths()).toEqual([SUMMONER]);
  });

  it("returns [] when neither history endpoint has games", async () => {
    routeLcu({ [SUMMONER]: { puuid: "me" }, [byPuuid(50)]: { games: {} } });
    expect(await lcuRecentMatches()).toEqual([]);
    expect(requestedPaths()).toContain(byCurrent(50));
  });

  it("returns [] outside Tauri without invoking", async () => {
    const g = globalThis as Record<string, unknown>;
    delete g.__TAURI_INTERNALS__;
    try {
      expect(await lcuRecentMatches()).toEqual([]);
      expect(invokeMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
        value: undefined,
        writable: true,
        configurable: true,
      });
    }
  });
});

describe("lcuMasteries", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("maps LCU mastery entries to the Riot DTO shape", async () => {
    routeLcu({
      "/lol-champion-mastery/v1/local-player/champion-mastery": [
        { championId: 103, championLevel: 7, championPoints: 250_000, lastPlayTime: 1_700_000_000_000, tokensEarned: 0, puuid: "me" },
      ],
    });
    expect(await lcuMasteries()).toEqual([
      { championId: 103, championLevel: 7, championPoints: 250_000, lastPlayTime: 1_700_000_000_000 },
    ]);
  });

  it("returns [] when the LCU call fails", async () => {
    invokeMock.mockRejectedValue(new Error("client closed"));
    expect(await lcuMasteries()).toEqual([]);
  });
});

describe("lcuRank", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });
  const RANKED = "/lol-ranked/v1/current-ranked-stats";
  const queue = (queueType: string, tier: string) => ({
    queueType,
    tier,
    division: "II",
    leaguePoints: 57,
    wins: 40,
    losses: 35,
    hotStreak: true,
    miniSeriesProgress: "",
  });

  it("returns the solo/duo queue entry, ignoring flex", async () => {
    routeLcu({ [RANKED]: { queues: [queue("RANKED_FLEX_SR", "SILVER"), queue("RANKED_SOLO_5x5", "GOLD")] } });
    expect(await lcuRank()).toEqual({
      tier: "GOLD",
      division: "II",
      leaguePoints: 57,
      wins: 40,
      losses: 35,
      hotStreak: true,
    });
  });

  it("returns null when there is no solo queue entry", async () => {
    routeLcu({ [RANKED]: { queues: [queue("RANKED_FLEX_SR", "SILVER")] } });
    expect(await lcuRank()).toBeNull();
  });

  it("returns null when the LCU returns nothing", async () => {
    invokeMock.mockResolvedValue(null);
    expect(await lcuRank()).toBeNull();
  });
});
