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
  opponentChampionId: number;
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

// If a proxy is configured, all Riot calls go through it instead of directly
// to api.riotgames.com. The proxy injects the production key server-side so
// the user never needs their own dev key.
let proxyUrl: string | null = null;

export function setRiotProxyUrl(url: string | null): void {
  proxyUrl = url && url.trim().length > 0 ? url.trim().replace(/\/$/, "") : null;
}

export function getRiotProxyUrl(): string | null {
  return proxyUrl;
}

/**
 * Rewrites a direct Riot URL into the proxy form.
 *   https://euw1.api.riotgames.com/lol/...  →  <proxy>/api/euw1/lol/...
 *   https://europe.api.riotgames.com/riot/... →  <proxy>/api/europe/riot/...
 */
function maybeProxify(url: string): string {
  if (!proxyUrl) return url;
  const m = url.match(/^https:\/\/([^.]+)\.api\.riotgames\.com(\/.*)$/);
  if (!m) return url;
  return `${proxyUrl}/api/${m[1]}${m[2]}`;
}

async function api<T>(url: string, key: string, attempt = 0): Promise<T> {
  await limiter.take();
  const finalUrl = maybeProxify(url);
  // When using the proxy, the X-Riot-Token header is injected server-side.
  // The local key (if any) becomes optional — proxy mode means key can be empty.
  const headers: Record<string, string> = proxyUrl
    ? {}
    : { "X-Riot-Token": key.trim() };
  let res: Response;
  try {
    res = await httpFetch(finalUrl, { headers });
  } catch (e) {
    // Network-level error — retry up to 3 times with exponential backoff
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      return api(url, key, attempt + 1);
    }
    throw new Error(`Sin conexión a ${proxyUrl ? "proxy" : "Riot API"}: ${String(e).slice(0, 100)}`);
  }
  if (res.status === 429) {
    const retry = parseInt(res.headers.get("Retry-After") ?? "5", 10);
    await new Promise((r) => setTimeout(r, retry * 1000));
    return api(url, key, attempt);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "API key inválida o caducada. Las dev keys duran 24h — regenera en developer.riotgames.com."
    );
  }
  if (res.status === 404) {
    throw new Error(`Riot ID no encontrado en la región seleccionada.`);
  }
  if (res.status >= 500 && attempt < 3) {
    // Server error — Riot occasionally has 503s, retry
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return api(url, key, attempt + 1);
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

/**
 * Newer endpoint (Riot pushed by-puuid in 2024). More reliable than
 * by-summoner because the summonerId field is being phased out for some
 * regions/accounts. Prefer this one.
 */
export async function getLeagueEntriesByPuuid(
  cfg: RiotConfig,
  puuid: string
): Promise<LeagueEntryDto[]> {
  return api(
    `https://${cfg.region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`,
    cfg.apiKey
  );
}

// ----- Spectator V5 (live game) -----

export interface CurrentGameParticipant {
  puuid: string;
  championId: number;
  teamId: number;
  summonerId?: string;
  riotId?: string;
  spell1Id: number;
  spell2Id: number;
  perks?: { perkIds: number[]; perkStyle: number; perkSubStyle: number };
}

export interface CurrentGameInfo {
  gameId: number;
  gameStartTime: number;
  gameLength: number;
  gameMode: string;
  gameType: string;
  gameQueueConfigId: number;
  mapId: number;
  participants: CurrentGameParticipant[];
}

/**
 * Fetches the live game (if the player is currently in a match).
 * Returns null if not in game (404).
 */
export async function getCurrentGameByPuuid(
  cfg: RiotConfig,
  puuid: string
): Promise<CurrentGameInfo | null> {
  try {
    return await api<CurrentGameInfo>(
      `https://${cfg.region}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`,
      cfg.apiKey
    );
  } catch (e) {
    const msg = String(e);
    if (msg.includes("404") || msg.includes("no encontrado")) return null;
    throw e;
  }
}

export interface ChampionMasteryDto {
  championId: number;
  championLevel: number;
  championPoints: number;
  lastPlayTime: number;
}

export interface LeagueListEntryDto {
  summonerId: string;
  leaguePoints: number;
  rank: string;
  wins: number;
  losses: number;
  hotStreak: boolean;
}

export interface LeagueListDto {
  tier: string;
  entries: LeagueListEntryDto[];
}

export async function getMasterLeague(cfg: RiotConfig): Promise<LeagueListDto> {
  return api(
    `https://${cfg.region}.api.riotgames.com/lol/league/v4/masterleagues/by-queue/RANKED_SOLO_5x5`,
    cfg.apiKey
  );
}

export async function getSummonerByPuuidPlatform(
  cfg: RiotConfig,
  puuid: string
): Promise<SummonerDto> {
  return getSummonerByPuuid(cfg, puuid);
}

export async function getPuuidBySummonerId(
  cfg: RiotConfig,
  summonerId: string
): Promise<string> {
  const s = await api<{ puuid: string }>(
    `https://${cfg.region}.api.riotgames.com/lol/summoner/v4/summoners/${summonerId}`,
    cfg.apiKey
  );
  return s.puuid;
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
  magicDamageDealtToChampions: number;
  physicalDamageDealtToChampions: number;
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
      magicDamageDealtToChampions: number;
      physicalDamageDealtToChampions: number;
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
  const opponent = m.participants.find(
    (p) => p.teamId !== me.teamId && p.position === me.position
  );
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
    opponentChampionId: opponent?.championId ?? 0,
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
      magicDamageDealtToChampions: p.magicDamageDealtToChampions,
      physicalDamageDealtToChampions: p.physicalDamageDealtToChampions,
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
