import type {
  MatchFull,
  MatchParticipant,
  MatchTimeline,
} from "../services/riotApi";
import type { Role } from "../types/champion";
import { bracketForTier, baselineFor } from "./rankBenchmarks";

const ROLES = new Set<Role>(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]);
function asRole(p: string): Role {
  return ROLES.has(p as Role) ? (p as Role) : "MIDDLE";
}

export type GpiCategory =
  | "farming"
  | "vision"
  | "aggression"
  | "survivability"
  | "objectives"
  | "versatility"
  | "laning";

export interface GpiScore {
  total: number; // 0-100
  categories: Record<GpiCategory, number>; // each 0-100
  matchId: string;
}

export function computeGpi(
  match: MatchFull,
  myPuuid: string,
  rankTier?: string | null,
  timeline?: MatchTimeline | null
): GpiScore | null {
  const me = match.participants.find((p) => p.puuid === myPuuid);
  if (!me) return null;
  const team = match.participants.filter((p) => p.teamId === me.teamId);
  const minutes = match.durationSec / 60;
  // Score farming/vision against the baseline for the player's rank bracket
  // (defaults to the median bracket when rank is unknown) — a Gold CS/min that
  // is "good" reads differently than the same number in Master.
  const bracket = bracketForTier(rankTier);

  const farming = scoreFarming(me, minutes, bracket);
  const vision = scoreVision(me, minutes, bracket);
  const aggression = scoreAggression(me, team);
  const survivability = scoreSurvivability(me, minutes);
  const objectives = scoreObjectives(me, team);
  const versatility = scoreVersatility(me);
  const laning = scoreLaning(me, match.participants, timeline);

  const total =
    farming * 0.18 +
    vision * 0.13 +
    aggression * 0.18 +
    survivability * 0.18 +
    objectives * 0.13 +
    versatility * 0.07 +
    laning * 0.13;

  return {
    total: clamp(Math.round(total)),
    matchId: match.matchId,
    categories: {
      farming: clamp(Math.round(farming)),
      vision: clamp(Math.round(vision)),
      aggression: clamp(Math.round(aggression)),
      survivability: clamp(Math.round(survivability)),
      objectives: clamp(Math.round(objectives)),
      versatility: clamp(Math.round(versatility)),
      laning: clamp(Math.round(laning)),
    },
  };
}

// Matchup dominance vs your direct lane opponent, measured where laning is
// actually decided: the timeline frame nearest 14:00 (end of laning phase).
// End-of-game totals were WRONG for this — a splitpusher who lost lane but
// out-farmed you for 30 minutes read as "you lost lane" even when you took
// first tower (real user report). Falls back to end-of-game diffs only when
// no timeline is available (older cached matches).
const LANING_END_MS = 14 * 60 * 1000;

function laningDiffAt14(
  timeline: MatchTimeline | null | undefined,
  meId: number,
  oppId: number
): { gold: number; cs: number } | null {
  if (!timeline || !Array.isArray(timeline.frames) || timeline.frames.length === 0)
    return null;
  let best = timeline.frames[0];
  let bestDelta = Math.abs(best.timestamp - LANING_END_MS);
  for (const f of timeline.frames) {
    const d = Math.abs(f.timestamp - LANING_END_MS);
    if (d < bestDelta) {
      bestDelta = d;
      best = f;
    }
  }
  const mine = best.participantFrames?.[String(meId)];
  const theirs = best.participantFrames?.[String(oppId)];
  if (!mine || !theirs) return null;
  return {
    gold: mine.totalGold - theirs.totalGold,
    cs:
      mine.minionsKilled +
      mine.jungleMinionsKilled -
      (theirs.minionsKilled + theirs.jungleMinionsKilled),
  };
}
// A proxy for "did you win your lane" without needing the timeline. Even = 50;
// a big CS + gold lead pushes toward 100, falling behind toward 0.
function scoreLaning(
  me: MatchParticipant,
  all: MatchParticipant[],
  timeline?: MatchTimeline | null
): number {
  const opp = all.find(
    (p) => p.teamId !== me.teamId && p.position === me.position && me.position !== ""
  );
  if (!opp) return 50; // no resolvable opponent (ARAM / role mismatch)

  // Preferred: lead at ~14:00. Typical stomp ≈ +1000g / +30cs → ~90.
  const at14 = laningDiffAt14(timeline, me.participantId, opp.participantId);
  if (at14) return clamp(50 + at14.cs * 0.5 + at14.gold / 40);

  // Fallback (no timeline): end-of-game diffs, larger magnitudes → softer scale.
  const csDiff = me.cs - opp.cs;
  const goldDiff = me.goldEarned - opp.goldEarned;
  return clamp(50 + csDiff * 0.3 + goldDiff / 200);
}

function scoreFarming(
  me: MatchParticipant,
  minutes: number,
  bracket: Parameters<typeof baselineFor>[0]
): number {
  if (me.position === "UTILITY") return 50; // not relevant
  const target = baselineFor(bracket, asRole(me.position)).cspm;
  const cspm = me.cs / minutes;
  return (cspm / target) * 75;
}

function scoreVision(
  me: MatchParticipant,
  minutes: number,
  bracket: Parameters<typeof baselineFor>[0]
): number {
  const target = baselineFor(bracket, asRole(me.position)).vspm;
  const vspm = me.visionScore / minutes;
  return (vspm / target) * 75;
}

function scoreAggression(me: MatchParticipant, team: MatchParticipant[]): number {
  const teamKills = team.reduce((a, p) => a + p.kills, 0);
  const teamDmg = team.reduce((a, p) => a + p.totalDamageDealtToChampions, 0);
  const kp = teamKills > 0 ? (me.kills + me.assists) / teamKills : 0;
  const dmgShare = teamDmg > 0 ? me.totalDamageDealtToChampions / teamDmg : 0;
  // expected role-relative
  return kp * 100 * 0.6 + dmgShare * 100 * 1.5 * 0.4;
}

function scoreSurvivability(me: MatchParticipant, minutes: number): number {
  const dpm = me.deaths / minutes;
  // 0 deaths/min = 100, 0.5/min = 0
  return clamp(100 - dpm * 200);
}

function scoreObjectives(me: MatchParticipant, team: MatchParticipant[]): number {
  // Real objective contribution: your share of the team's damage to objectives
  // (turrets, epic monsters, etc.). Previously this just re-used kills+assists,
  // double-counting aggression — now it measures actual objective focus.
  const teamObj = team.reduce((a, p) => a + (p.damageDealtToObjectives ?? 0), 0);
  if (teamObj === 0) return 50;
  const share = (me.damageDealtToObjectives ?? 0) / teamObj;
  // Even split across 5 players = 0.2. Reward above-average focus:
  // 0.2 share -> 50, 0.4 -> 100.
  return clamp(share * 250);
}

function scoreVersatility(me: MatchParticipant): number {
  // Reward balanced KDA over feast/famine
  const kda = (me.kills + me.assists) / Math.max(1, me.deaths);
  return clamp(kda * 18);
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}
