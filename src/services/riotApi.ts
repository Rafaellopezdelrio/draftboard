// Minimal Riot API client (Account-V1 + Match-V5 + Summoner-V4 + League-V4 + Champion-Mastery-V4).
// Requires a personal API key (https://developer.riotgames.com/).
//
// Routing: account is on the "regional" route (americas/europe/asia/sea),
// match is on the regional route as well, league/summoner/mastery on the
// "platform" route (euw1, na1, kr, ...).
//
// Uses Tauri's HTTP plugin when available (no CORS), falls back to fetch in browser.

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const httpFetch: typeof fetch = (input, init) =>
  isTauri() ? (tauriFetch as unknown as typeof fetch)(input, init) : fetch(input, init);

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
  const res = await httpFetch(url, { headers: { "X-Riot-Token": key.trim() } });
  if (res.status === 429) {
    const retry = parseInt(res.headers.get("Retry-After") ?? "5", 10);
    await new Promise((r) => setTimeout(r, retry * 1000));
    return api(url, key);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "API key inválida o caducada. Las dev keys duran 24h — regenera en developer.riotgames.com."
    );
  }
  if (res.status === 404) {
    throw new Error(`Riot ID no encontrado en la región seleccionada.`);
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

export async function getAccountByRiotId(
  cfg: RiotConfig,
  gameName: string,
  tagLine: string
): Promise<AccountDto> {
  const cluster = REGION_TO_CLUSTER[cfg.region];
  return api(
    `https://${cluster}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    cfg.apiKey
  );
}

export interface SummonerDto {
  id: string;
  accountId: string;
  puuid: string;
  profileIconId: number;
  summonerLevel: number;
}

export async function getSummonerByPuuid(
  cfg: RiotConfig,
  puuid: string
): Promise<SummonerDto> {
  return api(
    `https://${cfg.region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
    cfg.apiKey
  );
}

export interface LeagueEntryDto {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
  veteran: boolean;
  freshBlood: boolean;
}

export async function getLeagueEntriesBySummoner(
  cfg: RiotConfig,
  summonerId: string
): Promise<LeagueEntryDto[]> {
  return api(
    `https://${cfg.region}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`,
    cfg.apiKey
  );
}

export interface ChampionMasteryDto {
  championId: number;
  championLevel: number;
  championPoints: number;
  lastPlayTime: number;
}

export async function getTopMasteries(
  cfg: RiotConfig,
  puuid: string,
  count = 5
): Promise<ChampionMasteryDto[]> {
  return api(
    `https://${cfg.region}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${count}`,
    cfg.apiKey
  );
}

export interface MatchFull {
  matchId: string;
  durationSec: number;
  endTsMs: number;
  queueId: number;
  participants: MatchParticipant[];
  teams: MatchTeam[];
}

export interface MatchParticipant {
  puuid: string;
  participantId: number;
  championId: number;
  teamId: number;
  position: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  controlWardsBought: number;
  champLevel: number;
  items: number[];
  summoner1Id: number;
  summoner2Id: number;
  perks: unknown;
}

export interface MatchTeam {
  teamId: number;
  win: boolean;
  objectives: {
    baron: { kills: number };
    dragon: { kills: number };
    tower: { kills: number };
    riftHerald: { kills: number };
    inhibitor: { kills: number };
  };
}

interface MatchDto {
  metadata: { matchId: string };
  info: {
    gameDuration: number;
    gameEndTimestamp: number;
    queueId: number;
    teams: MatchTeam[];
    participants: Array<{
      puuid: string;
      participantId: number;
      championId: number;
      teamId: number;
      win: boolean;
      kills: number;
      deaths: number;
      assists: number;
      totalMinionsKilled: number;
      neutralMinionsKilled: number;
      teamPosition: string;
      goldEarned: number;
      totalDamageDealtToChampions: number;
      totalDamageTaken: number;
      visionScore: number;
      wardsPlaced: number;
      wardsKilled: number;
      detectorWardsPlaced: number;
      champLevel: number;
      item0: number; item1: number; item2: number;
      item3: number; item4: number; item5: number; item6: number;
      summoner1Id: number; summoner2Id: number;
      perks: unknown;
    }>;
  };
}

export interface TimelineFrame {
  timestamp: number;
  events: TimelineEvent[];
  participantFrames: Record<string, ParticipantFrame>;
}

export interface ParticipantFrame {
  participantId: number;
  currentGold: number;
  totalGold: number;
  level: number;
  xp: number;
  minionsKilled: number;
  jungleMinionsKilled: number;
  position: { x: number; y: number };
}

export type TimelineEvent =
  | { type: "CHAMPION_KILL"; timestamp: number; killerId: number; victimId: number; assistingParticipantIds?: number[]; position?: { x: number; y: number } }
  | { type: "ITEM_PURCHASED"; timestamp: number; participantId: number; itemId: number }
  | { type: "ITEM_SOLD"; timestamp: number; participantId: number; itemId: number }
  | { type: "SKILL_LEVEL_UP"; timestamp: number; participantId: number; skillSlot: number; levelUpType: string }
  | { type: "WARD_PLACED"; timestamp: number; creatorId: number; wardType: string }
  | { type: "WARD_KILL"; timestamp: number; killerId: number; wardType: string }
  | { type: "ELITE_MONSTER_KILL"; timestamp: number; killerId: number; monsterType: string; monsterSubType?: string }
  | { type: "BUILDING_KILL"; timestamp: number; killerId?: number; teamId: number; buildingType: string }
  | { type: string; timestamp: number; [k: string]: unknown };

export interface MatchTimeline {
  matchId: string;
  participantToPuuid: Record<number, string>;
  frames: TimelineFrame[];
}

interface TimelineDto {
  metadata: { matchId: string; participants: string[] };
  info: {
    frames: Array<{
      timestamp: number;
      events: TimelineEvent[];
      participantFrames: Record<string, ParticipantFrame>;
    }>;
    participants: Array<{ participantId: number; puuid: string }>;
  };
}

export async function getMatch(
  cfg: RiotConfig,
  puuid: string,
  matchId: string
): Promise<MatchSummary> {
  const m = await getMatchFull(cfg, matchId);
  const me = m.participants.find((p) => p.puuid === puuid);
  if (!me) throw new Error("PUUID not in match");
  return {
    matchId: m.matchId,
    championId: me.championId,
    win: me.win,
    kills: me.kills,
    deaths: me.deaths,
    assists: me.assists,
    cs: me.cs,
    durationSec: m.durationSec,
    gameEndTimestampMs: m.endTsMs,
    queueId: m.queueId,
    position: me.position,
  };
}

export async function getMatchFull(
  cfg: RiotConfig,
  matchId: string
): Promise<MatchFull> {
  const cluster = REGION_TO_CLUSTER[cfg.region];
  const m = await api<MatchDto>(
    `https://${cluster}.api.riotgames.com/lol/match/v5/matches/${matchId}`,
    cfg.apiKey
  );
  return {
    matchId: m.metadata.matchId,
    durationSec: m.info.gameDuration,
    endTsMs: m.info.gameEndTimestamp,
    queueId: m.info.queueId,
    teams: m.info.teams,
    participants: m.info.participants.map((p) => ({
      puuid: p.puuid,
      participantId: p.participantId,
      championId: p.championId,
      teamId: p.teamId,
      position: p.teamPosition,
      win: p.win,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      cs: p.totalMinionsKilled + p.neutralMinionsKilled,
      goldEarned: p.goldEarned,
      totalDamageDealtToChampions: p.totalDamageDealtToChampions,
      totalDamageTaken: p.totalDamageTaken,
      visionScore: p.visionScore,
      wardsPlaced: p.wardsPlaced,
      wardsKilled: p.wardsKilled,
      controlWardsBought: p.detectorWardsPlaced,
      champLevel: p.champLevel,
      items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].filter((x) => x > 0),
      summoner1Id: p.summoner1Id,
      summoner2Id: p.summoner2Id,
      perks: p.perks,
    })),
  };
}

export async function getMatchTimeline(
  cfg: RiotConfig,
  matchId: string
): Promise<MatchTimeline> {
  const cluster = REGION_TO_CLUSTER[cfg.region];
  const t = await api<TimelineDto>(
    `https://${cluster}.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline`,
    cfg.apiKey
  );
  const participantToPuuid: Record<number, string> = {};
  for (const p of t.info.participants) participantToPuuid[p.participantId] = p.puuid;
  return {
    matchId: t.metadata.matchId,
    participantToPuuid,
    frames: t.info.frames,
  };
}
