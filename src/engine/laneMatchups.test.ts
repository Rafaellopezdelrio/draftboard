import { describe, it, expect } from "vitest";
import type { MatchFull, MatchParticipant, MatchTimeline } from "../services/riotApi";
import { earlyKillsBy, laneOf, lanePairs, zoneOf } from "./laneMatchups";

const SPOT = {
  TOP: { x: 1500, y: 12000 },
  MID: { x: 7400, y: 7400 },
  BOT: { x: 12500, y: 2000 },
  JG: { x: 4000, y: 7500 },
  BASE: { x: 400, y: 400 },
};
type Spot = keyof typeof SPOT;

function p(id: number, teamId: number, position: string, championId = id): MatchParticipant {
  return { participantId: id, teamId, position, championId, puuid: `p${id}` } as MatchParticipant;
}

/** Frames 0..15; `where(id, minute)` places each player, `stats` sets minute-14 numbers. */
function timeline(
  where: (id: number, min: number) => Spot,
  stats: Record<number, { gold?: number; xp?: number; cs?: number }> = {},
  events: unknown[] = []
): MatchTimeline {
  return {
    matchId: "T",
    participantToPuuid: {},
    frames: Array.from({ length: 16 }, (_, m) => ({
      timestamp: m * 60_000,
      events: (m === 0 ? events : []) as never,
      participantFrames: Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => {
          const id = i + 1;
          return [
            String(id),
            {
              participantId: id,
              currentGold: 0,
              totalGold: stats[id]?.gold ?? 5000,
              level: 9,
              xp: stats[id]?.xp ?? 6000,
              minionsKilled: stats[id]?.cs ?? 100,
              jungleMinionsKilled: 0,
              position: SPOT[where(id, m)],
            },
          ];
        })
      ),
    })),
  };
}

// Team 100: 1 top, 2 jungle, 3 mid, 4 adc, 5 support. Team 200: 6..10 the same.
const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const match = {
  participants: Array.from({ length: 10 }, (_, i) => p(i + 1, i < 5 ? 100 : 200, ROLES[i % 5])),
} as MatchFull;
const usual = (id: number): Spot => (["TOP", "JG", "MID", "BOT", "BOT"] as Spot[])[(id - 1) % 5];

describe("zoneOf", () => {
  it("knows the three lanes and leaves jungle and bases out", () => {
    expect(zoneOf(SPOT.TOP)).toBe("TOP");
    expect(zoneOf({ x: 9000, y: 13500 })).toBe("TOP");
    expect(zoneOf(SPOT.MID)).toBe("MID");
    expect(zoneOf(SPOT.BOT)).toBe("BOT");
    expect(zoneOf({ x: 13500, y: 6000 })).toBe("BOT");
    expect(zoneOf(SPOT.JG)).toBeNull();
    expect(zoneOf(SPOT.BASE)).toBeNull();
    expect(zoneOf({ x: 14400, y: 14400 })).toBeNull();
  });
});

describe("laneOf", () => {
  it("is the lane of most of minutes 3-14, recalls included", () => {
    const tl = timeline((id, m) => (id === 1 ? (m % 4 === 0 ? "BASE" : "TOP") : usual(id)));
    expect(laneOf(tl, 1)).toBe("TOP");
  });

  it("follows a lane swap at minute 5", () => {
    const tl = timeline((id, m) => (id === 1 ? (m < 5 ? "TOP" : "MID") : id === 3 ? (m < 5 ? "MID" : "TOP") : usual(id)));
    expect(laneOf(tl, 1)).toBe("MID");
    expect(laneOf(tl, 3)).toBe("TOP");
  });

  it("is null for a player with no lane (jungler)", () => {
    expect(laneOf(timeline(usual), 2)).toBeNull();
  });
});

describe("lanePairs", () => {
  it("pairs each lane, bot by farm, plus the junglers", () => {
    const tl = timeline(usual, { 4: { cs: 120 }, 5: { cs: 10 }, 9: { cs: 110 }, 10: { cs: 15 }, 1: { gold: 5600 } });
    const pairs = lanePairs(match, tl, 100).map((x) => [x.lane, x.ally.participantId, x.enemy.participantId, x.gold]);
    expect(pairs).toEqual([
      ["TOP", 1, 6, 600],
      ["MID", 3, 8, 0],
      ["BOT", 4, 9, 0],
      ["BOT", 5, 10, 0],
      ["JUNGLE", 2, 7, 0],
    ]);
  });

  it("pairs the real opponents after a lane swap", () => {
    // My top (1) and mid (3) swap at minute 5; the enemy does not.
    const tl = timeline((id, m) => (id === 1 ? (m < 5 ? "TOP" : "MID") : id === 3 ? (m < 5 ? "MID" : "TOP") : usual(id)));
    const pairs = lanePairs(match, tl, 100);
    expect(pairs.find((x) => x.ally.participantId === 1)?.enemy.participantId).toBe(8);
    expect(pairs.find((x) => x.ally.participantId === 3)?.enemy.participantId).toBe(6);
  });

  it("is empty when the game ended before minute 14", () => {
    const tl = timeline(usual);
    tl.frames = tl.frames.slice(0, 10);
    expect(lanePairs(match, tl, 100)).toEqual([]);
  });
});

describe("earlyKillsBy", () => {
  it("splits kills before minute 14 into me and others", () => {
    const k = (t: number, victimId: number) => ({ type: "CHAMPION_KILL", timestamp: t * 60_000, killerId: 6, victimId });
    const tl = timeline(usual, {}, [k(3, 1), k(5, 2), k(9, 3), k(20, 4)]);
    expect(earlyKillsBy(tl, 6, 1)).toEqual({ onMe: 1, onOthers: 2 });
  });
});
