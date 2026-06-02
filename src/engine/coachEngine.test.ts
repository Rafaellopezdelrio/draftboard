import { describe, it, expect, beforeEach } from "vitest";
import { analyzeMatch, setCoachEloBucket } from "./coachEngine";
import type {
  MatchFull,
  MatchParticipant,
  MatchTimeline,
} from "../services/riotApi";

function mkParticipant(overrides: Partial<MatchParticipant> = {}): MatchParticipant {
  return {
    puuid: "me",
    participantId: 1,
    championId: 238,
    teamId: 100,
    position: "MIDDLE",
    win: false,
    kills: 4,
    deaths: 5,
    assists: 6,
    cs: 200,
    goldEarned: 12000,
    totalDamageDealtToChampions: 18000,
    magicDamageDealtToChampions: 9000,
    physicalDamageDealtToChampions: 9000,
    totalDamageTaken: 22000,
    damageDealtToObjectives: 8000,
    visionScore: 25,
    wardsPlaced: 10,
    wardsKilled: 4,
    controlWardsBought: 3,
    champLevel: 15,
    items: [3157, 6655, 3020, 0, 0, 0, 0],
    summoner1Id: 4,
    summoner2Id: 14,
    perks: {},
    ...overrides,
  };
}

function mkMatch(me: MatchParticipant, durationSec = 1800): MatchFull {
  // 9 random teammates/opponents
  const others = Array.from({ length: 9 }, (_, i) =>
    mkParticipant({
      puuid: `other-${i}`,
      participantId: i + 2,
      teamId: i < 4 ? 100 : 200, // 4 allies + 5 enemies
      position: ["TOP", "JUNGLE", "BOTTOM", "UTILITY", "TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][i],
      kills: 5,
      deaths: 5,
      assists: 5,
      cs: 150,
      goldEarned: 10000,
      totalDamageDealtToChampions: 15000,
    })
  );
  return {
    matchId: "EUW1_TEST",
    durationSec,
    endTsMs: Date.now(),
    queueId: 420,
    teams: [
      {
        teamId: 100,
        win: me.win,
        objectives: {
          baron: { kills: 0 }, dragon: { kills: 2 }, tower: { kills: 5 },
          riftHerald: { kills: 1 }, inhibitor: { kills: 1 },
        },
      },
      {
        teamId: 200,
        win: !me.win,
        objectives: {
          baron: { kills: 1 }, dragon: { kills: 2 }, tower: { kills: 6 },
          riftHerald: { kills: 0 }, inhibitor: { kills: 2 },
        },
      },
    ],
    participants: [me, ...others],
  };
}

function mkTimeline(events: Array<{ timestamp: number; type: string; [k: string]: unknown }> = []): MatchTimeline {
  return {
    matchId: "EUW1_TEST",
    participantToPuuid: { 1: "me" },
    frames: [
      {
        timestamp: 0,
        events: events as never,
        participantFrames: {},
      } as never,
    ],
  };
}

describe("coachEngine", () => {
  beforeEach(() => {
    setCoachEloBucket("DIAMOND"); // deterministic benchmarks
  });

  it("returns empty when puuid is not in the match", () => {
    const match = mkMatch(mkParticipant());
    const tl = mkTimeline();
    expect(analyzeMatch({ match, timeline: tl, myPuuid: "ghost" })).toEqual([]);
  });

  it("flags bad CS when cs/min is well below target for the role", () => {
    // 100 CS / 30 min = 3.3/min in MIDDLE (target 7.5/min diamond) → ~44% of target → bad
    const me = mkParticipant({ cs: 100, position: "MIDDLE" });
    const insights = analyzeMatch({
      match: mkMatch(me, 1800),
      timeline: mkTimeline(),
      myPuuid: "me",
    });
    expect(insights.some((i) => i.category === "farming" && i.severity === "bad")).toBe(true);
  });

  it("praises good farm above target", () => {
    // 280 CS / 30 min = 9.3/min in MIDDLE → above 7.5 target → good
    const me = mkParticipant({ cs: 280, position: "MIDDLE" });
    const insights = analyzeMatch({
      match: mkMatch(me, 1800),
      timeline: mkTimeline(),
      myPuuid: "me",
    });
    expect(insights.some((i) => i.category === "farming" && i.severity === "good")).toBe(true);
  });

  it("flags an enemy magic-damage skew with a build insight (revives the dead no-op)", () => {
    const me = mkParticipant();
    const match = mkMatch(me);
    // Skew the enemy team's damage heavily toward magic.
    for (const p of match.participants) {
      if (p.teamId !== me.teamId) {
        p.magicDamageDealtToChampions = 12_000;
        p.physicalDamageDealtToChampions = 2_000;
      }
    }
    const insights = analyzeMatch({ match, timeline: mkTimeline(), myPuuid: "me" });
    const build = insights.find((i) => i.category === "build");
    expect(build).toBeDefined();
    expect(build!.detail).toMatch(/mágico/);
  });

  it("gives no build insight when enemy damage is balanced", () => {
    const insights = analyzeMatch({
      match: mkMatch(mkParticipant()),
      timeline: mkTimeline(),
      myPuuid: "me",
    });
    expect(insights.some((i) => i.category === "build")).toBe(false);
  });

  it("skips CS analysis for UTILITY role (support farming nuance)", () => {
    const me = mkParticipant({ cs: 30, position: "UTILITY" });
    const insights = analyzeMatch({
      match: mkMatch(me, 1800),
      timeline: mkTimeline(),
      myPuuid: "me",
    });
    expect(insights.some((i) => i.category === "farming")).toBe(false);
  });

  it("flags low vision score for the role", () => {
    const me = mkParticipant({
      position: "UTILITY",
      visionScore: 10, // very low for sup
      controlWardsBought: 0,
    });
    const insights = analyzeMatch({
      match: mkMatch(me, 1800),
      timeline: mkTimeline(),
      myPuuid: "me",
    });
    expect(insights.some((i) => i.category === "vision")).toBe(true);
  });

  it("counts early deaths from the timeline", () => {
    const me = mkParticipant();
    const tl = mkTimeline([
      { timestamp: 4 * 60 * 1000, type: "CHAMPION_KILL", victimId: 1, assistingParticipantIds: [] } as never,
      { timestamp: 6 * 60 * 1000, type: "CHAMPION_KILL", victimId: 1, assistingParticipantIds: [] } as never,
      { timestamp: 7 * 60 * 1000, type: "CHAMPION_KILL", victimId: 1, assistingParticipantIds: [] } as never,
    ]);
    const insights = analyzeMatch({ match: mkMatch(me), timeline: tl, myPuuid: "me" });
    expect(insights.some((i) => i.category === "deaths" && i.title.includes("3"))).toBe(true);
  });

  it("ignores enemy kill events when counting my deaths", () => {
    const me = mkParticipant();
    const tl = mkTimeline([
      // victim is participant 2 (not me) — should NOT count
      { timestamp: 4 * 60 * 1000, type: "CHAMPION_KILL", victimId: 2, assistingParticipantIds: [] } as never,
      { timestamp: 5 * 60 * 1000, type: "CHAMPION_KILL", victimId: 3, assistingParticipantIds: [] } as never,
      { timestamp: 6 * 60 * 1000, type: "CHAMPION_KILL", victimId: 4, assistingParticipantIds: [] } as never,
    ]);
    const insights = analyzeMatch({ match: mkMatch(me), timeline: tl, myPuuid: "me" });
    expect(insights.some((i) => i.category === "deaths" && i.title.includes("early"))).toBe(false);
  });

  it("sorts insights by severity (bad → warn → good → info)", () => {
    const me = mkParticipant({ cs: 100, deaths: 12, visionScore: 5 });
    const insights = analyzeMatch({
      match: mkMatch(me, 1800),
      timeline: mkTimeline(),
      myPuuid: "me",
    });
    const order = ["bad", "warn", "good", "info"];
    for (let i = 1; i < insights.length; i++) {
      expect(order.indexOf(insights[i].severity)).toBeGreaterThanOrEqual(
        order.indexOf(insights[i - 1].severity)
      );
    }
  });
});
