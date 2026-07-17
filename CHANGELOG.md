# Changelog

All notable changes to Draftboard are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/);
versions match the Tauri app version + the `vX.Y.Z` git tags.

## [0.4.1] — 2026-07-17

Recovery release for Riot's **anonymized champ select**, which could leave the
draft board — and everything keyed off it — empty for the whole game.

### Fixed
- **In-game draft panels restored**: ally/enemy champions now derive from the
  Live Client player list (never anonymized), so comp analysis, matchup tips,
  win conditions and matchup-aware builds work all game.
- **Loading-screen gap bridged**: the board fills from the gameflow session's
  teams the moment the game is created (side resolved strictly by identity —
  never guessed; a populated board is never overwritten).
- Empty draft board auto-hides (build/coach rail takes the full width) and the
  Build tab falls back to Picks instead of sitting on an empty panel.
- Build archetype names/descriptions localized (were hardcoded Spanish).
- History time-ago, queue/role filter tabs, Toggle/Toaster aria-labels and the
  coach Riot-ID error localized.

### Added
- **AD/AP/true-damage split bars** in the comp analysis panel — your team AND
  the enemy's, so you can balance your comp's damage and read the enemy's for
  itemization (armor vs MR); a true-damage badge warns resists won't help.
- `[lcu-shape]` diagnostic: when the local champion can't be resolved in champ
  select, the raw session shape is captured to the disk log (throttled) so the
  remaining root cause can be pinned from any real game.
- Pro-play sync now batch-inserts (faster) and the dpm.lol tier list is cached
  per bracket for 30min.

### Fixed (post-game coach)
- **Laning verdict now measured at ~14:00** via the match timeline instead of
  end-of-game CS/gold totals — winning lane + first tower no longer reads as
  "you lost lane" just because a splitpusher out-farmed you over 30 minutes.
- Dev-only: guarded against double React root creation on hot reload.

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
