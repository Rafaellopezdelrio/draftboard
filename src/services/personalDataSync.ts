// Hybrid sync: prefers LCU (no key needed) for personal data,
// falls back to Riot API only when key is configured AND LCU lacks data.

import { saveMatch, existingMatchIds } from "./matchRepo";
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

export interface SyncProgress {
  source: "LCU" | "Riot API" | "none";
  done: number;
  total: number;
  message?: string;
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

export function syncPersonalData(
  onProgress: (p: SyncProgress) => void = () => {}
): Promise<SyncResult> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = runSync(onProgress).finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function runSync(
  onProgress: (p: SyncProgress) => void = () => {}
): Promise<SyncResult> {
  const cfg = await loadSettings();

  // 1. Prefer Riot API when key OR proxy is available + we know the puuid
  const hasRiotAccess = !!cfg?.apiKey || !!getRiotProxyUrl();
  if (hasRiotAccess && cfg?.puuid) {
    try {
      return await riotApiSync(cfg, onProgress);
    } catch (e) {
      onProgress({
        source: "Riot API",
        done: 0,
        total: 0,
        message: `Riot API falló (${String(e).slice(0, 60)}), probando LCU...`,
      });
      // Fall through to LCU
    }
  }

  // 2. Try LCU
  const lcuResult = await tryLcuSync(onProgress);
  if (lcuResult) return lcuResult;

  onProgress({ source: "none", done: 0, total: 0, message: "No data source available" });
  return { matches: 0, masteries: 0, rank: null, source: "none" };
}

async function tryLcuSync(
  onProgress: (p: SyncProgress) => void
): Promise<SyncResult | null> {
  onProgress({ source: "LCU", done: 0, total: 1, message: "Conectando al cliente..." });
  const [matches, masteries, rank] = await Promise.all([
    lcuRecentMatches(20).catch(() => []),
    lcuMasteries().catch(() => []),
    lcuRank().catch(() => null),
  ]);

  if (matches.length === 0 && masteries.length === 0 && rank === null) {
    return null; // LCU didn't respond, fall through
  }

  const known = await existingMatchIds();
  let saved = 0;
  for (let i = 0; i < matches.length; i++) {
    if (known.has(matches[i].matchId)) continue;
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
  onProgress({ source: "Riot API", done: 0, total: 1, message: "Listando partidas..." });
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
    });
  }
  let masteries: ChampionMasteryDto[] = [];
  try {
    masteries = await getTopMasteries(cfg, cfg.puuid!, 20);
  } catch {
    // skip
  }
  return { matches: saved, masteries: masteries.length, rank: null, source: "Riot API" };
}
