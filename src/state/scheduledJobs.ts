// Background job scheduler — keeps meta data fresh and personal stats up to date
// without user intervention.

import { useEffect } from "react";
import { syncPersonalData } from "../services/personalDataSync";
import { getLastAggregationTimestamp } from "../services/aggregateRepo";
import { aggregateFromMaster } from "../services/metaAggregator";
import { fetchLatestPatch } from "../services/dataDragon";
import { loadSettings } from "../services/settingsRepo";
import {
  aggregateFromProPlay,
  getProPlayLastRun,
} from "../services/proPlayAggregator";
import { loadChampionDb } from "../services/championDb";
import { usePrefsStore } from "./prefsStore";

/** Custom DOM event fired when a new patch is detected mid-session.
 * App.tsx listens + surfaces a toast offering to refresh data. We use
 * a window event (vs Tauri event) because it's the same window — no
 * cross-window plumbing needed. */
export const PATCH_UPDATED_EVENT = "draftboard:patch-updated";

const PERSONAL_SYNC_INTERVAL_MS = 5 * 60 * 1000; // every 5 min
const META_AGG_INTERVAL_MS = 12 * 60 * 60 * 1000; // every 12h
/** Patch poll interval. Patches drop ~once every 2 weeks but bug-fix
 * hotfixes happen mid-cycle. 6h cadence catches new patches within
 * half a workday so the user sees fresh tier-list/build data without
 * restart. Cheap call (one HTTP GET to DDragon versions.json). */
const PATCH_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6h

export function useScheduledJobs() {
  useEffect(() => {
    // Personal data: try every 5min while client is open
    const personalTimer = setInterval(() => {
      syncPersonalData().catch(() => {}); // silent fail, will retry
    }, PERSONAL_SYNC_INTERVAL_MS);

    // Meta aggregation: SoloQ + Pro play. Pro play needs no key.
    const metaTimer = setInterval(async () => {
      try {
        const prefs = usePrefsStore.getState().prefs;
        const patch = await fetchLatestPatch();

        // Pro play (no key needed) — preferred default source
        if (prefs.metaSource !== "soloq") {
          const pro = await getProPlayLastRun();
          if (!pro.ts || Date.now() - pro.ts > META_AGG_INTERVAL_MS) {
            const db = await loadChampionDb(false);
            await aggregateFromProPlay(db, patch, prefs.proPlayDaysWindow, () => {});
          }
        }

        // SoloQ Master+ — needs Riot API key
        if (prefs.metaSource !== "proplay") {
          const cfg = await loadSettings();
          if (cfg?.apiKey) {
            const last = await getLastAggregationTimestamp();
            if (!last || Date.now() - last > META_AGG_INTERVAL_MS) {
              await aggregateFromMaster(cfg, patch, () => {});
            }
          }
        }
      } catch {
        // ignore
      }
    }, 60 * 60 * 1000); // check hourly

    // Patch poll. Cheap fetch of DDragon versions.json — if the
    // current top version differs from what we've cached, surface a
    // toast so the user can refresh their data without restarting.
    // Tracked ref so we only fire the event ON CHANGE, not every poll.
    let knownPatch: string | null = null;
    const patchTimer = setInterval(async () => {
      try {
        const latest = await fetchLatestPatch();
        if (knownPatch && knownPatch !== latest) {
          // eslint-disable-next-line no-console
          console.info(
            `[patch-poll] new patch detected: ${knownPatch} -> ${latest}`
          );
          window.dispatchEvent(
            new CustomEvent(PATCH_UPDATED_EVENT, {
              detail: { previous: knownPatch, latest },
            })
          );
        }
        knownPatch = latest;
      } catch {
        // Network blip — try again next tick. No toast, this is background.
      }
    }, PATCH_POLL_INTERVAL_MS);

    // Seed knownPatch synchronously so the first interval doesn't
    // dispatch a false-positive "patch changed" event on initial fetch.
    fetchLatestPatch()
      .then((p) => {
        knownPatch = p;
      })
      .catch(() => {});

    // First-run check immediately
    syncPersonalData().catch(() => {});

    return () => {
      clearInterval(personalTimer);
      clearInterval(metaTimer);
      clearInterval(patchTimer);
    };
  }, []);
}
