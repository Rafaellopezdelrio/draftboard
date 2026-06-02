// Fetches each scouted enemy's #1 mastery champion (their likely comfort pick)
// so the ban panel can suggest denying it. Best-effort: needs a Riot API key
// (enemy masteries aren't on the LCU), runs only while enemy cells are visible,
// and silently yields [] on any failure so bans degrade to personal/global.

import { useEffect, useState } from "react";
import { getSummonerById } from "../services/lcuService";
import { getTopMasteries } from "../services/riotApi";
import { loadSettings } from "../services/settingsRepo";
import type { EnemyMain } from "../engine/banEngine";

export function useEnemyMains(enemySummonerIds: number[]): EnemyMain[] {
  const [mains, setMains] = useState<EnemyMain[]>([]);
  // Re-run only when the actual set of enemies changes (champ hovers/locks
  // don't matter — mastery is account-level), so we don't re-hit the API on
  // every draft tick.
  const key = enemySummonerIds
    .filter((s) => s > 0)
    .sort((a, b) => a - b)
    .join(",");

  useEffect(() => {
    if (!key) {
      setMains([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const cfg = await loadSettings();
      if (!cfg?.apiKey || !cfg.puuid) return; // enemy masteries require Riot API
      const ids = enemySummonerIds.filter((s) => s > 0);
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
      if (!cancelled) setMains(out);
    })();
    return () => {
      cancelled = true;
    };
    // enemySummonerIds captured via `key`; primitive dep avoids array-identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return mains;
}
