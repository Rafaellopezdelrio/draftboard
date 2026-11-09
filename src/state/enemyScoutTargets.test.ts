// enemyScoutTargets: pure spectator extractor + the once-per-game refresher.
// riotApi.getCurrentGameByPuuid and settingsRepo.loadSettings are mocked; the
// draft store is real (reset between tests).
//   - enemyTargetsFromSpectator: side by teamId, bots / invalid PUUIDs dropped,
//     champ <= 0 -> null, non-two-team games (Arena) -> []
//   - refreshEnemyScoutTargets(gameId, gameMode): encrypted cfg.puuid from
//     settings, skip modes, one call in flight, 12 tries per game, stale /
//     mismatched answers dropped, resolved even with [] (bots), new gameId
//     clears the previous targets
//   - resetEnemyScoutTargets clears the store and the per-game memo

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CurrentGameInfo, CurrentGameParticipant } from "../services/riotApi";

const getCurrentGameByPuuid = vi.hoisted(() => vi.fn());
vi.mock("../services/riotApi", () => ({ getCurrentGameByPuuid }));

const loadSettings = vi.hoisted(() => vi.fn());
vi.mock("../services/settingsRepo", () => ({ loadSettings }));

import {
  enemyTargetsFromSpectator,
  isRandomPickScout,
  refreshEnemyScoutTargets,
  resetEnemyScoutTargets,
} from "./enemyScoutTargets";
import { useDraftStore } from "./draftStore";

// Real-looking 78-char PUUIDs (url-safe base64 alphabet).
const pu = (tag: string) => tag.padEnd(78, "x");
const ME = pu("me");
const CFG = { apiKey: "RGAPI-test", region: "euw1", puuid: ME };

function participant(
  puuid: string,
  teamId: number,
  championId: number,
  bot?: boolean
): CurrentGameParticipant {
  return { puuid, teamId, championId, spell1Id: 4, spell2Id: 14, ...(bot ? { bot } : {}) };
}

function game(participants: CurrentGameParticipant[], gameId = 1): CurrentGameInfo {
  return {
    gameId,
    gameStartTime: 0,
    gameLength: 0,
    gameMode: "CLASSIC",
    gameType: "MATCHED_GAME",
    gameQueueConfigId: 420,
    mapId: 11,
    participants,
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const targets = () => useDraftStore.getState().enemyScoutTargets;

describe("enemyTargetsFromSpectator", () => {
  it("returns the other team when I am on blue (100)", () => {
    const g = game([
      participant(ME, 100, 222),
      participant(pu("ally"), 100, 64),
      participant(pu("opp1"), 200, 122),
      participant(pu("opp2"), 200, 103),
    ]);
    expect(enemyTargetsFromSpectator(g, ME)).toMatchObject([
      { puuid: pu("opp1"), championId: 122 },
      { puuid: pu("opp2"), championId: 103 },
    ]);
  });

  it("returns the other team when I am on red (200)", () => {
    const g = game([
      participant(pu("opp1"), 100, 122),
      participant(ME, 200, 222),
      participant(pu("ally"), 200, 64),
    ]);
    expect(enemyTargetsFromSpectator(g, ME)).toMatchObject([{ puuid: pu("opp1"), championId: 122 }]);
  });

  it("returns [] when I am not in the game", () => {
    const g = game([participant(pu("a"), 100, 1), participant(pu("b"), 200, 2)]);
    expect(enemyTargetsFromSpectator(g, ME)).toMatchObject([]);
  });

  it("returns [] for null/undefined game or missing participants", () => {
    expect(enemyTargetsFromSpectator(null, ME)).toMatchObject([]);
    expect(enemyTargetsFromSpectator(undefined, ME)).toMatchObject([]);
    expect(
      enemyTargetsFromSpectator({ ...game([]), participants: undefined } as unknown as CurrentGameInfo, ME)
    ).toMatchObject([]);
  });

  it("returns [] for Arena-style games with more than two teams", () => {
    const g = game([
      participant(ME, 100, 222),
      participant(pu("duo"), 100, 64),
      participant(pu("t2a"), 200, 122),
      participant(pu("t2b"), 200, 103),
      participant(pu("t3a"), 300, 1),
      participant(pu("t3b"), 300, 2),
    ]);
    expect(enemyTargetsFromSpectator(g, ME)).toMatchObject([]);
  });

  it("returns [] when everyone is on my team (single teamId)", () => {
    const g = game([participant(ME, 100, 222), participant(pu("a"), 100, 1)]);
    expect(enemyTargetsFromSpectator(g, ME)).toMatchObject([]);
  });

  it("drops bot participants even when their puuid looks valid", () => {
    const g = game([
      participant(ME, 100, 222),
      participant(pu("bot1"), 200, 1, true),
      participant("", 200, 2, true),
      participant(pu("human"), 200, 3),
    ]);
    expect(enemyTargetsFromSpectator(g, ME)).toMatchObject([{ puuid: pu("human"), championId: 3 }]);
  });

  it("drops enemies with empty, short, client-format or non-url-safe PUUIDs", () => {
    const g = game([
      participant(ME, 100, 222),
      participant("", 200, 1),
      participant("short", 200, 2),
      participant(pu("bad+chars/"), 200, 3),
      participant("0f5c2a9e-1111-2222-3333-444455556666", 200, 5),
      participant(pu("ok"), 200, 4),
    ]);
    expect(enemyTargetsFromSpectator(g, ME)).toMatchObject([{ puuid: pu("ok"), championId: 4 }]);
  });

  it("maps championId <= 0 to null", () => {
    const g = game([
      participant(ME, 100, 222),
      participant(pu("zero"), 200, 0),
      participant(pu("neg"), 200, -1),
    ]);
    expect(enemyTargetsFromSpectator(g, ME)).toMatchObject([
      { puuid: pu("zero"), championId: null },
      { puuid: pu("neg"), championId: null },
    ]);
  });

  it("flags the enemy running Smite (in either spell slot) as the jungler", () => {
    const g = game([
      participant(ME, 100, 222),
      { ...participant(pu("jg"), 200, 64), spell1Id: 11, spell2Id: 4 },
      { ...participant(pu("jg2"), 200, 120), spell1Id: 4, spell2Id: 11 },
      participant(pu("top"), 200, 122),
    ]);
    expect(enemyTargetsFromSpectator(g, ME).map((t) => [t.championId, t.hasSmite])).toEqual([
      [64, true],
      [120, true],
      [122, false],
    ]);
  });
});

describe("refreshEnemyScoutTargets", () => {
  const spectatorGame = game([
    participant(ME, 100, 222),
    participant(pu("sp1"), 200, 122),
    participant(pu("sp2"), 200, 103),
  ]);
  const spectatorTargets = [
    { puuid: pu("sp1"), championId: 122, hasSmite: false },
    { puuid: pu("sp2"), championId: 103, hasSmite: false },
  ];

  beforeEach(() => {
    getCurrentGameByPuuid.mockReset();
    loadSettings.mockReset();
    loadSettings.mockResolvedValue(CFG);
    resetEnemyScoutTargets();
  });

  it("calls spectator with the encrypted cfg.puuid and stores the enemy team", async () => {
    getCurrentGameByPuuid.mockResolvedValue(spectatorGame);
    await refreshEnemyScoutTargets(1, "CLASSIC");
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(1);
    expect(getCurrentGameByPuuid).toHaveBeenCalledWith(CFG, ME);
    expect(targets()).toEqual(spectatorTargets);
  });

  it("flags ARAM targets as random-pick, and a reset clears the flag", async () => {
    getCurrentGameByPuuid.mockResolvedValue({ ...spectatorGame, gameMode: "ARAM" });
    await refreshEnemyScoutTargets(1, "ARAM");
    expect(targets()).toEqual(spectatorTargets);
    expect(isRandomPickScout()).toBe(true);
    resetEnemyScoutTargets();
    expect(isRandomPickScout()).toBe(false);
  });

  it("does not flag Summoner's Rift targets as random-pick", async () => {
    getCurrentGameByPuuid.mockResolvedValue(spectatorGame);
    await refreshEnemyScoutTargets(1, "CLASSIC");
    expect(isRandomPickScout()).toBe(false);
  });

  it("detects my side from cfg.puuid (me on red -> blue team is the enemy)", async () => {
    getCurrentGameByPuuid.mockResolvedValue(
      game([
        participant(pu("blue1"), 100, 10),
        participant(pu("blue2"), 100, 11),
        participant(pu("ally"), 200, 64),
        participant(ME, 200, 222),
      ])
    );
    await refreshEnemyScoutTargets(1);
    expect(targets()).toMatchObject([
      { puuid: pu("blue1"), championId: 10 },
      { puuid: pu("blue2"), championId: 11 },
    ]);
  });

  it("settles after a success: no further loadSettings / spectator calls for that game", async () => {
    getCurrentGameByPuuid.mockResolvedValueOnce(null).mockResolvedValue(spectatorGame);
    await refreshEnemyScoutTargets(1);
    expect(targets()).toMatchObject([]);

    await refreshEnemyScoutTargets(1);
    expect(targets()).toEqual(spectatorTargets);

    await refreshEnemyScoutTargets(1);
    await refreshEnemyScoutTargets(1);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(2);
    expect(loadSettings).toHaveBeenCalledTimes(2);
    expect(targets()).toEqual(spectatorTargets);
  });

  it("resolves with [] for a bots game and stops polling", async () => {
    getCurrentGameByPuuid.mockResolvedValue(
      game([
        participant(ME, 100, 222),
        participant("", 200, 1, true),
        participant("", 200, 2, true),
      ])
    );
    await refreshEnemyScoutTargets(1, "CLASSIC");
    expect(targets()).toMatchObject([]);
    for (let i = 0; i < 5; i++) await refreshEnemyScoutTargets(1, "CLASSIC");
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(1);
    expect(loadSettings).toHaveBeenCalledTimes(1);
  });

  it("resolves with [] for an Arena game and stops polling", async () => {
    getCurrentGameByPuuid.mockResolvedValue(
      game([
        participant(ME, 100, 222),
        participant(pu("t2"), 200, 1),
        participant(pu("t3"), 300, 2),
      ])
    );
    await refreshEnemyScoutTargets(1, "CHERRY");
    await refreshEnemyScoutTargets(1, "CHERRY");
    expect(targets()).toMatchObject([]);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(1);
  });

  it.each(["PRACTICETOOL", "TFT", "practicetool"])(
    "skip mode %s: resolved without loading settings or calling spectator",
    async (mode) => {
      getCurrentGameByPuuid.mockResolvedValue(spectatorGame);
      await refreshEnemyScoutTargets(1, mode);
      await refreshEnemyScoutTargets(1, mode);
      // Resolved: even a later tick without the mode does not call.
      await refreshEnemyScoutTargets(1);
      expect(loadSettings).not.toHaveBeenCalled();
      expect(getCurrentGameByPuuid).not.toHaveBeenCalled();
      expect(targets()).toMatchObject([]);
    }
  );

  it("missing cfg.puuid: zero spectator calls, and a Riot ID saved mid-game is picked up", async () => {
    loadSettings.mockResolvedValue({ apiKey: "RGAPI-test", region: "euw1" });
    await refreshEnemyScoutTargets(1);
    await refreshEnemyScoutTargets(1);
    expect(loadSettings).toHaveBeenCalledTimes(2);
    expect(getCurrentGameByPuuid).not.toHaveBeenCalled();
    expect(targets()).toMatchObject([]);
    // User saves their Riot ID in Settings during the game.
    loadSettings.mockResolvedValue(CFG);
    getCurrentGameByPuuid.mockResolvedValue(spectatorGame);
    await refreshEnemyScoutTargets(1);
    expect(getCurrentGameByPuuid).toHaveBeenCalledWith(CFG, ME);
    expect(targets().length).toBeGreaterThan(0);
  });

  it("no settings at all: zero spectator calls, each try counts toward the cap", async () => {
    loadSettings.mockResolvedValue(null);
    for (let i = 0; i < 15; i++) await refreshEnemyScoutTargets(1);
    expect(loadSettings).toHaveBeenCalledTimes(12);
    expect(getCurrentGameByPuuid).not.toHaveBeenCalled();
  });

  it("spectator 404 (null) is retried on the next tick", async () => {
    getCurrentGameByPuuid.mockResolvedValue(null);
    await refreshEnemyScoutTargets(1);
    await refreshEnemyScoutTargets(1);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(2);
    expect(targets()).toMatchObject([]);
  });

  it("spectator throwing never rejects and is retried next tick", async () => {
    getCurrentGameByPuuid.mockRejectedValueOnce(new Error("429")).mockResolvedValue(spectatorGame);
    await expect(refreshEnemyScoutTargets(1)).resolves.toBeUndefined();
    expect(targets()).toMatchObject([]);
    await refreshEnemyScoutTargets(1);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(2);
    expect(targets()).toEqual(spectatorTargets);
  });

  it("loadSettings throwing is swallowed and retried", async () => {
    loadSettings.mockRejectedValueOnce(new Error("db locked")).mockResolvedValue(CFG);
    getCurrentGameByPuuid.mockResolvedValue(spectatorGame);
    await expect(refreshEnemyScoutTargets(1)).resolves.toBeUndefined();
    expect(getCurrentGameByPuuid).not.toHaveBeenCalled();
    await refreshEnemyScoutTargets(1);
    expect(targets()).toEqual(spectatorTargets);
  });

  it("a spectator game without me is ignored and retried", async () => {
    getCurrentGameByPuuid.mockResolvedValue(
      game([participant(pu("x"), 100, 1), participant(pu("y"), 200, 2)])
    );
    await refreshEnemyScoutTargets(1);
    await refreshEnemyScoutTargets(1);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(2);
    expect(targets()).toMatchObject([]);
  });

  it("ignores a spectator game whose gameId does not match, then accepts the right one", async () => {
    getCurrentGameByPuuid
      .mockResolvedValueOnce({ ...spectatorGame, gameId: 99 })
      .mockResolvedValue(spectatorGame);
    await refreshEnemyScoutTargets(1);
    expect(targets()).toMatchObject([]);
    await refreshEnemyScoutTargets(1);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(2);
    expect(targets()).toEqual(spectatorTargets);
  });

  it("with an undefined gameId, accepts whatever game spectator returns", async () => {
    getCurrentGameByPuuid.mockResolvedValue({ ...spectatorGame, gameId: 99 });
    await refreshEnemyScoutTargets(undefined);
    expect(targets()).toEqual(spectatorTargets);
  });

  it("keeps one request in flight: a second call while pending makes no extra request", async () => {
    const d = deferred<CurrentGameInfo | null>();
    getCurrentGameByPuuid.mockReturnValueOnce(d.promise).mockResolvedValue(spectatorGame);

    const first = refreshEnemyScoutTargets(1);
    await refreshEnemyScoutTargets(1);
    await refreshEnemyScoutTargets(1);
    expect(loadSettings).toHaveBeenCalledTimes(1);

    d.resolve(spectatorGame);
    await first;
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(1);
    expect(targets()).toEqual(spectatorTargets);
  });

  it("calls made while one is in flight do not burn tries", async () => {
    getCurrentGameByPuuid.mockResolvedValue(null);
    for (let i = 0; i < 11; i++) await refreshEnemyScoutTargets(1);
    const d = deferred<CurrentGameInfo | null>();
    getCurrentGameByPuuid.mockReturnValueOnce(d.promise);
    const twelfth = refreshEnemyScoutTargets(1);
    await refreshEnemyScoutTargets(1); // deduped
    d.resolve(spectatorGame);
    await twelfth;
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(12);
    expect(targets()).toEqual(spectatorTargets);
  });

  it("drops an answer that lands after a reset and leaves the game unresolved", async () => {
    const d = deferred<CurrentGameInfo | null>();
    getCurrentGameByPuuid.mockReturnValueOnce(d.promise).mockResolvedValue(null);

    const pending = refreshEnemyScoutTargets(1);
    resetEnemyScoutTargets();
    d.resolve(spectatorGame);
    await pending;
    expect(targets()).toMatchObject([]);

    // Not marked resolved: the next tick asks spectator again.
    await refreshEnemyScoutTargets(1);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(2);
  });

  it("drops the previous game's answer when a new gameId arrives mid-request", async () => {
    const d = deferred<CurrentGameInfo | null>();
    const game2 = game(
      [participant(ME, 100, 222), participant(pu("g2"), 200, 55)],
      2
    );
    getCurrentGameByPuuid.mockReturnValueOnce(d.promise).mockResolvedValue(game2);

    const pending = refreshEnemyScoutTargets(1);
    // New game while game 1's request is pending: deduped (still in flight).
    await refreshEnemyScoutTargets(2);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(1);

    d.resolve(spectatorGame);
    await pending;
    expect(targets()).toMatchObject([]);

    // Game 2 is not resolved by game 1's answer: the next tick asks again.
    await refreshEnemyScoutTargets(2);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(2);
    expect(targets()).toMatchObject([{ puuid: pu("g2"), championId: 55 }]);
  });

  // resetEnemyScoutTargets() is documented as also covering an account switch.
  // Regression: staleness used to compare gameIds only, so a reset followed by
  // a tick for the SAME gameId while the old request was pending accepted the
  // old answer. A generation counter bumped by reset now drops it.
  it("drops an answer when a reset happened during the await, even if the same gameId comes back", async () => {
    const d = deferred<CurrentGameInfo | null>();
    getCurrentGameByPuuid.mockReturnValueOnce(d.promise).mockResolvedValue(null);

    const pending = refreshEnemyScoutTargets(1);
    resetEnemyScoutTargets();
    await refreshEnemyScoutTargets(1); // deduped, but re-arms lastGameId = 1
    d.resolve(spectatorGame);
    await pending;
    expect(targets()).toMatchObject([]);
  });

  it("stops calling spectator after 12 tries for the same gameId", async () => {
    getCurrentGameByPuuid.mockResolvedValue(null);
    for (let i = 0; i < 15; i++) await refreshEnemyScoutTargets(1);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(12);
    expect(loadSettings).toHaveBeenCalledTimes(12);
    expect(targets()).toMatchObject([]);
  });

  it("errors count toward the 12-try cap too", async () => {
    getCurrentGameByPuuid.mockRejectedValue(new Error("503"));
    for (let i = 0; i < 15; i++) await refreshEnemyScoutTargets(1);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(12);
  });

  it("a new gameId resets the try counter", async () => {
    getCurrentGameByPuuid.mockResolvedValue(null);
    for (let i = 0; i < 12; i++) await refreshEnemyScoutTargets(1);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(12);

    await refreshEnemyScoutTargets(2);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(13);
  });

  it("a new gameId clears the previous game's targets and resolves again", async () => {
    getCurrentGameByPuuid.mockResolvedValueOnce(spectatorGame).mockResolvedValue(null);
    await refreshEnemyScoutTargets(1);
    expect(targets()).toEqual(spectatorTargets);

    // Spectator has nothing yet for game 2: last game's enemies must not stay.
    await refreshEnemyScoutTargets(2);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(2);
    expect(targets()).toMatchObject([]);
  });

  it("a new gameId in a skip mode also clears the previous targets", async () => {
    getCurrentGameByPuuid.mockResolvedValue(spectatorGame);
    await refreshEnemyScoutTargets(1);
    expect(targets()).toEqual(spectatorTargets);

    await refreshEnemyScoutTargets(2, "TFT");
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(1);
    expect(targets()).toMatchObject([]);
  });

  it("an undefined gameId keeps the current game's memo and targets", async () => {
    getCurrentGameByPuuid.mockResolvedValue(spectatorGame);
    await refreshEnemyScoutTargets(1);
    await refreshEnemyScoutTargets(undefined);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(1);
    expect(targets()).toEqual(spectatorTargets);
  });

  it("an undefined gameId keeps the current game's try counter", async () => {
    getCurrentGameByPuuid.mockResolvedValue(null);
    for (let i = 0; i < 12; i++) await refreshEnemyScoutTargets(1);
    await refreshEnemyScoutTargets(undefined);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(12);
  });
});

describe("resetEnemyScoutTargets", () => {
  beforeEach(() => {
    getCurrentGameByPuuid.mockReset();
    loadSettings.mockReset();
    loadSettings.mockResolvedValue(CFG);
    resetEnemyScoutTargets();
  });

  it("clears the store", () => {
    useDraftStore.getState().setEnemyScoutTargets([{ puuid: pu("a"), championId: 1 }]);
    resetEnemyScoutTargets();
    expect(targets()).toMatchObject([]);
  });

  it("clears the per-game memo so the same gameId is resolved again", async () => {
    const g = game([participant(ME, 100, 222), participant(pu("sp1"), 200, 122)], 5);
    getCurrentGameByPuuid.mockResolvedValue(g);
    resetEnemyScoutTargets();
    await refreshEnemyScoutTargets(5);
    await refreshEnemyScoutTargets(5);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(1);

    resetEnemyScoutTargets();
    expect(targets()).toMatchObject([]);
    await refreshEnemyScoutTargets(5);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(2);
    expect(targets()).toMatchObject([{ puuid: pu("sp1"), championId: 122 }]);
  });

  it("clears the try counter", async () => {
    getCurrentGameByPuuid.mockResolvedValue(null);
    for (let i = 0; i < 12; i++) await refreshEnemyScoutTargets(5);
    resetEnemyScoutTargets();
    await refreshEnemyScoutTargets(5);
    expect(getCurrentGameByPuuid).toHaveBeenCalledTimes(13);
  });
});
