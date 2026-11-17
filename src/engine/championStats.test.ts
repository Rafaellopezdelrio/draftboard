import { describe, it, expect } from "vitest";
import { championLines, opponentLines, pickGames, seasonsIn, kdaRatio, QUEUE_GROUPS } from "./championStats";
import type { MatchRow } from "../services/matchRepo";

const at = (y: number, mo = 5) => new Date(y, mo, 10, 20, 0).getTime();

const match = (over: Partial<MatchRow> = {}): MatchRow => ({
  matchId: `m${Math.random()}`,
  championId: 59,
  win: true,
  kills: 10,
  deaths: 5,
  assists: 10,
  cs: 180,
  durationSec: 30 * 60,
  gameEndTimestampMs: at(2026),
  queueId: 420,
  position: "JUNGLE",
  opponentChampionId: 64,
  visionScore: 30,
  goldEarned: 12000,
  ...over,
});

describe("championLines", () => {
  it("adds up each champion and the total, most played first", () => {
    const { total, champions } = championLines([
      match(),
      match({ win: false, kills: 2, deaths: 7, assists: 4 }),
      match({ championId: 254 }),
    ]);
    expect(total.games).toBe(3);
    expect(total.wins).toBe(2);
    expect(champions.map((c) => c.championId)).toEqual([59, 254]);
    const jarvan = champions[0];
    expect(jarvan).toMatchObject({ games: 2, wins: 1, kills: 12, deaths: 12, assists: 14, cs: 360, minutes: 60 });
    expect(kdaRatio(jarvan)).toBeCloseTo(26 / 12);
  });

  it("same games played: better win rate first", () => {
    const { champions } = championLines([match({ championId: 1, win: false }), match({ championId: 2 })]);
    expect(champions.map((c) => c.championId)).toEqual([2, 1]);
  });

  it("gold and vision count only the games that have them", () => {
    const { total } = championLines([match(), match({ goldEarned: null, visionScore: null })]);
    expect(total).toMatchObject({ gold: 12000, goldGames: 1, goldMinutes: 30, vision: 30, visionGames: 1 });
  });

  it("no deaths: KDA is perfect (null), not infinity", () => {
    expect(kdaRatio(championLines([match({ deaths: 0 })]).total)).toBeNull();
  });
});

describe("opponentLines", () => {
  it("splits one champion by lane opponent, skipping games without one", () => {
    const lines = opponentLines(
      [
        match({ opponentChampionId: 64 }),
        match({ opponentChampionId: 64, win: false }),
        match({ opponentChampionId: 0 }),
        match({ opponentChampionId: 11 }),
        match({ championId: 254, opponentChampionId: 64 }),
      ],
      59
    );
    expect(lines.map((l) => [l.championId, l.games, l.wins])).toEqual([
      [64, 2, 1],
      [11, 1, 1],
    ]);
  });
});

describe("pickGames / seasonsIn", () => {
  const games = [
    match({ queueId: 420, gameEndTimestampMs: at(2026) }),
    match({ queueId: 440, gameEndTimestampMs: at(2025) }),
    match({ queueId: 700, gameEndTimestampMs: at(2026) }),
    match({ queueId: 450, gameEndTimestampMs: at(2026) }), // ARAM: never counted
    match({ queueId: 1750, gameEndTimestampMs: at(2024) }), // Arena: never counted
  ];
  it("ranked group = Solo/Duo + Flex + Clash", () => {
    expect(pickGames(games, QUEUE_GROUPS.ranked, null).map((m) => m.queueId)).toEqual([420, 440, 700]);
    expect(pickGames(games, QUEUE_GROUPS.clash, null).map((m) => m.queueId)).toEqual([700]);
  });
  it("season = calendar year of the game", () => {
    expect(pickGames(games, QUEUE_GROUPS.ranked, 2026).map((m) => m.queueId)).toEqual([420, 700]);
    expect(seasonsIn(games, QUEUE_GROUPS.ranked)).toEqual([2026, 2025]);
    expect(seasonsIn(games, QUEUE_GROUPS.flex)).toEqual([2025]);
  });
});
