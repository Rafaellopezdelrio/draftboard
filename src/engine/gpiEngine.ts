import type {
  MatchFull,
  MatchParticipant,
} from "../services/riotApi";

export type GpiCategory =
  | "farming"
  | "vision"
  | "aggression"
  | "survivability"
  | "objectives"
  | "versatility";

export interface GpiScore {
  total: number; // 0-100
  categories: Record<GpiCategory, number>; // each 0-100
  matchId: string;
}

const CSPM_TARGETS: Record<string, number> = {
  TOP: 7,
  JUNGLE: 5.5,
  MIDDLE: 7.5,
  BOTTOM: 8,
  UTILITY: 1.5,
};

const VSPM_TARGETS: Record<string, number> = {
  TOP: 0.7,
  JUNGLE: 0.9,
  MIDDLE: 0.8,
  BOTTOM: 0.7,
  UTILITY: 1.6,
};

export function computeGpi(
  match: MatchFull,
  myPuuid: string
): GpiScore | null {
  const me = match.participants.find((p) => p.puuid === myPuuid);
  if (!me) return null;
  const team = match.participants.filter((p) => p.teamId === me.teamId);
  const minutes = match.durationSec / 60;

  const farming = scoreFarming(me, minutes);
  const vision = scoreVision(me, minutes);
  const aggression = scoreAggression(me, team);
  const survivability = scoreSurvivability(me, minutes);
  const objectives = scoreObjectives(me, team);
  const versatility = scoreVersatility(me);

  const total =
    farming * 0.2 +
    vision * 0.15 +
    aggression * 0.2 +
    survivability * 0.2 +
    objectives * 0.15 +
    versatility * 0.1;

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
    },
  };
}

function scoreFarming(me: MatchParticipant, minutes: number): number {
  if (me.position === "UTILITY") return 50; // not relevant
  const target = CSPM_TARGETS[me.position] ?? 6;
  const cspm = me.cs / minutes;
  return (cspm / target) * 75;
}

function scoreVision(me: MatchParticipant, minutes: number): number {
  const target = VSPM_TARGETS[me.position] ?? 0.8;
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
  // Use damage to objectives + assists on plays — proxied by team total kills + me's assists
  const teamKills = team.reduce((a, p) => a + p.kills, 0);
  if (teamKills === 0) return 50;
  const ratio = (me.assists + me.kills) / teamKills;
  return ratio * 80;
}

function scoreVersatility(me: MatchParticipant): number {
  // Reward balanced KDA over feast/famine
  const kda = (me.kills + me.assists) / Math.max(1, me.deaths);
  return clamp(kda * 18);
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}
