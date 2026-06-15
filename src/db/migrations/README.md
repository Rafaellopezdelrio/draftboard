# SQLite Migrations

Tauri-plugin-sql runs these in order on app start. Tracked in the
`__db_migrations` table — only new versions execute.

## Convention

- Filename: `NNN_short_description.sql` (zero-padded 3-digit version).
- One migration per logical change (never edit applied migrations).
- Forward-only (no Down). If a fix is needed, ship a new migration.

## Adding a new migration

1. Drop the next-numbered file here (e.g. `007_new_feature.sql`).
2. Append a `Migration { version: 7, ... }` entry in
   `src-tauri/src/lib.rs` under the `migrations` vec.
3. The next app launch applies it and bumps the user's DB to v7.

## Safety

- Run `tauri build` before tagging a release — `include_str!` is
  compile-time, missing files = compile error, not runtime crash.
- Auto-backup runs at boot (see `rolling_db_backup` in lib.rs), so a
  buggy migration can be recovered from the latest `.bak`.
- WAL mode is enabled via `preboot_db_integrity_check_and_quarantine`,
  so concurrent reads + writes work without lock contention.

## Current versions

| v | File | Notes |
|---|---|---|
| 1 | `001_initial.sql` | Initial schema: riot_config, matches, drafts, meta_aggregate, counter_aggregate, build_aggregate, rune_aggregate, skill_order_aggregate, aggregation_meta |
| 2 | `002_aggregation_tables.sql` | Extra aggregation indices |
| 3 | `003_preferences.sql` | Prefs key-value store |
| 4 | `004_matchup_tracking.sql` | Per-matchup personal stats |
| 5 | `005_ai_memory.sql` | AI conversation memory + lesson plans + champion guides |
| 6 | `006_ai_matchup_tips_cache.sql` | Cached matchup tips from AI |
| 7 | `007_aggregate_patch_indexes.sql` | Patch indexes on meta_aggregate / counter_aggregate |
| 8 | `008_chat_history.sql` | Persisted AI coach chat conversations + messages |
| 9 | `009_champion_tips.sql` | Cached AI pre-game tips per (champion, role, patch) |
| 10 | `010_match_vision_gold.sql` | Per-match vision score + gold earned (nullable) for leak analysis |
