import type { ChampionDb, MetaTier } from "../types/champion";
import { fetchChampions, fetchLatestPatch } from "./dataDragon";
import { fetchCounters } from "./murderBridge";
import { buildMetaList } from "../data/metaTierList";
import { loadAggregatedCounters, loadAggregatedMeta } from "./aggregateRepo";

const STORAGE_KEY = "lol-draft-advisor:championDb:v3";
const STALE_AFTER_MS = 1000 * 60 * 60 * 12; // 12h

export async function loadChampionDb(force = false): Promise<ChampionDb> {
  if (!force) {
    const cached = readCache();
    if (cached && Date.now() - cached.fetchedAt < STALE_AFTER_MS) return cached;
  }
  const patch = await fetchLatestPatch();
  const proPatch = `proplay-${patch}`;
  const [champions, fallbackCounters, soloqMeta, proplayMeta, aggCounters] =
    await Promise.all([
      fetchChampions(patch),
      fetchCounters(patch),
      loadAggregatedMeta(patch), // SoloQ Master+
      loadAggregatedMeta(proPatch), // Pro play
      loadAggregatedCounters(patch),
    ]);

  // Read user pref for source. Default proplay.
  const source = readMetaSourcePref();

  let meta: MetaTier[];
  if (source === "proplay" && proplayMeta.length > 0) {
    meta = proplayMeta;
  } else if (source === "soloq" && soloqMeta.length > 0) {
    meta = soloqMeta;
  } else if (source === "blend" && (proplayMeta.length > 0 || soloqMeta.length > 0)) {
    meta = blendMetaSources(proplayMeta, soloqMeta);
  } else if (proplayMeta.length > 0) {
    meta = proplayMeta;
  } else if (soloqMeta.length > 0) {
    meta = soloqMeta;
  } else {
    meta = buildMetaList(champions);
  }

  const counters = aggCounters.length > 0 ? aggCounters : fallbackCounters;
  const db: ChampionDb = {
    patch,
    champions,
    counters,
    meta,
    fetchedAt: Date.now(),
  };
  writeCache(db);
  return db;
}

/**
 * Blend pro-play winrate + SoloQ Master winrate. Pro-play has small sample
 * but high signal; SoloQ has volume. Weighted average favors pro for picks
 * with >5 pro games, otherwise leans SoloQ.
 */
function blendMetaSources(pro: MetaTier[], soloq: MetaTier[]): MetaTier[] {
  const map = new Map<string, MetaTier>();
  for (const s of soloq) map.set(`${s.championKey}|${s.role}`, { ...s });
  for (const p of pro) {
    const k = `${p.championKey}|${p.role}`;
    const existing = map.get(k);
    if (!existing) {
      map.set(k, { ...p });
      continue;
    }
    // Pro-weight scales with sample size: 5+ pro games = 60% weight, 10+ = 75%
    const proGames = (p as MetaTier & { games?: number }).pickRate ?? 0;
    const proWeight = Math.min(0.75, 0.4 + proGames * 5);
    const blended: MetaTier = {
      championKey: p.championKey,
      role: p.role,
      tier: p.tier, // pro-play tier label takes priority
      winRate: p.winRate * proWeight + existing.winRate * (1 - proWeight),
      pickRate: Math.max(p.pickRate, existing.pickRate),
      banRate: Math.max(p.banRate, existing.banRate),
    };
    map.set(k, blended);
  }
  return Array.from(map.values());
}

function readMetaSourcePref(): "proplay" | "soloq" | "blend" {
  try {
    const raw = localStorage.getItem("lol-draft-prefs");
    if (!raw) return "proplay";
    const j = JSON.parse(raw);
    return j.metaSource ?? "proplay";
  } catch {
    return "proplay";
  }
}

function readCache(): ChampionDb | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChampionDb) : null;
  } catch {
    return null;
  }
}

function writeCache(db: ChampionDb) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // ignore quota errors; we'll refetch next launch
  }
}
