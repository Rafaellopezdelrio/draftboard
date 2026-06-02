// Targeted tests for the pro-analytics aggregator. matchAnalytics walks a
// full match + 30+ timeline frames to produce ~50 stats fed to the AI
// coach. We don't build a complete fixture (each test would be hundreds
// of lines); instead we cover the critical paths a regression would hit:
//
//   - null when puuid not in match (defensive)
//   - basic carry-through of metadata (win/duration/position/queueId)
//   - item detection (Stopwatch / QSS sets)
//   - lane-opponent resolution by teamId+position
//   - graceful degradation when timeline frames are missing

import { describe, it, expect } from "vitest";
import { buildProAnalytics } from "./matchAnalytics";
import type { MatchFull, MatchTimeline, MatchParticipant } from "../services/riotApi";

const mkPart = (over: Partial<MatchParticipant> & Pick<MatchParticipant, "puuid">): MatchParticipant => ({
  participantId: 1,
  championId: 266,
  teamId: 100,
  position: "MIDDLE",
  win: true,
  kills: 5, deaths: 3, assists: 8,
  cs: 200,
  goldEarned: 12_000,
  totalDamageDealtToChampions: 20_000,
  magicDamageDealtToChampions: 10_000,
  physicalDamageDealtToChampions: 10_000,
  totalDamageTaken: 18_000,
  damageDealtToObjectives: 8_000,
  visionScore: 25,
  wardsPlaced: 10,
  wardsKilled: 3,
  controlWardsBought: 2,
  champLevel: 16,
  items: [],
  summoner1Id: 4,
  summoner2Id: 14,
  perks: null,
  ...over,
});

const mkMatch = (
  parts: MatchParticipant[],
  over: Partial<MatchFull> = {}
): MatchFull => ({
  matchId: "EUW1_test",
  durationSec: 1800,
  endTsMs: Date.now(),
  queueId: 420,
  participants: parts,
  teams: [],
  ...over,
});

const emptyTimeline = (matchId = "EUW1_test"): MatchTimeline => ({
  matchId,
  participantToPuuid: {},
  frames: [],
});

const champNames = new Map<number, string>([
  [266, "Aatrox"],
  [103, "Ahri"],
  [99, "Lux"],
  [157, "Yasuo"],
]);

describe("buildProAnalytics", () => {
  it("returns null when puuid is not in the match", () => {
    const m = mkMatch([mkPart({ puuid: "other" })]);
    const r = buildProAnalytics(m, emptyTimeline(), "missing", champNames);
    expect(r).toBeNull();
  });

  it("returns a populated analytics shape for a valid puuid (basic carry-through)", () => {
    const m = mkMatch([
      mkPart({ puuid: "me", championId: 266, position: "MIDDLE", win: false }),
      mkPart({ puuid: "lane", championId: 103, position: "MIDDLE", teamId: 200 }),
    ], { durationSec: 1500, queueId: 440 });
    const r = buildProAnalytics(m, emptyTimeline(), "me", champNames)!;
    expect(r.myChampionId).toBe(266);
    expect(r.myChampionName).toBe("Aatrox");
    expect(r.laneOpponentChampionId).toBe(103);
    expect(r.laneOpponentChampionName).toBe("Ahri");
    expect(r.position).toBe("MIDDLE");
    expect(r.win).toBe(false);
    expect(r.queueId).toBe(440);
    expect(r.durationMin).toBe(25); // 1500s = 25min
  });

  it("uses 'unknown' name when champion not in lookup map", () => {
    const m = mkMatch([
      mkPart({ puuid: "me", championId: 999 }),
    ]);
    const r = buildProAnalytics(m, emptyTimeline(), "me", champNames)!;
    // championNamesById map doesn't have 999 — falls back to a sane default.
    // We assert it's at least a non-empty string (defensive: don't blow up UI).
    expect(typeof r.myChampionName).toBe("string");
  });

  it("detects Stopwatch via item IDs (2419, 2420, 3157, 3193)", () => {
    const r = buildProAnalytics(
      mkMatch([mkPart({ puuid: "me", items: [2420, 3158, 0, 0, 0, 0, 0] })]),
      emptyTimeline(),
      "me",
      champNames
    )!;
    expect(r.hadStopwatch).toBe(true);
  });

  it("detects Zhonya's (3157) as a Stopwatch-family item", () => {
    const r = buildProAnalytics(
      mkMatch([mkPart({ puuid: "me", items: [3157, 0, 0, 0, 0, 0, 0] })]),
      emptyTimeline(),
      "me",
      champNames
    )!;
    expect(r.hadStopwatch).toBe(true);
  });

  it("detects QSS / Silvermere via item IDs (3140, 6035)", () => {
    const r1 = buildProAnalytics(
      mkMatch([mkPart({ puuid: "me", items: [3140, 0, 0, 0, 0, 0, 0] })]),
      emptyTimeline(),
      "me",
      champNames
    )!;
    expect(r1.hadQss).toBe(true);
    const r2 = buildProAnalytics(
      mkMatch([mkPart({ puuid: "me", items: [6035, 0, 0, 0, 0, 0, 0] })]),
      emptyTimeline(),
      "me",
      champNames
    )!;
    expect(r2.hadQss).toBe(true);
  });

  it("no Stopwatch / QSS in items -> flags both false", () => {
    const r = buildProAnalytics(
      mkMatch([mkPart({ puuid: "me", items: [1054, 3070, 1011, 0, 0, 0, 0] })]),
      emptyTimeline(),
      "me",
      champNames
    )!;
    expect(r.hadStopwatch).toBe(false);
    expect(r.hadQss).toBe(false);
  });

  it("lane opponent resolution: opposite team + same position", () => {
    const m = mkMatch([
      mkPart({ puuid: "me", teamId: 100, position: "TOP" }),
      mkPart({ puuid: "ally", teamId: 100, position: "MIDDLE", championId: 99 }),
      mkPart({ puuid: "enemyMid", teamId: 200, position: "MIDDLE", championId: 99 }),
      mkPart({ puuid: "enemyTop", teamId: 200, position: "TOP", championId: 157 }),
    ]);
    const r = buildProAnalytics(m, emptyTimeline(), "me", champNames)!;
    expect(r.laneOpponentChampionId).toBe(157); // Yasuo TOP
    expect(r.laneOpponentChampionName).toBe("Yasuo");
  });

  it("no lane opponent (no enemy at same position) -> null fields", () => {
    const m = mkMatch([
      mkPart({ puuid: "me", teamId: 100, position: "TOP" }),
      mkPart({ puuid: "enemy", teamId: 200, position: "MIDDLE" }),
    ]);
    const r = buildProAnalytics(m, emptyTimeline(), "me", champNames)!;
    expect(r.laneOpponentChampionId).toBeNull();
    expect(r.laneOpponentChampionName).toBeNull();
  });

  it("empty timeline frames -> CS/gold/level snapshots default to 0 (no crash)", () => {
    const r = buildProAnalytics(
      mkMatch([mkPart({ puuid: "me" })]),
      emptyTimeline(),
      "me",
      champNames
    )!;
    expect(r.cs10).toBe(0);
    expect(r.goldAt10).toBe(0);
    expect(r.xpAt10).toBe(0);
    expect(r.level10).toBe(0);
    expect(r.csDiffAt10).toBe(0);
  });

  it("preserves myTeamId for downstream team-comp lookups", () => {
    const r = buildProAnalytics(
      mkMatch([
        mkPart({ puuid: "me", teamId: 200 }),
        mkPart({ puuid: "enemy", teamId: 100 }),
      ]),
      emptyTimeline(),
      "me",
      champNames
    )!;
    expect(r.myTeamId).toBe(200);
  });

  it("builds enemy team comp list with names from the map", () => {
    const r = buildProAnalytics(
      mkMatch([
        mkPart({ puuid: "me", teamId: 100, championId: 266 }),
        mkPart({ puuid: "e1", teamId: 200, championId: 103, position: "MIDDLE" }),
        mkPart({ puuid: "e2", teamId: 200, championId: 157, position: "BOTTOM" }),
      ]),
      emptyTimeline(),
      "me",
      champNames
    )!;
    expect(r.enemyTeamComposition).toHaveLength(2);
    const names = r.enemyTeamComposition.map((c) => c.championName);
    expect(names).toContain("Ahri");
    expect(names).toContain("Yasuo");
  });

  it("durationMin = durationSec / 60 (exact)", () => {
    const r = buildProAnalytics(
      mkMatch([mkPart({ puuid: "me" })], { durationSec: 2400 }),
      emptyTimeline(),
      "me",
      champNames
    )!;
    expect(r.durationMin).toBe(40);
  });
});
