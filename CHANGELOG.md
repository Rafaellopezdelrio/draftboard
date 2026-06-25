# Changelog

All notable changes to Draftboard are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/);
versions match the Tauri app version + the `vX.Y.Z` git tags.

## [0.4.0] — 2026-06-23

First release since 0.3.0 (230 commits).

### Added
- Full **es/en bilingual** UI with an always-visible language toggle in the header.
- **In-game overlay** (opt-in) rendering the live coach + scoreboard inside it.
- Objective timers including **Void Grubs**; **power-spike timing** in the live coach.
- Spoken **danger-level enemy threat** callouts at champ select.
- **AI draft coach** factoring bans, champion mastery, comp gaps and scouted enemy mains.
- Role-specific, comp-tied **win conditions**; ban-the-enemy-comfort-main suggestion.
- **Lobby scout**: smurf detection + a dodge advisor for clearly uphill lobbies.
- Real **ARAM** advice (replacing the coming-soon placeholder).
- **Rank-relative benchmarks** (your stats vs your bracket), a GPI laning dimension,
  a post-game rank benchmark and longitudinal progress synthesis.
- **Grievous Wounds** + situational rune/shard advice vs the enemy comp.

### Fixed
- Black Cleaver was wrongly flagged as a healer → false "buy Grievous Wounds" suggestion.
- In-game objective timer could read `NaN` from a malformed live event (the overlay copy
  had drifted from the panel and lost the type-guard).
- 41 fixes total across draft logic, live tracking, sync and UI.

### Changed / internal
- 22 refactors: shared `httpFetch`, `fetchProxyJson`, live timers and meta-source fallback
  extracted to single, tested seams.
- 7 perf passes; new test suites bring the total to 934 (engine + data pure logic ~100%).
- App title + favicon corrected (dropped the Vite scaffold defaults).

## [0.3.0]

### Added
- Full matchup grid (62 real entries per champion+role) with strong/weak split.
- Live game panel; comfort+meta top-picks engine.
- dpm.lol per-bracket tier list with pick-rate noise filter.
- Signed Tauri auto-updater.
- Bilingual pre-game tips.

[0.4.0]: https://github.com/Rafaellopezdelrio/draftboard/releases/tag/v0.4.0
[0.3.0]: https://github.com/Rafaellopezdelrio/draftboard/releases/tag/v0.3.0
