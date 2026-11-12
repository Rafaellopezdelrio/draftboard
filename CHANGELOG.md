# Changelog

All notable changes to Draftboard are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/);
versions match the Tauri app version + the `vX.Y.Z` git tags.

## [0.5.1] — 2026-11-12

### Fixed
- Home screen: it said "no games saved yet" while the first sync was still
  running and never looked again; it now refreshes when the sync stores games.
- Game positions: Riot sometimes reports the wrong position for a game
  (a mid Ahri stored as TOP, which the AI coach then blamed). Positions are
  now checked against the champion's usual roles, using both of Riot's
  signals, on sync and when reading games already stored.
- Installer: the install-mode page said "Instación" (a typo in NSIS's own
  Spanish file). Draftboard now ships its own texts for that page, and the
  "app is running" messages show the app name instead of {{product_name}}.
- AI answers (chat, post-game, trends, 7-day plan, draft coach, matchup
  tips) are rendered instead of shown as raw markdown: no more "**" on
  screen, lists show as lists, long lines wrap instead of scrolling sideways.

### Changed
- Every AI coach prompt shares one set of writing rules: short plain
  sentences, no jargon or acronyms, no sums or formulas, no markdown
  symbols, every point explained with its reason and an in-game example so
  anyone can follow it, one concrete thing to do next game. In the chat,
  "the last N games" now means those N.
- Settings: plain-language texts. No more "premium proxy" / "API key" talk
  on the main view; the server address only shows on hover.

## [0.5.0] — 2026-11-12

0.4.1 and 0.4.2 were never published, so 0.5.0 ships everything below them
too. Tagged at the owner's request before a full real-game pass of the new
simple screens; the items still to confirm in a real game are listed in
docs/handoff.md.

### Added
- **Simple view (new default)**: one plain screen per moment, no jargon.
  Home (last game, one thing to improve, recent record), champion select
  (ban / pick / buy in three steps) and in game (what to do now, what to buy
  next, which enemies to watch). The header drops to four entries; the full
  panels sit behind "More details".
- **One buy list**: start and first item for your lane opponent, boots and
  later items for the whole enemy team, each with its reason. Handles flex
  picks, and switches to your real lane opponent once the game starts.
- Player search finds names typed with look-alike letters (Ð, Λ, Σ…).
- The header language switch now also sets the AI coach language.
- **Build against your lane opponent**: the build panel now shows what
  players of your champion buy and run against the enemy in your lane
  (starter, core, boots, runes), your win rate in that matchup, who has the
  lane edge and a tip, from op.gg. Needs a worker deploy to take effect.
- Enemy scout now works in ranked: Riot hides the enemy team during champ
  select, so from the loading screen on Draftboard looks the enemies up via
  spectator-v5 (official Riot API) and shows each one's threat level, a
  one-line read and the team verdict (also in the collapsed panel header).
  Skips Practice Tool/TFT, ignores bots and non-5v5 modes like Arena.
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
- Rune icons in the matchup card and the aggregate rune page no longer show
  as broken images.
- The draft board is no longer wiped when the game starts (the client sends
  the emptied champ-select session twice).
- Second review round (30 issues):
  - Client writes: saving the Draftboard item set no longer wipes your other
    item sets; Flash stays on the key you use (D or F); rune pages are only
    replaced when the client reports the page limit; Apply never sends an
    illegal page; no Smite outside jungle.
  - Build panel: spell win/pick rates only show for the pair displayed;
    apply status no longer leaks to the next champion.
  - Champ select: the champion you hover stays in your suggestions and is not
    scored as a teammate; "followed suggestion" is logged correctly; AI draft
    coach clears on champion switch and uses your real lane opponent.
  - Data: backups and restores are complete and safe while the DB is in use;
    multi-region meta sync writes readable patch labels and keeps data when
    a sync fetches nothing; skill max order ties; pro-play pick rate; no
    duplicate games from client + Riot sync; patch-notes cache; champion
    abilities/lore follow the UI language.
  - Views: AI chat, champion guide, 7-day plan, coach analysis and Pro
    Players work with the built-in server (no personal key); plans are saved
    once; resync keeps your matches if the download fails; lookup finds
    players on other servers; chat replies stay in their conversation; guide
    cache respects role and language.
  - More Spanish-only texts now follow the UI language.
- Advice review (32 issues): role, mode and data fixes across the coach.
  - In game: Soul calls stop once a team has Soul; Elder timer is 6 min;
    first Baron gets a countdown from 17:00; no dragon/recall calls in ARAM
    or Arena; Serylda's Grudge uses its real item; counter items fit tank
    supports, enchanters, AD supports and assassins; counter reasons and
    champ-select voice lines follow the UI language.
  - Champ select: AI and curated matchup tips know each enemy's role (your
    lane opponent first, gank/skirmish advice for the rest); win conditions
    stop giving laner orders to junglers and supports; no SR role/ban advice
    in ARAM/Arena; ban reason shows the loss rate correctly; trade panel no
    longer asks a one-trick to swap off their main; ARAM enchanters get the
    support tip; build adaptations tell AD assassins from AP.
  - Post-game: GPI laning/objectives/versatility/aggression fit junglers and
    supports; ARAM/Arena games stay out of the rift coach; trends and
    playstyle use role-aware CS bars; "diff vs lane" only with a lane
    opponent.
  - Scout: laners get gank-awareness notes for the enemy jungler; lobby read
    leaves you out of the carry/liability list; smurf and "few games" flags
    need real signals; off-pool uses mastery points, not top-7; Smite and
    spectator targets survive champ select; ARAM gets no lane notes.
- Enemy scout notes now fit your role: as a jungler you get gank advice for
  enemy laners and invade/tracking advice for the enemy jungler (detected by
  Smite), instead of lane tips like "snowball your lane" for every enemy.
- Onboarding: skipping to manual mode while the account sync is still
  running no longer gets overwritten a few seconds later by the sync result.
- AI draft coach in English on a Spanish UI now gets the suggestion reasons
  in English instead of falling back to Spanish.
- Spanish copy: "countra a enemigos" -> "contrarresta a enemigos".
- The overlay no longer leaks its live-game event listener when it closes
  before the subscription finishes connecting.
- Command palette: Enter now runs the highlighted command when commands from
  different groups are interleaved (keyboard index followed raw order, not the
  grouped order on screen).
- The app no longer refuses to open a database whose migrations were recorded
  by a build with different line endings ("migration N was previously applied
  but has been modified"); the checksum is repaired at startup.
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
- The proxy no longer relays arbitrary Riot API calls: it only forwards the
  reads Draftboard makes (typed ids, sanitized query, 120 req/min per IP), as
  Riot's API terms forbid lending key access to third parties.
- Matchup data no longer comes from scraping op.gg's website (forbidden by
  their terms); it now uses op.gg's public MCP server. Matchups with fewer
  than 50 games are dropped. Needs a worker deploy to take effect.
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
