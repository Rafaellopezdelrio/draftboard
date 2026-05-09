// Hybrid sync: prefers LCU (no key needed) for personal data,
// falls back to Riot API only when key is configured AND LCU lacks data.

import { saveMatch, existingMatchIds } from "./matchRepo";
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
 * Pulls personal data with sensible fallbacks:
 * 1. If client open: LCU (no key required)
 * 2. Else if Riot API key saved: Riot API
 * 3. Else: nothing (user sees onboarding)
 */
export async function syncPersonalData(
  onProgress: (p: SyncProgress) => void = () => {}
): Promise<SyncResult> {
  // Try LCU first
  const lcuMatchesResult = await tryLcuSync(onProgress);
  if (lcuMatchesResult) return lcuMatchesResult;

  // Fall back to Riot API
  const cfg = await loadSettings();
  if (cfg?.apiKey && cfg.puuid) {
    return riotApiSync(cfg, onProgress);
  }

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
  const ids = await getRecentMatchIds(cfg, cfg.puuid!, 20);
  const known = await existingMatchIds();
  const todo = ids.filter((id) => !known.has(id));
  let saved = 0;
  for (let i = 0; i < todo.length; i++) {
    try {
      const m = await getMatch(cfg, cfg.puuid!, todo[i]);
      await saveMatch(m);
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
