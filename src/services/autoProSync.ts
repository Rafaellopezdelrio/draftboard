// Auto-sync pro-play data in the background.
//
// Runs once on app start. Triggers if:
//   - We have no pro-play data for the current patch, OR
//   - Last sync was >7 days ago
//
// Silent: no progress UI, no errors shown to user. Failures fall back to
// op.gg data alone (already loaded synchronously).

import { getDb, isTauri } from "../db/client";
import { aggregateFromProPlay } from "./proPlayAggregator";
import { fetchLatestPatch } from "./dataDragon";
import type { ChampionDb } from "../types/champion";

const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface ProSyncMeta {
  lastRun: number | null;
  lastPatch: string | null;
}

/**
 * Read when/what patch we last synced for pro play.
 */
async function readProSyncMeta(): Promise<ProSyncMeta> {
  if (!isTauri()) return { lastRun: null, lastPatch: null };
  const db = await getDb();
  const rows = await db.select<Array<{ key: string; value: string }>>(
    "SELECT key, value FROM aggregation_meta WHERE key IN ('proplay_last_run', 'proplay_last_patch')"
  );
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    lastRun: map.has("proplay_last_run") ? Number(map.get("proplay_last_run")) : null,
    lastPatch: map.get("proplay_last_patch") ?? null,
  };
}

/**
 * Decide whether to trigger a fresh pro-play sync.
 *
 * Patch change ALWAYS triggers (new patch = new meta = stale data).
 * Same-patch only triggers if >7 days since last sync (incremental refresh).
 */
function shouldSync(meta: ProSyncMeta, currentPatch: string): boolean {
  if (meta.lastPatch !== currentPatch) return true; // patch change → fresh data
  if (meta.lastRun === null) return true; // never synced
  if (Date.now() - meta.lastRun > STALE_AFTER_MS) return true; // stale
  return false;
}

/**
 * Persist the patch we just synced for (so we detect changes next time).
 */
async function markPatchSynced(patch: string): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  await db.execute(
    `INSERT INTO aggregation_meta (key, value) VALUES ('proplay_last_patch', $1)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [patch]
  );
}

/**
 * Entry point — call ONCE on app startup. Returns immediately, runs sync
 * silently in the background.
 *
 * @param db loaded champion db (needed for name→key mapping inside aggregator)
 */
export function startAutoProSync(db: ChampionDb): void {
  if (!isTauri()) return; // browser dev — skip

  // Fire-and-forget; do not await
  (async () => {
    try {
      const currentPatch = await fetchLatestPatch();
      const meta = await readProSyncMeta();

      if (!shouldSync(meta, currentPatch)) {
        // eslint-disable-next-line no-console
        console.log(
          `[proSync] up-to-date (patch ${currentPatch}, last run ${
            meta.lastRun ? new Date(meta.lastRun).toISOString() : "never"
          })`
        );
        return;
      }

      // eslint-disable-next-line no-console
      console.log(
        `[proSync] starting background sync for patch ${currentPatch}` +
          (meta.lastPatch && meta.lastPatch !== currentPatch
            ? ` (was ${meta.lastPatch})`
            : "")
      );

      const result = await aggregateFromProPlay(db, currentPatch, 14, () => {
        // silent — no progress UI
      });

      await markPatchSynced(currentPatch);

      // eslint-disable-next-line no-console
      console.log(
        `[proSync] done: ${result.games} pro games → ${result.rows} aggregate rows`
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[proSync] background sync failed:", e);
    }
  })();
}
