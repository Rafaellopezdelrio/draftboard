// Pulls personal data (match history, masteries, rank) directly from LCU.
// No Riot API key required — works as long as the LoL client is open.

import { invoke } from "@tauri-apps/api/core";
import type { MatchSummary } from "./riotApi";
import type { ChampionMasteryDto } from "./riotApi";

const SMITE_SPELL_ID = 11;

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
        participantId?: number;
        championId: number;
        teamId: number;
        spell1Id?: number;
        spell2Id?: number;
        // Newer LCU schemas (post-2024) include puuid directly on the
        // participant object — older schemas only expose it through
        // participantIdentities. Fallback path uses this when available.
        puuid?: string;
        stats: {
          win: boolean;
          kills: number;
          deaths: number;
          assists: number;
          totalMinionsKilled: number;
          neutralMinionsKilled: number;
          visionScore?: number;
          goldEarned?: number;
          // Newer fields, sometimes present
          teamPosition?: string;
          individualPosition?: string;
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
  count = 50
): Promise<MatchSummary[]> {
  const meRes = await lcuGet<{ puuid: string }>(
    "/lol-summoner/v1/current-summoner"
  );
  if (!meRes?.puuid) return [];

  // Try BOTH endpoints and merge — sometimes one returns more than the other.
  const [a, b] = await Promise.all([
    lcuGet<LcuMatchHistoryResponse>(
      `/lol-match-history/v1/products/lol/${meRes.puuid}/matches?begIndex=0&endIndex=${count}`
    ),
    lcuGet<LcuMatchHistoryResponse>(
      `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${count}`
    ),
  ]);

  const merged = new Map<number, NonNullable<LcuMatchHistoryResponse["games"]>["games"][number]>();
  for (const r of [a, b]) {
    if (!r?.games?.games) continue;
    for (const g of r.games.games) {
      if (!merged.has(g.gameId)) merged.set(g.gameId, g);
    }
  }
  if (merged.size === 0) return [];

  // Synthesize a fake response shape so the rest of the code below works
  const data: LcuMatchHistoryResponse = {
    games: { games: Array.from(merged.values()) },
  };

  // Sort by gameCreation desc to ensure newest first
  data.games.games.sort((x, y) => y.gameCreation - x.gameCreation);

  const out: MatchSummary[] = [];
  for (const g of data.games.games) {
    // Primary path: look up participantId via participantIdentities[].puuid.
    // ARAM (especially CHAOS-team games) sometimes returns this array
    // empty or with missing puuids — fall back to scanning participants
    // directly (newer LCU schemas include puuid inline on the participant).
    let me: (typeof g.participants)[number] | undefined;
    const idEntry = g.participantIdentities?.find(
      (p) => p.player?.puuid === meRes.puuid
    );
    if (idEntry?.participantId) {
      me = g.participants.find((p) => p.participantId === idEntry.participantId)
        ?? g.participants[idEntry.participantId - 1];
    }
    if (!me) {
      // Fallback: newer LCU embeds puuid on the participant itself.
      me = g.participants.find((p) => p.puuid === meRes.puuid);
    }
    if (!me) continue;

    const myPosition = inferPosition(me, g.queueId);
    let opponent = null;
    if (myPosition) {
      opponent = g.participants.find(
        (p) =>
          p.teamId !== me.teamId &&
          inferPosition(p, g.queueId) === myPosition
      );
    }

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
      position: myPosition,
      opponentChampionId: opponent?.championId ?? 0,
      visionScore: me.stats.visionScore ?? null,
      goldEarned: me.stats.goldEarned ?? null,
    });
  }
  return out;
}

/**
 * Infer player position with multiple signals:
 * 1. Modern teamPosition / individualPosition fields (present in some LCU returns)
 * 2. Smite check — only jungler carries smite
 * 3. CS check — junglers have low minionsKilled, lots of jungleMinionsKilled
 * 4. Lane/role legacy fields as last resort
 *
 * Returns "" (empty) if signals contradict — better empty than wrong.
 */
export function inferPosition(
  p: LcuMatchHistoryResponse["games"]["games"][number]["participants"][number],
  queueId: number
): string {
  // ARAM has no positions
  if (queueId === 450) return "";

  // 1. Modern teamPosition (most reliable when available)
  const tp = (p.stats.teamPosition ?? "").toUpperCase();
  if (tp === "TOP" || tp === "JUNGLE" || tp === "MIDDLE" || tp === "BOTTOM" || tp === "UTILITY") {
    return tp;
  }

  // 2. Smite check (huge signal for jungle)
  const hasSmite = p.spell1Id === SMITE_SPELL_ID || p.spell2Id === SMITE_SPELL_ID;
  const jungleCS = p.stats.neutralMinionsKilled ?? 0;
  const laneCS = p.stats.totalMinionsKilled ?? 0;

  if (hasSmite && jungleCS >= 30) return "JUNGLE";
  if (hasSmite) return "JUNGLE"; // smite at all = JG intent

  // 3. CS pattern: high jungle CS + low lane CS = jungle even without smite (rare)
  if (jungleCS > 50 && laneCS < 80) return "JUNGLE";

  // 4. Legacy lane/role fallback — only trust if NOT contradicting smite check
  const lane = (p.timeline?.lane ?? "").toUpperCase();
  const role = (p.timeline?.role ?? "").toUpperCase();

  // If lane says JUNGLE but no smite, it's wrong → return empty
  if (lane === "JUNGLE" && !hasSmite) return "";

  if (lane === "TOP") return "TOP";
  if (lane === "MIDDLE" || lane === "MID") return "MIDDLE";
  if (lane === "BOTTOM" || lane === "BOT") {
    if (role === "DUO_SUPPORT" || role === "SUPPORT") return "UTILITY";
    return "BOTTOM";
  }

  // 5. Last resort: very low CS = probably support
  if (laneCS < 50 && jungleCS < 20) return "UTILITY";

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
