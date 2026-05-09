// Pulls personal data (match history, masteries, rank) directly from LCU.
// No Riot API key required — works as long as the LoL client is open.

import { invoke } from "@tauri-apps/api/core";
import type { MatchSummary } from "./riotApi";
import type { ChampionMasteryDto } from "./riotApi";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function lcuGet<T>(path: string): Promise<T | null> {
  if (!isTauri()) return null;
  try {
    return (await invoke<T>("lcu_get_json", { path })) ?? null;
  } catch {
    return null;
  }
}

interface LcuMatchHistoryResponse {
  games: {
    games: Array<{
      gameId: number;
      gameDuration: number;
      gameCreation: number;
      queueId: number;
      participants: Array<{
        championId: number;
        teamId: number;
        stats: {
          win: boolean;
          kills: number;
          deaths: number;
          assists: number;
          totalMinionsKilled: number;
          neutralMinionsKilled: number;
        };
        timeline: { lane: string; role: string };
      }>;
      participantIdentities: Array<{
        participantId: number;
        player: { puuid: string };
      }>;
    }>;
  };
}

export async function lcuRecentMatches(
  count = 20
): Promise<MatchSummary[]> {
  const meRes = await lcuGet<{ puuid: string }>(
    "/lol-summoner/v1/current-summoner"
  );
  if (!meRes?.puuid) return [];

  const data = await lcuGet<LcuMatchHistoryResponse>(
    `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${count}`
  );
  if (!data?.games?.games) return [];

  const out: MatchSummary[] = [];
  for (const g of data.games.games) {
    const myPid = g.participantIdentities.find(
      (p) => p.player.puuid === meRes.puuid
    )?.participantId;
    if (!myPid) continue;
    const me = g.participants[myPid - 1];
    if (!me) continue;

    const position = lcuLaneRoleToPosition(me.timeline.lane, me.timeline.role);
    const opponent = g.participants.find(
      (p) =>
        p.teamId !== me.teamId &&
        lcuLaneRoleToPosition(
          (p.timeline?.lane ?? "") as string,
          (p.timeline?.role ?? "") as string
        ) === position
    );

    out.push({
      matchId: `LCU_${g.gameId}`,
      championId: me.championId,
      win: me.stats.win,
      kills: me.stats.kills,
      deaths: me.stats.deaths,
      assists: me.stats.assists,
      cs: me.stats.totalMinionsKilled + me.stats.neutralMinionsKilled,
      durationSec: g.gameDuration,
      gameEndTimestampMs: g.gameCreation + g.gameDuration * 1000,
      queueId: g.queueId,
      position,
      opponentChampionId: opponent?.championId ?? 0,
    });
  }
  return out;
}

function lcuLaneRoleToPosition(lane: string, role: string): string {
  const l = (lane ?? "").toUpperCase();
  const r = (role ?? "").toUpperCase();
  if (l === "TOP") return "TOP";
  if (l === "JUNGLE") return "JUNGLE";
  if (l === "MIDDLE" || l === "MID") return "MIDDLE";
  if (l === "BOTTOM" || l === "BOT") {
    if (r === "DUO_SUPPORT" || r === "SUPPORT") return "UTILITY";
    return "BOTTOM";
  }
  return "";
}

interface LcuMasteryResp {
  championId: number;
  championLevel: number;
  championPoints: number;
  lastPlayTime: number;
}

export async function lcuMasteries(): Promise<ChampionMasteryDto[]> {
  const data = await lcuGet<LcuMasteryResp[]>(
    "/lol-champion-mastery/v1/local-player/champion-mastery"
  );
  if (!data) return [];
  return data.map((m) => ({
    championId: m.championId,
    championLevel: m.championLevel,
    championPoints: m.championPoints,
    lastPlayTime: m.lastPlayTime,
  }));
}

export interface LcuRankInfo {
  tier: string;
  division: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
}

export async function lcuRank(): Promise<LcuRankInfo | null> {
  const data = await lcuGet<{
    queues: Array<{
      queueType: string;
      tier: string;
      division: string;
      leaguePoints: number;
      wins: number;
      losses: number;
      hotStreak: boolean;
    }>;
  }>("/lol-ranked/v1/current-ranked-stats");
  const soloq = data?.queues.find((q) => q.queueType === "RANKED_SOLO_5x5");
  if (!soloq) return null;
  return {
    tier: soloq.tier,
    division: soloq.division,
    leaguePoints: soloq.leaguePoints,
    wins: soloq.wins,
    losses: soloq.losses,
    hotStreak: soloq.hotStreak,
  };
}
