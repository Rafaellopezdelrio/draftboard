# LoL Draft Advisor — Implementation Plan

**Date:** 2026-05-09
**Design doc:** [2026-05-09-lol-draft-advisor-design.md](2026-05-09-lol-draft-advisor-design.md)

## Phases

### Phase 1 — Project scaffolding

- Install prerequisites: Node 20+, Rust toolchain, Tauri CLI
- `npm create tauri-app@latest lol-draft-advisor -- --template react-ts`
- Add dependencies: `tailwindcss`, `zustand`, `@tanstack/react-query`, `@tauri-apps/plugin-sql`
- Configure Tailwind, dark theme tokens
- Verify `npm run tauri dev` opens an empty window

### Phase 2 — Champion data layer

- `services/dataDragon.ts`: fetch latest patch + champions list, cache to disk via Tauri FS
- `services/cdragon.ts`: role icons
- `services/murderBridge.ts`: fetch counter/synergy matrices
- Loader screen on first launch while cache populates
- **Test:** unit tests for cache invalidation when patch changes

### Phase 3 — Manual draft mode (UI first, no LCU)

- `components/DraftBoard.tsx`: 5 ally + 5 enemy slots + bans
- Click to open champion picker modal, click champion to assign
- `state/draftStore.ts` with Zustand: picks, bans, current turn
- **Test:** manual click flow assigns champion correctly

### Phase 4 — Suggestion engine (no personal data yet)

- `engine/suggestionEngine.ts`: pure function `(draftState, championDb) => ScoredChampion[]`
- Composite score: 40% counter, 30% synergy, 20% meta tier, 10% archetype fill
- `engine/compAnalyzer.ts`: detects missing archetypes
- `components/SuggestionPanel.tsx`: top 5 cards with icon + name + 1-line reason + color
- **Test:** unit tests with fixture drafts → known expected suggestions

### Phase 5 — LCU integration

- `src-tauri/lcu.rs`: locate `lockfile`, parse port + auth token, open WebSocket to `wss://127.0.0.1:<port>`
- Subscribe to `OnJsonApiEvent_lol-champ-select_v1_session`
- Emit Tauri events to frontend on each session change
- `services/lcuService.ts`: listens, maps LCU payload to internal draft state
- Banner in UI: "Connected to client" / "Manual mode"
- **Test:** mock LCU events feed, verify state updates

### Phase 6 — Riot API + history (Level 2)

- Settings screen: input Riot ID + API key, validate
- `services/riotApi.ts`: `getMatchHistory`, `getMatch`, `getMastery`, `getRank` with rate-limit aware queue
- `db/schema.sql`: `drafts`, `matches`, `personal_stats` tables
- After each match end (LCU `EndOfGame` event), pull match result and persist
- Backfill last 20 matches on first connect
- **Test:** rate limiter does not exceed 100/2min; persistence round-trips

### Phase 7 — Personal stats integration

- `engine/suggestionEngine.ts`: blend personal winrate (last 20 games per champ) into score
- `components/StatsView.tsx`: per-champion winrate, follow-rate of suggestions, LP graph
- `components/HistoryView.tsx`: list of past drafts, filter by champ/role/result
- **Test:** suggestion score weighting verified with synthetic personal data

### Phase 8 — Polish

- Window docking next to LoL client (Tauri window positioning API)
- System tray with show/hide
- Auto-update via Tauri updater
- Onboarding tooltip on first launch
- Stale-data warnings
- Build signed installer for Windows

## Definition of Done per Phase

Each phase is done when:
1. Feature works end-to-end manually
2. Unit tests pass
3. No regressions in earlier phases
4. Committed with a descriptive message

## Risks

- **MurderBridge API instability** → mitigation: cache aggressively, fall back to Data Dragon-only mode without counter scores
- **LCU schema changes between patches** → mitigation: version-check on startup, log unknown payloads
- **Riot API key expiry** (24h dev keys) → mitigation: clear UX for renewal, app remains functional without it
- **Tauri 2 plugin maturity** (sql plugin in particular) → mitigation: pin versions, test on Windows specifically
