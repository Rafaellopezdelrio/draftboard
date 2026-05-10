// Background job scheduler — keeps meta data fresh and personal stats up to date
// without user intervention.

import { useEffect } from "react";
import { syncPersonalData } from "../services/personalDataSync";
import { getLastAggregationTimestamp } from "../services/aggregateRepo";
import { aggregateFromMaster } from "../services/metaAggregator";
import { fetchLatestPatch } from "../services/dataDragon";
import { loadSettings } from "../services/settingsRepo";

const PERSONAL_SYNC_INTERVAL_MS = 5 * 60 * 1000; // every 5 min
const META_AGG_INTERVAL_MS = 12 * 60 * 60 * 1000; // every 12h

export function useScheduledJobs() {
  useEffect(() => {
    // Personal data: try every 5min while client is open
    const personalTimer = setInterval(() => {
      syncPersonalData().catch(() => {}); // silent fail, will retry
    }, PERSONAL_SYNC_INTERVAL_MS);

    // Meta aggregation: only if Riot API key configured + last run > 12h ago
    const metaTimer = setInterval(async () => {
      try {
        const cfg = await loadSettings();
        if (!cfg?.apiKey) return; // skip if no key
        const last = await getLastAggregationTimestamp();
        if (last && Date.now() - last < META_AGG_INTERVAL_MS) return;
        const patch = await fetchLatestPatch();
        await aggregateFromMaster(cfg, patch, () => {}); // silent
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
