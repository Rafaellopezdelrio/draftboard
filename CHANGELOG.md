# Changelog

All notable changes to Draftboard are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/);
versions match the Tauri app version + the `vX.Y.Z` git tags.

## [Unreleased] — planned as 0.5.0

Draft for the next release. 0.4.1 and 0.4.2 were never published, so 0.5.0
ships everything below them too. Before tagging: play one real game (overlay
focus, auto runes, champ-select capture) — see docs/handoff.md.

### Added
- **Pro build panel (lolvvv.com)**: runes, skill order, first three items,
  boots and spells from pro accounts' soloQ + esports games over ~5 patches,
  with one-click rune import. Shown for the champion's main role.

### Changed
- **Tauri 2.12** and every plugin on its latest 2.x. The in-game overlay is
  now explicitly non-focusable so it never steals focus from League.
- Voice coach reads a K/D/A as a score ("11 asesinatos, 7 muertes y 15
  asistencias"), not as a date; the "you die too much" warning only fires
  when deaths outweigh your kills + assists.
- Diagnostics no longer flags the Riot / AI keys as missing: the Draftboard
  server provides both.

### Fixed
- Player search accepts a full `Name#TAG` typed in the name box; clearer
  not-found message; op.gg link opens the right region.
- "Reset all preferences" actually resets them in the desktop app, and no
  longer hangs if the reset fails. Preferences export to a file works again.
- Curated matchup tips show for champions whose internal id differs from
  their name (Miss Fortune, Wukong…) and for LeBlanc.
- A failed pro-play download keeps the previous data instead of wiping it,
  and Settings reports the failure instead of "synced 0 games".
- Build panel never shows the previous champion's runes/items after a quick
  switch; "Retry" can't overwrite a newer champion's build.
- Tier list: failed refreshes are reported and the filter rolls back; the
  champion count matches the visible rows.
- Lobby scout remembers if you collapsed it; enemy scout retries players that
  failed once.
- English UI: "not in game" lookups no longer error, and the AI coach no
  longer gets Spanish text.
- Patch notes banner parses Riot's new layout; Locke and Yunara get roles and
  archetypes; Fiddlesticks shows in dpm.lol meta.

### Security
- Rust dependencies past 10 RustSec advisories (rustls stack, h2,
  quinn-proto, zip via the updater 2.14 bump); `cargo audit` is green.

### Internal
- Test suite 961 → ~1,600 tests, coverage 36% → 70% statements; the
  coverage push surfaced and fixed 18 real bugs.

## [0.4.2] — 2026-08-05

Security and supply-chain hardening, plus the test suite that guards it.

### Security
- **BYO AI keys are encrypted at rest** with Windows DPAPI — a stolen prefs
  file no longer hands over your Groq / Anthropic / Gemini keys.
- **Blocking advisory gates in CI**: `npm audit` (prod deps, high+) and
  `cargo audit` (RustSec) now fail the build instead of warning. Known-accepted
  Rust advisories are documented with justification in
  `src-tauri/.cargo/audit.toml`.
- Fixed a `quinn-proto` denial-of-service advisory in the Rust dependency tree.

### Fixed
- ConfirmDialog no longer swallows a stray Enter as a confirmation.
- CountUp retargets mid-flight instead of animating to a stale value.
- Draft win-probability label and the curated matchup tips now follow the
  interface language (they were pinned to Spanish / to the AI coach language).

### Internal
- Playwright smoke suite revived and gated in CI — it had rotted silently for
  months because nothing ran it.
- `scripts/screenshots.mjs` regenerates the README screenshots from the dev
  server.

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
