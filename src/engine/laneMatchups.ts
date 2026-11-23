// Who really laned against whom, from where each player stood minute by
// minute (Riot's assigned position misses lane swaps: 23/11 game, the top
// laner went mid at minute 5 and Riot still said TOP).
import type { MatchFull, MatchParticipant, MatchTimeline, ParticipantFrame } from "../services/riotApi";

export type Lane = "TOP" | "MID" | "BOT";
export type PairLane = Lane | "JUNGLE";

/** Lane a map point belongs to on Summoner's Rift (0..~14800 both axes,
 * blue base bottom-left), or null for jungle, river and bases. */
export function zoneOf({ x, y }: { x: number; y: number }): Lane | null {
  if ((x < 4000 && y > 9000) || (y > 12000 && x < 11000)) return "TOP";
  if ((y < 4000 && x > 5000) || (x > 12000 && y < 10000)) return "BOT";
  if (Math.abs(x - y) < 2500 && x + y > 5000 && x + y < 24000) return "MID";
  return null;
}

const LANE_FROM_MIN = 3;
const LANE_TO_MIN = 14;
/** Minutes in one lane (out of 12) to count as that player's lane. */
const MIN_LANE_MINUTES = 5;

const frameAt = (timeline: MatchTimeline, min: number) =>
  timeline.frames.find((f) => f.timestamp >= min * 60_000);

/** The lane a player spent most of minutes 3-14 in; null for a jungler or
 * a roamer with no clear lane. */
export function laneOf(timeline: MatchTimeline, participantId: number): Lane | null {
  const counts: Record<Lane, number> = { TOP: 0, MID: 0, BOT: 0 };
  for (let m = LANE_FROM_MIN; m <= LANE_TO_MIN; m++) {
    const pos = frameAt(timeline, m)?.participantFrames[String(participantId)]?.position;
    const z = pos ? zoneOf(pos) : null;
    if (z) counts[z]++;
  }
  const [best, n] = (Object.entries(counts) as [Lane, number][]).sort((a, b) => b[1] - a[1])[0];
  return n >= MIN_LANE_MINUTES ? best : null;
}

export interface LanePair {
  lane: PairLane;
  ally: MatchParticipant;
  enemy: MatchParticipant;
  /** Ally minus enemy at minute 14. */
  gold: number;
  xp: number;
  cs: number;
}

const cs = (f: ParticipantFrame | undefined) => (f ? f.minionsKilled + f.jungleMinionsKilled : 0);

/** Each player of `teamId` against the enemy who played the same lane in
 * minutes 3-14 (two per lane in bot: higher farm against higher farm), plus
 * the junglers. Empty when the game ended before minute 14. */
export function lanePairs(match: MatchFull, timeline: MatchTimeline, teamId: number): LanePair[] {
  const f14 = frameAt(timeline, LANE_TO_MIN);
  if (!f14) return [];
  const pf = (p: MatchParticipant) => f14.participantFrames[String(p.participantId)];
  const pair = (lane: PairLane, ally: MatchParticipant, enemy: MatchParticipant): LanePair => {
    const a = pf(ally);
    const e = pf(enemy);
    return {
      lane,
      ally,
      enemy,
      gold: (a?.totalGold ?? 0) - (e?.totalGold ?? 0),
      xp: (a?.xp ?? 0) - (e?.xp ?? 0),
      cs: cs(a) - cs(e),
    };
  };

  const out: LanePair[] = [];
  const isJungler = (p: MatchParticipant) => p.position === "JUNGLE";
  const allies = match.participants.filter((p) => p.teamId === teamId);
  const enemies = match.participants.filter((p) => p.teamId !== teamId);
  const byLane = (ps: MatchParticipant[], lane: Lane) =>
    ps
      .filter((p) => !isJungler(p) && laneOf(timeline, p.participantId) === lane)
      .sort((a, b) => cs(pf(b)) - cs(pf(a)));
  for (const lane of ["TOP", "MID", "BOT"] as Lane[]) {
    const a = byLane(allies, lane);
    const e = byLane(enemies, lane);
    for (let i = 0; i < Math.min(a.length, e.length); i++) out.push(pair(lane, a[i], e[i]));
  }
  const aj = allies.find(isJungler);
  const ej = enemies.find(isJungler);
  if (aj && ej) out.push(pair("JUNGLE", aj, ej));
  return out;
}

/** Lane each assigned Riot position is meant for. */
export const ROLE_LANE: Record<string, Lane> = { TOP: "TOP", MIDDLE: "MID", BOTTOM: "BOT", UTILITY: "BOT" };

/** Kills `killerId` made before minute 14 on `teamId`, split into the
 * victim `meId` and everyone else. */
export function earlyKillsBy(
  timeline: MatchTimeline,
  killerId: number,
  meId: number
): { onMe: number; onOthers: number } {
  let onMe = 0;
  let onOthers = 0;
  for (const frame of timeline.frames) {
    for (const ev of frame.events) {
      if (ev.type !== "CHAMPION_KILL" || ev.timestamp >= LANE_TO_MIN * 60_000) continue;
      const e = ev as Extract<typeof ev, { type: "CHAMPION_KILL" }>;
      if (e.killerId !== killerId) continue;
      if (e.victimId === meId) onMe++;
      else onOthers++;
    }
  }
  return { onMe, onOthers };
}
