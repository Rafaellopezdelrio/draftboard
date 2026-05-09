import {
  getMatchFull,
  getRecentMatchIds,
  getSummonerByPuuid,
  getLeagueEntriesBySummoner,
  getTopMasteries,
  type RiotConfig,
} from "./riotApi";

export interface ScoutResult {
  puuid: string;
  summonerLevel: number | null;
  rank: string | null;
  lp: number | null;
  recentWins: number;
  recentLosses: number;
  hotStreak: boolean;
  coldStreak: boolean;
  topChampionIds: number[];
  topMasteries: Array<{ championId: number; level: number; points: number }>;
  mainChampionId: number | null;
  mostPlayedRecent: { championId: number; games: number; wins: number } | null;
  pickedChampionMastery: { championId: number; level: number; points: number } | null;
}

const CACHE = new Map<string, { ts: number; result: ScoutResult }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function scoutPlayer(
  cfg: RiotConfig,
  puuid: string,
  pickedChampionId?: number
): Promise<ScoutResult> {
  const cacheKey = `${puuid}:${pickedChampionId ?? "any"}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.result;

  // Run independent calls in parallel
  const [summonerR, masteriesR, recentIdsR] = await Promise.allSettled([
    getSummonerByPuuid(cfg, puuid),
    getTopMasteries(cfg, puuid, 7),
    getRecentMatchIds(cfg, puuid, 10),
  ]);

  const summoner = summonerR.status === "fulfilled" ? summonerR.value : null;
  const masteries = masteriesR.status === "fulfilled" ? masteriesR.value : [];
  const recentIds = recentIdsR.status === "fulfilled" ? recentIdsR.value : [];

  let rank: string | null = null;
  let lp: number | null = null;
  let hotStreak = false;
  if (summoner) {
    try {
      const entries = await getLeagueEntriesBySummoner(cfg, summoner.id);
      const soloq = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");
      if (soloq) {
        rank = `${soloq.tier} ${soloq.rank}`;
        lp = soloq.leaguePoints;
        hotStreak = soloq.hotStreak;
      }
    } catch {
      // ignore
    }
  }

  const champCount = new Map<number, { games: number; wins: number }>();
  let recentWins = 0;
  let recentLosses = 0;
  let coldStreak = false;
  const last5Outcomes: boolean[] = [];

  // Fetch matches in parallel (5 most recent for streak, 10 total for stats)
  const matches = await Promise.allSettled(
    recentIds.slice(0, 10).map((id) => getMatchFull(cfg, id))
  );
  for (const r of matches) {
    if (r.status !== "fulfilled") continue;
    const me = r.value.participants.find((p) => p.puuid === puuid);
    if (!me) continue;
    if (me.win) recentWins++;
    else recentLosses++;
    last5Outcomes.push(me.win);
    const e = champCount.get(me.championId) ?? { games: 0, wins: 0 };
    e.games++;
    if (me.win) e.wins++;
    champCount.set(me.championId, e);
  }
  if (last5Outcomes.length >= 4 && last5Outcomes.slice(0, 4).every((w) => !w)) {
    coldStreak = true;
  }

  let mostPlayedRecent: ScoutResult["mostPlayedRecent"] = null;
  for (const [championId, v] of champCount) {
    if (!mostPlayedRecent || v.games > mostPlayedRecent.games) {
      mostPlayedRecent = { championId, games: v.games, wins: v.wins };
    }
  }

  const topMasteries = masteries.map((m) => ({
    championId: m.championId,
    level: m.championLevel,
    points: m.championPoints,
  }));
  const pickedChampionMastery =
    pickedChampionId !== undefined
      ? topMasteries.find((m) => m.championId === pickedChampionId) ?? null
      : null;

  const result: ScoutResult = {
    puuid,
    summonerLevel: summoner?.summonerLevel ?? null,
    rank,
    lp,
    recentWins,
    recentLosses,
    hotStreak,
    coldStreak,
    topChampionIds: masteries.map((m) => m.championId),
    topMasteries,
    mainChampionId: masteries[0]?.championId ?? null,
    mostPlayedRecent,
    pickedChampionMastery,
  };
  CACHE.set(cacheKey, { ts: Date.now(), result });
  return result;
}

export function clearScoutCache() {
  CACHE.clear();
}
