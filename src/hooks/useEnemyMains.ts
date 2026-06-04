// Fetches each scouted enemy's #1 mastery champion (their likely comfort pick)
// so the ban panel + draft coach can use it. Best-effort: needs a Riot API key
// (enemy masteries aren't on the LCU) and silently yields [] on failure.
//
// Two consumers mount this at once (BanSuggestionsPanel + DraftCoachPanel), so
// a naive fetch would double every Riot call per champ select. A module-level
// result cache (TTL) + an in-flight promise map collapse all callers for the
// same lobby onto ONE fetch: concurrent mounts share the in-flight promise,
// later remounts hit the cache.

import { useEffect, useState } from "react";
import { getSummonerById } from "../services/lcuService";
import { getTopMasteries } from "../services/riotApi";
import { loadSettings } from "../services/settingsRepo";
import type { EnemyMain } from "../engine/banEngine";

const CACHE = new Map<string, { ts: number; mains: EnemyMain[] }>();
const INFLIGHT = new Map<string, Promise<EnemyMain[]>>();
const CACHE_TTL = 5 * 60 * 1000;

async function fetchEnemyMains(ids: number[]): Promise<EnemyMain[]> {
  const cfg = await loadSettings();
  if (!cfg?.apiKey || !cfg.puuid) return []; // enemy masteries require Riot API
  const out: EnemyMain[] = [];
  for (const sid of ids) {
    try {
      const sum = await getSummonerById(sid);
      if (!sum?.puuid) continue;
      const masteries = await getTopMasteries(cfg, sum.puuid, 1);
      const top = masteries[0];
      if (top) {
        out.push({
          championId: top.championId,
          points: top.championPoints,
          summonerName: sum.gameName ?? undefined,
        });
      }
    } catch {
      // One enemy failing (private profile, rate limit) shouldn't sink the rest.
    }
  }
  return out;
}

/** Cache-or-fetch the enemy mains for a lobby key. Exported for tests. */
export function getEnemyMains(key: string, ids: number[]): Promise<EnemyMain[]> {
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return Promise.resolve(cached.mains);
  }
  let p = INFLIGHT.get(key);
  if (!p) {
    p = fetchEnemyMains(ids)
      .then((mains) => {
        CACHE.set(key, { ts: Date.now(), mains });
        return mains;
      })
      .finally(() => INFLIGHT.delete(key));
    INFLIGHT.set(key, p);
  }
  return p;
}

/** Test helper — clears the module caches between cases. */
export function __resetEnemyMainsCache() {
  CACHE.clear();
  INFLIGHT.clear();
}

export function useEnemyMains(enemySummonerIds: number[]): EnemyMain[] {
  const [mains, setMains] = useState<EnemyMain[]>([]);
  // Re-run only when the actual set of enemies changes (champ hovers/locks
  // don't matter — mastery is account-level). The sorted-id string is also the
  // cache key, so both consumers + remounts collapse onto one fetch.
  const ids = enemySummonerIds.filter((s) => s > 0);
  const key = [...ids].sort((a, b) => a - b).join(",");

  useEffect(() => {
    if (!key) {
      setMains([]);
      return;
    }
    let cancelled = false;
    getEnemyMains(key, ids).then((m) => {
      if (!cancelled) setMains(m);
    });
    return () => {
      cancelled = true;
    };
    // `ids` captured via `key`; primitive dep avoids array-identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return mains;
}
