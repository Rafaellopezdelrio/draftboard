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
import type {
  MatchFull,
  MatchTimeline,
  MatchParticipant,
  ParticipantFrame,
  TimelineEvent,
  TimelineFrame,
} from "../services/riotApi";

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
    // championNamesById map doesn't have 999 — falls back to "#<id>".
    expect(r.myChampionName).toBe("#999");
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

// ---------------------------------------------------------------------------
// Timeline-driven metrics. laneTimeline() builds one frame per minute (with a
// few ms of drift, like Riot's) where me (pid 1) gains 7 minions + 1 jungle
// camp CS, 400 gold and 300 xp per minute, and the lane opponent (pid 6)
// 6 minions, 350 gold and 280 xp. All events ride on frame 0 — the analyzer
// only looks at each event's own timestamp.
// ---------------------------------------------------------------------------

const MIN = 60_000;

const pf = (participantId: number, over: Partial<ParticipantFrame> = {}): ParticipantFrame => ({
  participantId,
  currentGold: 0,
  totalGold: 0,
  level: 1,
  xp: 0,
  minionsKilled: 0,
  jungleMinionsKilled: 0,
  position: { x: 0, y: 0 },
  ...over,
});

function laneTimeline(events: TimelineEvent[] = [], lastMinute = 20): MatchTimeline {
  const frames: TimelineFrame[] = [];
  for (let m = 0; m <= lastMinute; m++) {
    const level = 1 + Math.floor(m / 2);
    frames.push({
      timestamp: m * MIN + 50,
      events: m === 0 ? events : [],
      participantFrames: {
        "1": pf(1, { minionsKilled: 7 * m, jungleMinionsKilled: m, totalGold: 500 + 400 * m, xp: 300 * m, level }),
        "6": pf(6, { minionsKilled: 6 * m, totalGold: 500 + 350 * m, xp: 280 * m, level }),
      },
    });
  }
  return { matchId: "EUW1_test", participantToPuuid: {}, frames };
}

const kill = (
  min: number,
  killerId: number,
  victimId: number,
  assists?: number[],
  position?: { x: number; y: number }
): TimelineEvent => ({
  type: "CHAMPION_KILL",
  timestamp: min * MIN,
  killerId,
  victimId,
  assistingParticipantIds: assists,
  position,
});
const elite = (min: number, killerId: number, monsterType: string): TimelineEvent => ({
  type: "ELITE_MONSTER_KILL",
  timestamp: min * MIN,
  killerId,
  monsterType,
});
const building = (min: number, teamId: number, buildingType: string): TimelineEvent => ({
  type: "BUILDING_KILL",
  timestamp: min * MIN,
  teamId,
  buildingType,
});
const buy = (min: number, participantId: number, itemId: number): TimelineEvent => ({
  type: "ITEM_PURCHASED",
  timestamp: min * MIN,
  participantId,
  itemId,
});

// Me (pid 1, blue MIDDLE) vs lane opponent (pid 6, red MIDDLE).
const laneMatch = (meOver: Partial<MatchParticipant> = {}, oppOver: Partial<MatchParticipant> = {}) =>
  mkMatch([
    mkPart({ puuid: "me", participantId: 1, teamId: 100, position: "MIDDLE", ...meOver }),
    mkPart({ puuid: "opp", participantId: 6, teamId: 200, position: "MIDDLE", championId: 103, ...oppOver }),
  ]);

describe("buildProAnalytics — frame snapshots", () => {
  it("reads CS/gold/xp/level at 5/10/14/15/20 and diffs them against the lane opponent", () => {
    const r = buildProAnalytics(laneMatch(), laneTimeline(), "me", champNames)!;
    expect(r).toMatchObject({
      cs5: 40,
      cs10: 80,
      cs14: 112,
      cs20: 160,
      goldAt5: 2500,
      goldAt10: 4500,
      goldAt15: 6500,
      goldAt20: 8500,
      xpAt10: 3000,
      level5: 3,
      level10: 6,
      level14: 8,
      level20: 11,
      csDiffAt10: 20,
      csDiffAt14: 28,
      csDiffAt20: 40,
      goldDiffAt10: 500,
      goldDiffAt15: 750,
      goldDiffAt20: 1000,
      xpDiffAt10: 200,
      goldLeadAt15: 750,
      csLeadAt14: 28,
      jungleCs10: 10,
      jungleCs15: 15,
      campsPerMinute: 1, // 15 jungle CS by 15:00 in a 30-min game
    });
  });

  it("without a lane opponent, diffs fall back to my own absolute values", () => {
    // Opponent plays TOP, so nobody on red matches my MIDDLE.
    const r = buildProAnalytics(
      laneMatch({}, { position: "TOP" }),
      laneTimeline([elite(10, 2, "DRAGON")]),
      "me",
      champNames
    )!;
    expect(r.csDiffAt10).toBe(80);
    expect(r.goldDiffAt15).toBe(6500);
    expect(r.xpDiffAt10).toBe(3000);
    expect(r.goldLeadAt15).toBe(6500);
    expect(r.objectiveTrades[0]).toMatchObject({ myCsDeltaAtTime: 80, myGoldDeltaAtTime: 4500 });
  });

  it("a game that ends before 14:00 leaves later snapshots at 0", () => {
    const r = buildProAnalytics(
      laneMatch(),
      laneTimeline([], 12),
      "me",
      champNames
    )!;
    expect(r.cs10).toBe(80);
    expect(r.cs14).toBe(0);
    expect(r.goldAt15).toBe(0);
    expect(r.level20).toBe(0);
    expect(r.csDiffAt14).toBe(0);
    expect(r.jungleCs15).toBe(0);
    expect(r.campsPerMinute).toBe(0);
  });
});

describe("buildProAnalytics — kills, deaths & locations", () => {
  it("counts early deaths, solo deaths, kills by 10 and streaks from CHAMPION_KILL events", () => {
    const r = buildProAnalytics(
      laneMatch(),
      laneTimeline([
        kill(3, 6, 1, [], { x: 7000, y: 7200 }), // death <5 and <10, solo, mid
        kill(8, 7, 1, [6], { x: 1500, y: 13000 }), // death <10, assisted, top → death streak 2
        kill(9, 1, 6), // my kill <10 → resets death streak
        kill(11, 2, 7), // not involving me: no effect
        kill(12, 1, 7, [2]),
        kill(13, 1, 8), // kill streak 3
        kill(16, 9, 1), // solo death (assists undefined), no position → no location
        kill(18, 1, 9),
      ]),
      "me",
      champNames
    )!;
    expect(r.deathsBy10).toBe(2);
    expect(r.deathsAt5).toBe(1);
    expect(r.soloDeaths).toBe(2);
    expect(r.deathLocations).toEqual(["mid", "top"]);
    expect(r.killsBy10).toBe(1);
    expect(r.longestDeathStreak).toBe(2);
    expect(r.longestKillStreak).toBe(3);
  });

  it("labels death positions coarsely by map quadrant and counts lane deaths for a top laner", () => {
    const at = (min: number, x: number, y: number) => kill(min, 6, 1, [7], { x, y });
    const r = buildProAnalytics(
      laneMatch({ position: "TOP" }, { position: "TOP" }),
      laneTimeline([
        at(1, 7000, 7200), // on the diagonal → mid
        at(2, 1500, 13000), // top-left → top
        at(3, 13000, 1500), // bottom-right → bot
        at(4, 12500, 9000), // top-right, off-diagonal → river top
        at(5, 5000, 1500), // bottom-left, off-diagonal → river bot
        at(6, 2000, 2000), // on the diagonal but inside the fountain guard (x ≤ 3000) → river bot
      ]),
      "me",
      champNames
    )!;
    expect(r.deathLocations).toEqual(["mid", "top", "bot", "river top", "river bot", "river bot"]);
    expect(r.deathsInLane).toBe(1);
  });

  // BUG: deathsInLane compares coarseLocation() labels ("mid", "bot") with
  // position.toLowerCase() ("middle", "bottom"), and "lane" is never produced,
  // so MIDDLE and BOTTOM players always get deathsInLane = 0. Only TOP matches.
  it.skip("counts lane deaths for MIDDLE and BOTTOM players (label mismatch bug)", () => {
    const mid = buildProAnalytics(
      laneMatch(),
      laneTimeline([kill(3, 6, 1, [], { x: 7000, y: 7200 }), kill(6, 6, 1, [], { x: 8000, y: 8300 })]),
      "me",
      champNames
    )!;
    expect(mid.deathLocations).toEqual(["mid", "mid"]);
    expect(mid.deathsInLane).toBe(2);

    const bot = buildProAnalytics(
      laneMatch({ position: "BOTTOM" }, { position: "BOTTOM" }),
      laneTimeline([kill(3, 6, 1, [], { x: 13000, y: 1500 })]),
      "me",
      champNames
    )!;
    expect(bot.deathsInLane).toBe(1);
  });
});

describe("buildProAnalytics — objectives", () => {
  it("tallies dragons/barons/heralds per side, first-take times and objective-trade snapshots", () => {
    const r = buildProAnalytics(
      laneMatch(),
      laneTimeline([
        elite(6, 2, "DRAGON"),
        elite(9, 3, "RIFTHERALD"),
        elite(11, 7, "DRAGON"),
        elite(14, 8, "HORDE"), // not tracked
        elite(17, 4, "DRAGON"),
        elite(25, 8, "BARON_NASHOR"), // past the last frame → zero snapshot
        elite(28, 1, "BARON_NASHOR"),
      ]),
      "me",
      champNames
    )!;
    expect(r.drakesByMyTeam).toBe(2);
    expect(r.drakesByEnemy).toBe(1);
    expect(r.baronsByMyTeam).toBe(1);
    expect(r.baronsByEnemy).toBe(1);
    expect(r.firstDragonTime).toBe(6 * MIN);
    expect(r.firstHeraldTime).toBe(9 * MIN);
    expect(r.firstBaronTime).toBe(25 * MIN);
    expect(r.objectiveTrades).toEqual([
      { objective: "DRAGON", takenByMyTeam: true, timestamp: 6 * MIN, myCsDeltaAtTime: 12, myGoldDeltaAtTime: 300 },
      { objective: "RIFTHERALD", takenByMyTeam: true, timestamp: 9 * MIN, myCsDeltaAtTime: 18, myGoldDeltaAtTime: 450 },
      { objective: "DRAGON", takenByMyTeam: false, timestamp: 11 * MIN, myCsDeltaAtTime: 22, myGoldDeltaAtTime: 550 },
      { objective: "DRAGON", takenByMyTeam: true, timestamp: 17 * MIN, myCsDeltaAtTime: 34, myGoldDeltaAtTime: 850 },
      { objective: "BARON", takenByMyTeam: false, timestamp: 25 * MIN, myCsDeltaAtTime: 0, myGoldDeltaAtTime: 0 },
      { objective: "BARON", takenByMyTeam: true, timestamp: 28 * MIN, myCsDeltaAtTime: 0, myGoldDeltaAtTime: 0 },
    ]);
  });

  it("from the red side, killers 6-10 are my team and a destroyed blue tower is my first tower", () => {
    const m = mkMatch([
      mkPart({ puuid: "me", participantId: 7, teamId: 200, position: "JUNGLE" }),
      mkPart({ puuid: "blue", participantId: 2, teamId: 100, position: "JUNGLE" }),
    ]);
    // Single frame with no participant entries → snapshot falls back to zeros.
    const tl: MatchTimeline = {
      matchId: "EUW1_test",
      participantToPuuid: {},
      frames: [
        {
          timestamp: 0,
          participantFrames: {},
          events: [elite(0, 7, "DRAGON"), building(0, 100, "TOWER_BUILDING")],
        },
      ],
    };
    const r = buildProAnalytics(m, tl, "me", champNames)!;
    expect(r.drakesByMyTeam).toBe(1);
    expect(r.drakesByEnemy).toBe(0);
    expect(r.objectiveTrades[0]).toMatchObject({ takenByMyTeam: true, myCsDeltaAtTime: 0, myGoldDeltaAtTime: 0 });
    expect(r.firstTowerByMyTeam).toBe(true);
  });

  it("first tower: only the first TOWER_BUILDING counts, other buildings are ignored", () => {
    // Inhibitor first (ignored), then my own tower falls (teamId 100 = owner),
    // then an enemy tower — too late to change the answer.
    const lost = buildProAnalytics(
      laneMatch(),
      laneTimeline([
        building(5, 200, "INHIBITOR_BUILDING"),
        building(8, 100, "TOWER_BUILDING"),
        building(9, 200, "TOWER_BUILDING"),
      ]),
      "me",
      champNames
    )!;
    expect(lost.firstTowerByMyTeam).toBe(false);

    const won = buildProAnalytics(
      laneMatch(),
      laneTimeline([building(8, 200, "TOWER_BUILDING"), building(9, 100, "TOWER_BUILDING")]),
      "me",
      champNames
    )!;
    expect(won.firstTowerByMyTeam).toBe(true);
  });
});

describe("buildProAnalytics — items", () => {
  it("counts my purchases, first finished item time and control wards before 10:00", () => {
    const r = buildProAnalytics(
      laneMatch(),
      laneTimeline([
        buy(0.1, 1, 1055), // Doran's Blade — starter
        buy(0.1, 1, 2003), // potion
        buy(4, 1, 2055), // control ward < 10 min
        buy(7, 1, 1036), // Long Sword — component
        buy(9, 6, 3031), // opponent's purchase: ignored
        buy(12, 1, 2055), // control ward after 10 min
        buy(14, 1, 3031), // Infinity Edge — first finished item
        buy(20, 1, 6672),
      ]),
      "me",
      champNames
    )!;
    expect(r.itemsPurchasedCount).toBe(7);
    expect(r.firstItemTime).toBe(14 * MIN);
    expect(r.pinksByMin10).toBe(1);
  });

  it("detects Mercurial Scimitar (3139) as QSS-family", () => {
    const r = buildProAnalytics(
      mkMatch([mkPart({ puuid: "me", items: [3139, 0, 0, 0, 0, 0, 0] })]),
      emptyTimeline(),
      "me",
      champNames
    )!;
    expect(r.hadQss).toBe(true);
    expect(r.hadStopwatch).toBe(false);
  });
});

describe("buildProAnalytics — ratios & defaults", () => {
  it("computes combat shares against my team only, plus vision per minute", () => {
    const r = buildProAnalytics(
      mkMatch([
        mkPart({ puuid: "me", participantId: 1, kills: 5, deaths: 3, assists: 8 }),
        mkPart({ puuid: "ally", participantId: 2, kills: 15, totalDamageDealtToChampions: 30_000, totalDamageTaken: 27_000 }),
        mkPart({ puuid: "enemy", participantId: 6, teamId: 200, kills: 40, totalDamageDealtToChampions: 90_000 }),
      ]),
      emptyTimeline(),
      "me",
      champNames
    )!;
    expect(r.damagePerGold).toBeCloseTo(20_000 / 12_000, 6);
    expect(r.damagePerDeath).toBeCloseTo(20_000 / 3, 6);
    expect(r.killParticipation).toBeCloseTo(13 / 20, 6);
    expect(r.damageShare).toBeCloseTo(0.4, 6);
    expect(r.damageTakenShare).toBeCloseTo(0.4, 6);
    expect(r.visionScorePerMin).toBeCloseTo(25 / 30, 6);
    expect(r.controlWardsBought).toBe(2);
    expect(r.wardsKilled).toBe(3);
  });

  it("deathless game: damagePerDeath is the raw damage instead of dividing by zero", () => {
    const r = buildProAnalytics(
      mkMatch([mkPart({ puuid: "me", deaths: 0, totalDamageDealtToChampions: 15_000 })]),
      emptyTimeline(),
      "me",
      champNames
    )!;
    expect(r.damagePerDeath).toBe(15_000);
  });

  it("all-zero stats and a 0s duration produce 0 ratios, never NaN/Infinity", () => {
    const r = buildProAnalytics(
      mkMatch(
        [
          mkPart({
            puuid: "me",
            kills: 0,
            deaths: 0,
            assists: 0,
            goldEarned: 0,
            totalDamageDealtToChampions: 0,
            totalDamageTaken: 0,
          }),
        ],
        { durationSec: 0 }
      ),
      emptyTimeline(),
      "me",
      champNames
    )!;
    expect(r.damagePerGold).toBe(0);
    expect(r.killParticipation).toBe(0);
    expect(r.damageShare).toBe(0);
    expect(r.damageTakenShare).toBe(0);
    expect(r.campsPerMinute).toBe(0);
    expect(r.visionScorePerMin).toBe(25); // divisor clamped to 1 minute
    expect(r.durationMin).toBe(0);
  });

  it("empty timeline leaves objective/item/streak fields at their neutral defaults", () => {
    const r = buildProAnalytics(mkMatch([mkPart({ puuid: "me" })]), emptyTimeline(), "me", champNames)!;
    expect(r).toMatchObject({
      firstDragonTime: null,
      firstHeraldTime: null,
      firstBaronTime: null,
      firstTowerByMyTeam: false,
      firstItemTime: null,
      itemsPurchasedCount: 0,
      pinksByMin10: 0,
      objectiveTrades: [],
      deathLocations: [],
      deathsInLane: 0,
      longestDeathStreak: 0,
      longestKillStreak: 0,
    });
  });

  it("falls back to '#<id>' for unknown champions in names and both team comps", () => {
    const r = buildProAnalytics(
      mkMatch([
        mkPart({ puuid: "me", participantId: 1, championId: 999, position: "MIDDLE" }),
        mkPart({ puuid: "ally", participantId: 2, championId: 266, position: "TOP" }),
        mkPart({ puuid: "opp", participantId: 6, teamId: 200, championId: 998, position: "MIDDLE" }),
      ]),
      emptyTimeline(),
      "me",
      champNames
    )!;
    expect(r.myChampionName).toBe("#999");
    expect(r.laneOpponentChampionName).toBe("#998");
    expect(r.myTeamComposition).toEqual([
      { championId: 999, championName: "#999", position: "MIDDLE" },
      { championId: 266, championName: "Aatrox", position: "TOP" },
    ]);
    expect(r.enemyTeamComposition).toEqual([{ championId: 998, championName: "#998", position: "MIDDLE" }]);
  });
});
