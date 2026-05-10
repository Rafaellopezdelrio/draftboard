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

const PERSONAL_SYNC_INTERVAL_MS = 5 * 60 * 1000; // every 5 min
const META_AGG_INTERVAL_MS = 12 * 60 * 60 * 1000; // every 12h

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

    // First-run check immediately
    syncPersonalData().catch(() => {});

    return () => {
      clearInterval(personalTimer);
      clearInterval(metaTimer);
    };
  }, []);
}
