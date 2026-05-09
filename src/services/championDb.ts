import type { ChampionDb } from "../types/champion";
import { fetchChampions, fetchLatestPatch } from "./dataDragon";
import { fetchCounters, fetchMeta } from "./murderBridge";

const STORAGE_KEY = "lol-draft-advisor:championDb";
const STALE_AFTER_MS = 1000 * 60 * 60 * 12; // 12h

export async function loadChampionDb(force = false): Promise<ChampionDb> {
  if (!force) {
    const cached = readCache();
    if (cached && Date.now() - cached.fetchedAt < STALE_AFTER_MS) return cached;
  }
  const patch = await fetchLatestPatch();
  const [champions, counters, meta] = await Promise.all([
    fetchChampions(patch),
    fetchCounters(patch),
    fetchMeta(patch),
  ]);
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
