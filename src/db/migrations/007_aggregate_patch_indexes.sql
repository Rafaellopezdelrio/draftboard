-- Aggregate-table patch indexes (v7)
--
-- meta_aggregate and counter_aggregate are loaded with `WHERE patch = ?`
-- (aggregateRepo.loadMeta / loadCounters) on every champion-DB build. Their
-- PRIMARY KEY puts `patch` LAST (champion_id, position, ..., patch), so a
-- patch-only filter can't use it -> full table scan. counter_aggregate is the
-- worst case: champion x vs_champion x position x patch rows accumulate across
-- patches (live + proplay-*), so the scan grows every patch.
--
-- These indexes turn the patch-scoped load (and the re-aggregation
-- `DELETE WHERE patch = ?`) into an index range scan. build/rune/skill SELECTs
-- already filter champion_id+position (PK-covered) so they don't need one.
-- Additive + idempotent -- safe to re-run.

CREATE INDEX IF NOT EXISTS idx_meta_aggregate_patch ON meta_aggregate(patch);
CREATE INDEX IF NOT EXISTS idx_counter_aggregate_patch ON counter_aggregate(patch);
