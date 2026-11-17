// Hybrid sync: prefers LCU (no key needed) for personal data,
// falls back to Riot API only when key is configured AND LCU lacks data.

import { saveMatch, existingMatchIds, dropLcuTwins, gameIdOf, storedMatchEnds } from "./matchRepo";
import { linkDraftToMatch } from "./draftsRepo";
import {
  lcuMasteries,
  lcuRecentMatches,
  lcuRank,
  type LcuRankInfo,
} from "./lcuPersonalData";
import {
  getRecentMatchIds,
  getMatch,
  getTopMasteries,
  getRiotProxyUrl,
  type ChampionMasteryDto,
  type RiotConfig,
} from "./riotApi";
import { loadSettings } from "./settingsRepo";
import { resolveAccount } from "./accountResolve";

export interface SyncProgress {
  source: "LCU" | "Riot API" | "none";
  done: number;
  total: number;
  message?: string;
  /** i18n key (+ params) for `message`; UIs should prefer it. */
  messageKey?: string;
  messageParams?: Record<string, string | number>;
}

export interface SyncResult {
  matches: number;
  masteries: number;
  rank: LcuRankInfo | null;
  source: "LCU" | "Riot API" | "none";
}

/**
 * Pulls personal data with sensible priorities:
 * 1. If Riot API key configured: use Riot API (always fresh, authoritative,
 *    has reliable teamPosition for modern season data).
 * 2. Else if client open: use LCU (no key needed but may return stale cache).
 * 3. Else: nothing (user sees onboarding).
 *
 * This order matters — LCU's local cache can be days out of date if the
 * user hasn't opened their match history tab in the client. Riot API is the
 * source of truth.
 */
// Dedupe concurrent syncs: the periodic timer, the new post-game trigger, and
// the manual button can all fire near each other; without this they'd double
// up Riot API fetches (rate-limit risk). Concurrent callers share the
// in-flight run (a caller's onProgress is ignored while one is already going).
let syncInFlight: Promise<SyncResult> | null = null;

/** Fired on window after a sync stores games, so screens that list games
 *  (the home screen) read them again instead of showing "no games yet". */
export const MATCHES_SYNCED_EVENT = "draftboard:matches-synced";

export function syncPersonalData(
  onProgress: (p: SyncProgress) => void = () => {}
): Promise<SyncResult> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = runSync(onProgress)
    .then((result) => {
      if (result.matches > 0 && typeof window !== "undefined")
        window.dispatchEvent(new CustomEvent(MATCHES_SYNCED_EVENT, { detail: result }));
      return result;
    })
    .finally(() => {
      syncInFlight = null;
    });
  return syncInFlight;
}

async function runSync(
  onProgress: (p: SyncProgress) => void = () => {}
): Promise<SyncResult> {
  let cfg = await loadSettings();
  // Clean install: nothing saved yet. Read the account from the LoL client and
  // save it, so the Riot path below (and the coach, live game…) can work.
  if (!cfg?.puuid) cfg = (await resolveAccount().catch(() => null)) ?? cfg;

  // 1. Prefer Riot API when key OR proxy is available + we know the puuid
  const hasRiotAccess = !!cfg?.apiKey || !!getRiotProxyUrl();
  if (hasRiotAccess && cfg?.puuid) {
    try {
      return await riotApiSync(cfg, onProgress);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onProgress({
        source: "Riot API",
        done: 0,
        total: 0,
        message: `Riot API falló (${msg}), probando LCU...`,
        messageKey: "sync.riotFailed",
        messageParams: { error: msg },
      });
      // Fall through to LCU
    }
  }

  // 2. Try LCU
  const lcuResult = await tryLcuSync(onProgress);
  if (lcuResult) return lcuResult;

  onProgress({ source: "none", done: 0, total: 0, message: "No data source available", messageKey: "sync.noSource" });
  return { matches: 0, masteries: 0, rank: null, source: "none" };
}

async function tryLcuSync(
  onProgress: (p: SyncProgress) => void
): Promise<SyncResult | null> {
  onProgress({ source: "LCU", done: 0, total: 1, message: "Conectando al cliente...", messageKey: "sync.connecting" });
  const [matches, masteries, rank] = await Promise.all([
    lcuRecentMatches(20).catch(() => []),
    lcuMasteries().catch(() => []),
    lcuRank().catch(() => null),
  ]);

  if (matches.length === 0 && masteries.length === 0 && rank === null) {
    return null; // LCU didn't respond, fall through
  }

  const known = await existingMatchIds();
  // Compare by numeric game id: the Riot API stores the same game as
  // "<PLATFORM>_<id>", so an exact-id check would save it again as "LCU_<id>".
  const knownGames = new Set(Array.from(known, gameIdOf));
  let saved = 0;
  for (let i = 0; i < matches.length; i++) {
    if (knownGames.has(gameIdOf(matches[i].matchId))) continue;
    await saveMatch(matches[i]);
    await linkDraftToMatch(
      matches[i].matchId,
      matches[i].championId,
      matches[i].gameEndTimestampMs
    ).catch(() => {});
    saved++;
    onProgress({
      source: "LCU",
      done: i + 1,
      total: matches.length,
      message: `Guardando ${i + 1}/${matches.length}`,
      messageKey: "sync.saving",
      messageParams: { done: i + 1, total: matches.length },
    });
  }
  return {
    matches: saved,
    masteries: masteries.length,
    rank,
    source: "LCU",
  };
}

async function riotApiSync(
  cfg: RiotConfig & { puuid?: string },
  onProgress: (p: SyncProgress) => void
): Promise<SyncResult> {
  onProgress({ source: "Riot API", done: 0, total: 1, message: "Listando partidas...", messageKey: "sync.listing" });
  const ids = await getRecentMatchIds(cfg, cfg.puuid!, 50);
  const known = await existingMatchIds();
  const todo = ids.filter((id) => !known.has(id));
  let saved = 0;
  for (let i = 0; i < todo.length; i++) {
    try {
      const m = await getMatch(cfg, cfg.puuid!, todo[i]);
      await saveMatch(m);
      await linkDraftToMatch(m.matchId, m.championId, m.gameEndTimestampMs).catch(
        () => {}
      );
      saved++;
    } catch {
      // skip
    }
    onProgress({
      source: "Riot API",
      done: i + 1,
      total: todo.length,
      message: `Descargando ${i + 1}/${todo.length}`,
      messageKey: "sync.downloading",
      messageParams: { done: i + 1, total: todo.length },
    });
  }
  // The whole season of ranked and Clash games, so "Mis campeones" and the
  // personal pick/ban data count every game played, not only the last 50.
  try {
    saved += await backfillSeason(cfg, onProgress);
  } catch {
    // keep what was saved; the next sync carries on from there
  }
  // Games saved earlier through the LCU fallback now have a Riot twin: keep
  // only the Riot row so personal stats don't count them twice. Best-effort.
  try {
    await dropLcuTwins();
  } catch {
    // skip
  }
  let masteries: ChampionMasteryDto[] = [];
  try {
    masteries = await getTopMasteries(cfg, cfg.puuid!, 20);
  } catch {
    // skip
  }
  return { matches: saved, masteries: masteries.length, rank: null, source: "Riot API" };
}

/** Queues whose whole season is downloaded: Solo/Duo, Flex, Clash. */
export const SEASON_QUEUES = [420, 440, 700] as const;
const PAGE = 100;
/** The proxy accepts start ≤ 1000: up to 1100 games per queue. */
const MAX_START = 1000;

/** Season = calendar year, as in "Mis campeones". */
export function seasonStartMs(now = Date.now()): number {
  return new Date(new Date(now).getFullYear(), 0, 1).getTime();
}

/**
 * Downloads every game of the current season in the season queues that isn't
 * stored yet. Riot lists ids newest first, so each queue is read page by page
 * until a game older than the season start. Stored games cost no download
 * (their end time comes from the database), so later syncs only list pages.
 * Returns how many games were saved.
 */
export async function backfillSeason(
  cfg: RiotConfig & { puuid?: string },
  onProgress: (p: SyncProgress) => void,
  now = Date.now()
): Promise<number> {
  const since = seasonStartMs(now);
  const ends = await storedMatchEnds();
  let saved = 0;
  for (const queue of SEASON_QUEUES) {
    for (let start = 0; start <= MAX_START; start += PAGE) {
      const ids = await getRecentMatchIds(cfg, cfg.puuid!, PAGE, queue, start);
      let reachedOlder = false;
      for (const id of ids) {
        let end = ends.get(id);
        if (end === undefined) {
          const m = await getMatch(cfg, cfg.puuid!, id).catch(() => null);
          if (!m) continue;
          end = m.gameEndTimestampMs;
          if (end < since) {
            reachedOlder = true;
            break;
          }
          await saveMatch(m);
          await linkDraftToMatch(m.matchId, m.championId, m.gameEndTimestampMs).catch(() => {});
          ends.set(id, end);
          saved++;
          onProgress({
            source: "Riot API",
            done: saved,
            total: 0,
            message: `Temporada: ${saved} partidas nuevas`,
            messageKey: "sync.season",
            messageParams: { done: saved },
          });
        } else if (end < since) {
          reachedOlder = true;
          break;
        }
      }
      if (reachedOlder || ids.length < PAGE) break;
    }
  }
  return saved;
}
