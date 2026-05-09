// Minimal Riot API client (Account-V1 + Match-V5 + Summoner-V4 + League-V4 + Champion-Mastery-V4).
// Requires a personal API key (https://developer.riotgames.com/).
//
// Routing: account is on the "regional" route (americas/europe/asia/sea),
// match is on the regional route as well, league/summoner/mastery on the
// "platform" route (euw1, na1, kr, ...).

export type Region = "euw1" | "na1" | "kr" | "eun1" | "br1" | "la1" | "la2" | "oc1" | "tr1" | "ru" | "jp1";
export type Cluster = "europe" | "americas" | "asia" | "sea";

const REGION_TO_CLUSTER: Record<Region, Cluster> = {
  euw1: "europe",
  eun1: "europe",
  tr1: "europe",
  ru: "europe",
  na1: "americas",
  br1: "americas",
  la1: "americas",
  la2: "americas",
  kr: "asia",
  jp1: "asia",
  oc1: "sea",
};

export interface RiotConfig {
  apiKey: string;
  region: Region;
  riotIdName: string;
  riotIdTag: string;
}

export interface AccountDto {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface MatchSummary {
  matchId: string;
  championId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  durationSec: number;
  gameEndTimestampMs: number;
  queueId: number;
  position: string;
}

class RateLimiter {
  private timestamps: number[] = [];
  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}
  async take(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.limit) {
      const wait = this.windowMs - (now - this.timestamps[0]) + 50;
      await new Promise((r) => setTimeout(r, wait));
      return this.take();
    }
    this.timestamps.push(Date.now());
  }
}

// Personal-key default: 100 req / 2 min
const limiter = new RateLimiter(95, 120_000);

async function api<T>(url: string, key: string): Promise<T> {
  await limiter.take();
  const res = await fetch(url, { headers: { "X-Riot-Token": key } });
  if (res.status === 429) {
    const retry = parseInt(res.headers.get("Retry-After") ?? "5", 10);
    await new Promise((r) => setTimeout(r, retry * 1000));
    return api(url, key);
  }
  if (!res.ok) throw new Error(`Riot API ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

export async function getAccount(cfg: RiotConfig): Promise<AccountDto> {
  const cluster = REGION_TO_CLUSTER[cfg.region];
  return api(
    `https://${cluster}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(cfg.riotIdName)}/${encodeURIComponent(cfg.riotIdTag)}`,
    cfg.apiKey
  );
}

export async function getRecentMatchIds(
  cfg: RiotConfig,
  puuid: string,
  count = 20
): Promise<string[]> {
  const cluster = REGION_TO_CLUSTER[cfg.region];
  return api(
    `https://${cluster}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`,
    cfg.apiKey
  );
}

interface MatchDto {
  metadata: { matchId: string };
  info: {
    gameDuration: number;
    gameEndTimestamp: number;
    queueId: number;
    participants: Array<{
      puuid: string;
      championId: number;
      win: boolean;
      kills: number;
      deaths: number;
      assists: number;
      totalMinionsKilled: number;
      neutralMinionsKilled: number;
      teamPosition: string;
    }>;
  };
}

export async function getMatch(
  cfg: RiotConfig,
  puuid: string,
  matchId: string
): Promise<MatchSummary> {
  const cluster = REGION_TO_CLUSTER[cfg.region];
  const m = await api<MatchDto>(
    `https://${cluster}.api.riotgames.com/lol/match/v5/matches/${matchId}`,
    cfg.apiKey
  );
  const me = m.info.participants.find((p) => p.puuid === puuid);
  if (!me) throw new Error("PUUID not in match");
  return {
    matchId: m.metadata.matchId,
    championId: me.championId,
    win: me.win,
    kills: me.kills,
    deaths: me.deaths,
    assists: me.assists,
    cs: me.totalMinionsKilled + me.neutralMinionsKilled,
    durationSec: m.info.gameDuration,
    gameEndTimestampMs: m.info.gameEndTimestamp,
    queueId: m.info.queueId,
    position: me.teamPosition,
  };
}
