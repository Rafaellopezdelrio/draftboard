// Champion DB cold-load with stale-cache fallback + background retry.
// Gated on prefsLoaded so the meta-source pref (dpm bracket, region,
// timeframe) is visible to readMetaSourcePref(); without the gate the
// first load races prefsStore.load() and always falls back to op.gg
// defaults.
//
// Fallback path: when fresh load fails (worker down, DDragon flaky,
// user offline), surface a stale cache copy if one exists so the user
// isn't dead-ended, then retry in the background every 60s. On the
// first successful refresh, swap stale→fresh + toast success.
//
// Extracted from App.tsx (was a 70-LOC useEffect with bootAttempt
// state + cancellation flag). Returns the same shape the shell needs:
// db, error, usingStaleCache, plus a retry() that bumps bootAttempt.

import { useEffect, useState } from "react";
import { loadChampionDb, readChampionDbCacheUnsafe } from "../services/championDb";
import { trackEvent, trackFetch } from "../services/breadcrumbs";
import { mark, measure, warnIfSlow } from "../services/perf";
import type { ChampionDb } from "../types/champion";
import type { Toast } from "../components/ui/ToastContainer";
import { startAutoProSync } from "../services/autoProSync";

type PushToast = (toast: Omit<Toast, "id">) => number;

interface UseChampionDbBoot {
  db: ChampionDb | null;
  error: string | null;
  usingStaleCache: boolean;
  retry: () => void;
  /** Escape hatch for components that force-refresh the DB externally
   * (e.g. TierListView after a manual meta-source change). Prefer
   * `retry()` for normal flows. */
  setDb: (db: ChampionDb) => void;
}

/** Mount once. Cold-loads champion DB; on failure, surfaces stale
 * cache + retries forever in the background. `pushToast` should be
 * stable across renders (ToastContainer's push is referentially stable). */
export function useChampionDbBoot(
  prefsLoaded: boolean,
  pushToast: PushToast
): UseChampionDbBoot {
  const [db, setDb] = useState<ChampionDb | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usingStaleCache, setUsingStaleCache] = useState(false);
  const [bootAttempt, setBootAttempt] = useState(0);

  useEffect(() => {
    if (!prefsLoaded) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setInterval> | null = null;
    setError(null);
    setUsingStaleCache(false);
    mark("dbLoad:start");

    loadChampionDb()
      .then((loadedDb) => {
        if (cancelled) return;
        mark("dbLoad:end");
        const elapsed = measure("dbLoad:start", "dbLoad:end");
        // Boot budget: 2s. Anything slower indicates DDragon/worker is
        // sluggish or the user is on a poor connection. Breadcrumb
        // surfaces this in Sentry if a later error fires.
        warnIfSlow(elapsed, 2000, "Champion DB initial load", {
          patch: loadedDb.patch,
        });
        trackEvent("config", "Champion DB loaded", {
          patch: loadedDb.patch,
          champCount: Object.keys(loadedDb.champions).length,
          loadMs: Math.round(elapsed),
        });
        setDb(loadedDb);
        // Auto-sync pro-play data in background once champion data ready.
        // Silent — fails gracefully if Leaguepedia is rate-limited.
        startAutoProSync(loadedDb);
      })
      .catch((e) => {
        if (cancelled) return;
        trackFetch("championDb", "fail", String(e).slice(0, 200));
        // Fresh load failed — try stale cache fallback so the user
        // isn't dead-ended. Common cases: CF Worker down, DDragon
        // flaky, user opened app immediately after losing internet.
        const stale = readChampionDbCacheUnsafe();
        if (stale) {
          setDb(stale);
          setUsingStaleCache(true);
          const ageMin = Math.round((Date.now() - stale.fetchedAt) / 60_000);
          const ageLabel =
            ageMin < 60 ? `hace ${ageMin}min` : `hace ${Math.round(ageMin / 60)}h`;
          pushToast({
            type: "warn",
            title: "Mostrando datos en caché",
            detail: `No pude refrescar (${ageLabel}). Reintento en background.`,
            durationMs: 8000,
          });
          // Background retry every minute until fresh load works. Handle
          // hoisted to effect scope so the cleanup below clears it on
          // unmount / re-run — otherwise a fallback that never recovers
          // keeps hitting the network every 60s forever and stacks a new
          // interval on every effect re-run.
          retryTimer = setInterval(async () => {
            try {
              const fresh = await loadChampionDb(true);
              if (!cancelled) {
                setDb(fresh);
                setUsingStaleCache(false);
                if (retryTimer) clearInterval(retryTimer);
                pushToast({
                  type: "success",
                  title: "Datos actualizados",
                  detail: "Refresco completado.",
                });
              }
            } catch {
              // Keep retrying silently.
            }
          }, 60_000);
        } else {
          // No cache + load failure = hard error. User retries manually.
          setError(String(e));
        }
      });

    return () => {
      cancelled = true;
      if (retryTimer) clearInterval(retryTimer);
    };
  }, [prefsLoaded, bootAttempt, pushToast]);

  const retry = () => setBootAttempt((n) => n + 1);

  return { db, error, usingStaleCache, retry, setDb };
}
