---
name: draftboard
description: >
  Project knowledge base for the Draftboard LoL draft advisor (Tauri 2 + React
  19 + TS + SQLite + Cloudflare Worker). Use when working on this app's data
  layer, op.gg / dpm.lol scraping, the Cloudflare Worker proxy, the suggestion
  engine, SQLite migrations, or release/deploy. Captures the op.gg API map,
  scraper gotchas (slugs, roles, tiers), the verify runbook, and decisions
  already proven infeasible — so they aren't re-derived every session.
---

# Draftboard — project knowledge base

LoL draft advisor desktop app. Champ-select suggestions + builds + AI coach.
Stack: Tauri 2 (Rust) + React 19 + Vite 7 + TS strict + Tailwind 4 + SQLite
(tauri-plugin-sql) + a Cloudflare Worker proxy. 100% official APIs (nothing
bannable: no memory reads, no game OCR).

## Data flow

| Source | What | Where |
|--------|------|-------|
| LCU (lockfile) | champ-select live state | `src/state/lcuSync.ts`, `src-tauri/.../lcu.rs` |
| Live Client (localhost:2999) | in-game champ/role/KDA | `src/services/liveClient.ts` |
| Riot API | match history, mastery, rank | via Worker `/api/{region}/...` |
| CF Worker | proxy + scrapers + edge cache | `cloudflare-worker/` (git submodule → GitLab) |
| op.gg / dpm.lol / u.gg | meta, matchups, builds, pro | scraped by the Worker |

Worker base URL is hardcoded in `src/config.ts` (`WORKER_BASE_URL`) AND is the
default `prefs.riotProxyUrl` (`src/state/prefsStore.ts`). App talks to op.gg
ONLY through the Worker.

## op.gg data cheatsheet (hard-won)

Worker endpoints:
- `GET /opgg/matchups?champion={slug}&role={r}&tier={t}` — full ~50-champ
  matchup grid (HTML scrape). `winRate` = the champion's WR vs that opponent.
- `GET /opgg/build?champion={slug}&role={TOP}` — items/runes/skills (MCP).
- `GET /opgg/tierlist` — lane meta (MCP `lol_list_lane_meta_champions`).
- `GET /dpm/tierlist?tier=&platform=&timeframe=` — dpm.lol meta (tier-aware).
- `GET /health` → `{ ok, service, version }`. `version` = `WORKER_VERSION`,
  bumped per `wrangler deploy` → tells you which build is actually live.

op.gg MCP (`POST https://mcp-api.op.gg/mcp`, JSON-RPC, Python-repr text result):
- `lol_get_champion_analysis` — items/runes/counters/synergies. Args:
  `champion` UPPER_SNAKE (`JARVAN_IV`), `position` `top|jungle|mid|adc|support`,
  `game_mode: "ranked"` (REQUIRED), optional `tier`, `desired_output_fields`.
- `lol_list_lane_meta_champions` — args `position`, `lang`. **No tier param.**

### GOTCHAS (these caused real bugs)
- **Role matters more than you think.** `jarvaniv/top` → 0 matchups (off-meta),
  `jarvaniv/jungle` → 56. Always query the champion's *actual* role. Empty
  result is usually wrong role, not a broken scraper.
- **op.gg uses `adc`, not `bottom`** for the role param.
- **Slug = `ddIdToOpggKey(ddId)`** (`src/services/opggMatchups.ts`) = lowercased
  DDragon id. op.gg uses the INTERNAL id: Wukong = `monkeyking` (NOT `wukong`,
  which 404s). Verified: every other DDragon id lowercases to the right slug.
- **Don't cache an empty parse.** Worker handlers skip `cache.put` when the
  parse yields 0 rows (a layout change would otherwise pin dead data for hours).

## Suggestion engine

`src/engine/suggestionEngine.ts`. Score = weighted sum (ranked):
counter .20 · meta .20 · synergy .10 · archetype .10 · (+ personal/mastery).
- counter: `liveCounters` (op.gg matchups, inverted) > sparse personal
  `db.counters`. Wired via `useEnemyCounters` → `fetchEnemyCounters`. Tier comes
  from the player's LCU rank (`opggTierForRank`).
- meta: dpm/op.gg tier → S+/S/A/B/C/D bucket.
- archetype: fills missing engage/frontline/peel (`detectMissingArchetypes`).

## DB / migrations

SQLite, append-only migrations in `src/db/migrations/NNN_*.sql`, registered in
`src-tauri/src/lib.rs` (`Migration { version, description, sql: include_str!.. }`).
Rules: NEVER edit an applied migration — add a new one. Aggregate tables
(`*_aggregate`) PK is `(champion_id, position, ..., patch)` — `patch` is LAST,
so a `WHERE patch=?`-only query needs its own index (see migration 007).

## Release / verify runbook

- **Verify data layer (no game needed):** `npm run verify:data`
  (`scripts/verify-data.mjs`) — probes health/counters/Wukong-slug/build/meta
  against the live Worker. Run after deploy.
- **Deploy Worker:** `cd cloudflare-worker && wrangler deploy` (bump
  `WORKER_VERSION` first so `/health` reflects it). Submodule → push GitLab too.
- **Rebuild app:** `npm run tauri build -- --no-bundle`.
- **Gates before commit:** `npm run typecheck && npm run test && npm run rust:check`.
- Auto-updater manifest = Worker `LATEST_VERSION`; must match tauri.conf.json +
  Cargo.toml versions (guarded by `cloudflare-worker/src/updater.test.js`).

## Dead-wire audit (run proactively — don't wait to be told)

Recurring bug class: a feature is wired + runs but reads empty/stub data, so its
output is silently constant. Already found + fixed: counter dimension, draft
win-prob counter factor, checkBuildVsEnemy, saveLessonPlan, the drafts table.
Hunt these:

- **Stubs feeding real features** — a fn called in a pipeline that always
  returns `[]`/`null`/`0.5`. `grep -rn "return \[\];" src/engine src/services`.
  (Was: `murderBridge.fetchCounters` → `db.counters` permanently empty.)
- **Constant scorers** — an engine factor reading a sparse/never-populated
  source (db.counters before liveCounters; personal stats for a new user) so its
  weight changes nothing. Trace each scoring dimension to its data source.
- **Dropped upstream data** — a richer field exists but isn't mapped (match-v5
  magic/physical damage was discarded → checkBuildVsEnemy stayed a no-op).
- **Never-called writers** — a save/persist fn defined but never invoked
  (saveLessonPlan; drafts). grep the writer name for call sites.

Fix: feed the real data, map the dropped field, or delete the dead code
honestly — never leave a no-op pretending to work.

## Verified INFEASIBLE — don't re-attempt

- **Synergy from op.gg MCP:** `data.synergies` samples are single-digit games
  (Lee Sin max ~10), WRs all 0.52–0.55 = noise. Building the synergy dimension
  on it is worse than the current heuristic. Killed.
- **Tier-aware meta via op.gg tierlist:** `lol_list_lane_meta_champions` has no
  tier param. Use dpm.lol (`/dpm/tierlist`, already tier-aware) for elo-specific
  meta instead.

## Constraints (from user's CLAUDE.md)

Never commit keys/.env. Never hardcode Riot/minisign/Groq keys. Nothing
bannable (official APIs only). Commits only when explicitly asked. Spanish
caveman for chat, English code comments.
