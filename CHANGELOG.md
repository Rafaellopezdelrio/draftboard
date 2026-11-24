# Changelog

All notable changes to Draftboard are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/);
versions match the Tauri app version + the `vX.Y.Z` git tags.

## [Unreleased]

### Changed
- Post-game coach measured on 40 Master+ EUW games (80 players per position).
  "Few control wards" fired on 74-93% of top, mid, ADC and jungle players:
  support keeps "one every 8 min", the jungler is warned only for none, and
  a laner without any gets a note instead of a warning. "Low kill
  participation" now has a bar per position (top 20%, mid/ADC 33%,
  jungle/support 40%); it flagged 61% of the tops. Strong warnings now fire
  on 8-33% of those players. The control ward text says "placed" (it counts
  wards placed, not bought).
- Jungle farm targets raised to what junglers farm today: other junglers in
  Gold games average 6.4 CS/min and Master+ 7.3, but the targets were 4.8 and
  5.9, so "Good farm" praised ~90% of them. Now Gold 6.3, Master+ 7.3
  (Silver 5.5, Iron-Bronze 4.5, Diamond 6.8): "Good farm" ~45%, "could farm
  more" ~20-25%, as in the lanes.
- Vision targets: support 1.6 → 2.5 a minute (supports average 2.5-2.7, so
  "Very low vision" never fired for one) and mid 0.8 → 0.7 (like top and ADC;
  it flagged twice as many mids). It now fires on 7-19% of each position.
- "Compared with your rank" (Trends) uses measured medians instead of
  hand-picked numbers: Gold-Plat and Master+ from the same games, Emerald-
  Diamond between them, Iron-Silver keeping its old gap to Gold. The old
  table had Gold supports at 1.6 vision a minute (real 2.5), Gold junglers at
  5.2 CS (real 6.4) and Gold deaths at 0.27 a minute (real 0.21). Mid damage
  share target 27% → 24% (Master median).
- The gentle "ended on the yellow trinket" note is now for mid only and waits
  for 25 min instead of 20: Master+ mids are still on yellow in 45% of 20-25
  min games but only 17-18% of longer ones. Top no longer gets it: Master+
  tops keep the yellow trinket in 44-67% of games past 25 min.
- Farm targets for top, mid and ADC are now the same medians "Compared with
  your rank" uses. Gold top was 6.3 CS/min against a real 7.1, so "Good
  farm" praised 67% of Gold tops while Trends marked the same number below
  the median. "Good farm" now goes to about half the players of every
  position, in Gold and in Master+ games.

## [0.6.8] — 2026-11-24

From a tester (24/11): "advise champions against what the rival picked".

### Added
- Once your lane rival picked, each pick says how it does against them by
  name: "vs Darius you win 54 of 100" / "⚠ vs Darius it is hard: 46 of 100"
  (op.gg, your elo; only with enough games).
- Team mode: once the lane rival picked, what fits the style AND beats them
  comes first; the rest keeps the usual order.

## [0.6.7] — 2026-11-24

From the first day of the closed test (testers' messages, Rafael's games).

### Added
- Team mode: with five friends in the lobby on Summoner's Rift (Flex,
  Clash, normal draft, customs) a "Team mode" card offers five styles,
  marks the one most of the group can play (from each member's top
  masteries) and, once picked, shows the champions that fit first, tagged.
  Solo, duo and trios unchanged.
- Home card: the coach's three key points for jungle games (two to fix, one
  done well) instead of a generic line.
- Rival-scout voice and toasts also in the simple draft view.
- Trinket swap timed per role from trips to base: support after the support
  item places wards, jungle by the second trip, ADC after level 9.

### Fixed
- Fiddlesticks is no longer told to swap his locked trinket.
- Trinket "never swapped" waits for a real trip to base; low kill
  participation no longer says "join every fight".
- 7-day plan opens on this week's plan and warns when it could not be saved.
- AI answers in Spain Spanish (no "vos").
- A voice line cut off by a newer one is no longer repeated by the PC voice.
- Off-meta lane positions also settled for games read from the LoL client.

## [0.6.6] — 2026-11-23

From two real games (Ornn and Mordekaiser top) and a champ-select screenshot.

### Added
- Post-game coach follows the real lane opponent from minute 3-14
  positions (lane swaps included), says whether the lane was won, even or
  lost at minute 14 and how many of the opponent's early kills were on
  teammates, and after a loss names the matchup that fell furthest behind.
- Deaths in team fights counted apart; deaths in fights taken outnumbered
  (2+ fewer players) flagged with a "rotate instead" tip.
- Gentle trinket note for top and mid (info only, 20+ min on the yellow).
- Matchup plan: 4th-6th items from the champion's general build; full rune
  pages (9, stat shards included) in Prepare and the matchup card.

### Fixed
- No "prioritise armor/MR" advice when two items of it are already built.
- Off-meta picks (Ezreal top) are no longer moved to their usual role when
  that leaves a team with two of a role: games keep their lane opponent.
- Enemy-scout streak / one-trick alerts and voice, and cache/reset toasts,
  were Spanish-only.

### Server (worker)
- Each IP may spend at most 80 Riot calls per 2 minutes that reach Riot;
  every 429 carries Retry-After.

## [0.6.5] — 2026-11-23

The tester build (0.6.4 was built only; users go 0.6.3 → 0.6.5).

### Security
- Rust dependencies: cookie 0.18.3 (RUSTSEC-2026-0594) and url 2.5.9
  (RUSTSEC-2026-0592).

## [0.6.4] — 2026-11-23

Built only (superseded by 0.6.5). Everything below shipped in 0.6.5.

### Added
- Natural voices (Piper) in Spanish and English: Dave and Joe by default,
  downloaded once and preloaded; a voice picker with a "try" button. The PC
  voice speaks while the natural one is still loading.
- Trinket swap reminder: from minute 15 the live coach tells a support or
  jungler to swap to Oracle Lens, and an ADC to Farsight once also level 9
  (shown until swapped, spoken once per game). The post-game coach flags a
  swap that never happened or came late.
- Anonymous install counter: one ping on first launch with the app version
  only (updates are not counted).
- With the player's yes (terms v3, box unticked by default), the anonymous
  usage counter also records which features ran or failed: champ select,
  natural voice, AI, data sources, live voice lines. Fixed names only.

### Changed
- The post-game coach reads in Spanish and English (it was Spanish only);
  positions show as top/jungle/mid/ADC/support.
- The Trends tab (vs-rank, progress, trend lines, weakest area) and the
  cache / basic-data badges read in Spanish and English; the "main leak
  changed" note names the stats in words instead of internal keys.
- Past 7-day plans can be opened in full ("Show full plan").
- SoloQ Master+ and "Pro + SoloQ" tier-list sources only appear when that
  data exists (players never have it).

### Security
- Riot and AI keys saved in plain text by older versions are encrypted on
  first load (Windows DPAPI).

## [0.6.3] — 2026-11-18

First version offered by the updater after 0.5.9 (0.6.0–0.6.2 were built
only).

### Fixed
- Account detection reads the region from the client; it was read from a
  Riot settings file that some PCs don't have (no account found / smurf
  login kept the main). Second look 30 s after the client connects.

### Changed
- Settings for players: language, update channel and the detected account
  (read-only). Region, manual Riot ID, own key and data downloads are in the
  DEV build only.

## [0.6.2] — 2026-11-18

Built only (superseded by 0.6.3).

### Added
- The app follows the account logged into the LoL client (a smurf included);
  each stored game carries its account (migration 011) and personal stats
  only read the current account's games. Older games belong to the account
  saved at the time.
- Sync runs as soon as the client connects.

### Changed
- Settings: the "Auto-detectar" button is replaced by a note (the account is
  detected on its own). The resync wipe only clears the current account.

### Fixed
- Client games are no longer stored under an account the client isn't
  logged into; the remembered rank is per account.

## [0.6.1] — 2026-11-18

Built only (superseded by 0.6.2).

### Added
- Sync downloads the whole season (since 1 January) of Ranked Solo/Duo, Flex
  and Clash games, page by page; stored games are not downloaded again.

### Changed
- Mis campeones: default view is ranked only (Solo/Duo + Flex); Clash is its
  own option. Reads again when a sync finishes.

### Fixed
- Bans: a scouted enemy main is only suggested when that champion is played
  in the player's lane.

## [0.6.0] — 2026-11-18

### Added
- "Mis campeones" view (Mi juego menu, Ctrl+K): every champion in the stored
  ranked/Clash games with record, win rate, KDA, CS, gold and vision, a total
  row and a per-lane-opponent breakdown; queue, season and search filters.
- Home rank card: solo-queue tier, division and LP (re-read after each game,
  last one remembered when the client is closed), last 10 Ranked Solo/Duo
  games and the season record with win rate.
- "Sugerencia / Error" header button: reports go to our worker (D1) and a
  failure is shown. Opt-in anonymous usage counter (unticked by default).

### Changed
- AI coach: data-picked main topic, role targets given, no "cost you the
  game" on wins.
- Item names in the UI language; build tips and the AI guide only use items
  in today's Rift shop.
- Plain messages when op.gg or the AI are down.

### Fixed
- Home record counted Arena games read from the client as Rift games.
- Error reports were never sent by published builds (no Sentry DSN).

## [0.5.9] — 2026-11-17

### Changed
- AI coach: role-aware instructions (jungle/support notes, no lane-wave advice
  for junglers), a plain "HECHOS CLAVE" block (result, who took each
  objective) it must not contradict, facts-only rule, temperature 0.3.
  Measured on 20 real jungle games before the change: 28/40 answers told the
  jungler to manage "his" wave, 10/20 games changed topic between two asks.
- AI: on Groq's per-model rate limit, fall through to the next model.
- Tier list (worker): every S wins >= 51 %, fill-ins included; general list
  graded like the per-rank one.

### Fixed
- Coach prompt no longer sends "items completed"/"first item" (a jungle pet
  read as a finished item at 0.1 min).
- AI memory capped at 200 rows on every save.

### Security
- Worker Groq proxy only forwards chat completions (POST, <= 64 KB,
  max_tokens <= 2048, n = 1); /dpm/tierlist scraping route removed.

### Internal
- Dead code removed (~1000 lines). AI coach eval harness on real games
  (src/eval, off by default).

## [0.5.8] — 2026-11-17

### Changed
- Per-rank tier list: an op.gg S needs a 51 % win rate (else A); thin lanes
  are filled up to 3 S by win rate among real picks (live on the worker since
  2026-11-17.8). Lee Sin is A in Challenger jungle.
- Trends window in plain words: no effect sizes, "cuando ganas / cuando
  pierdes", ✓/✗ marks, Spanish rank and lane names.
- Builds from our own data: most-played build first.
- Settings: best-players download uses 🌍; ranked tooltip in plain words.

### Fixed
- Cho'Gath and Qiyana jungle were hidden by the old hand role map, in the
  tier list and in pick advice; op.gg lane lists now count.
- Trends: everything under the filters scrolls inside the window.
- "Best for this game" could replace your #1 on a one-pick list.

### Internal
- Mutation testing (Stryker) and seeded property tests: pick engine catches
  90 % of injected faults (was 41 %), tier grading 92 % (was 72 %).

## [0.5.7] — 2026-11-17

### Added
- Champion list per rank again, from op.gg's own numbers for that rank
  (dpm.lol blocks our server): rank selector in Spanish, op.gg's own grade
  per rank (about 5 S per lane instead of half the list), "few games" flag
  under 1000 games, rates without a fake decimal.
- "Best for this game": the best draft fit outside your champions, shown
  apart when it is clearly better.

### Changed
- Pick advice: your champions filter, the game decides. Lane matchup
  (lane opponent counted double) and the enemy composition (divers,
  assassins, poke) weigh far more; comfort is a step, so inside your pool
  the draft picks. On the owner's jungle drafts: losing lanes 12 → 1.
- Mastery counts by when you last played the champion; the "your main"
  boost needs this month.

### Fixed
- Opening the app waits at most 2.5 s for the per-rank list; a missed rank
  list keeps the rank selector so you can try again.
- Simple view: "ganas X de cada 100 con él" now shows.

## [0.5.6] — 2026-11-17

### Added
- An app left open looks for a new version every 30 minutes (it only
  checked at start).
- Long downloads from Settings (pro games, ranked, best players) keep
  running after the dialog is closed: the footer shows the progress and how
  it ended, Settings shows it again when reopened, and a second download
  cannot be started on top.

### Changed
- "Update with the best players" replaces the multi-region sync: the 100
  Challenger players with the most LP in Korea and in Europe, ranked solo
  games only, both regions at once. About 25 minutes (the old one took the
  first 150 entries of the unsorted Master list in three regions, close to
  three hours).
- When a download ends the champion data is loaded again in place; the
  "reload the app" hints are gone.

### Fixed
- A refused Riot call now waits the time Riot asks for instead of a fixed
  5 seconds, so a busy region no longer drops players from a download.

## [0.5.5] — 2026-11-16

### Added
- Pro-play data now comes from Riot Games Open Access powered by GRID (the
  official LoL Esports feed), through Draftboard's server. Leaguepedia stays
  as the fallback when GRID is unavailable.

### Fixed
- Clean installs: features no longer depend on the user having pressed save
  in Settings. The account is read from the open LoL client and resolved by
  itself, so the post-game coach, live game, enemy scouting and enemy mains
  work out of the box. Player search uses the client's region.
- AI coach is on by default; two AI buttons were locked behind a personal
  key although the server already covered them.
- Errors: Riot failures through the server say what happened in plain
  words; one toast per outage instead of one per data source; a failed
  enemy lookup is retried instead of caching an empty profile; a Riot
  failure in player search no longer reads as "not on this server".
- Simple mode: the reason under the win chance matches the number, pending
  picks are counted from the client (ARAM, hidden enemies), the board clears
  after a game, buy advice in plain words, lanes and ranks in Spanish.
- Texts: welcome, terms, settings and health labels rewritten; the server
  address box only shows when it was changed; technical Riot buttons moved
  into a collapsed section; the paused dpm.lol option is labelled op.gg.

## [0.5.4] — 2026-11-13

### Fixed
- Tier list: with dpm.lol paused the list comes from op.gg, which has one
  list for all ranks, yet the rank/region selectors and a "dpm.lol · Gold"
  title still showed, so switching Gold to Challenger changed nothing. The
  selectors now show only for live per-rank data; otherwise a note says it's
  one list for all ranks.
- Removed an English debug counter ("7 entries · 4 in TOP") shown to users.

## [0.5.3] — 2026-11-12

### Fixed
- Riot ID in Settings: names with lookalike letters (ÐΛΣRΣN) failed there
  while the player search found them; both now use the same lookup.
  "Name#TAG" typed into the name box is split, a "#" in the tag is dropped.
- Settings no longer suggests getting a Riot key: the own-key box only shows
  if a key is saved or Draftboard's server is turned off. A Riot 401/403
  through the server says it's on our side instead of "regenerate your key".
- The enemy-mains warning ("their Zed plays it a lot") needed a personal
  Riot key, so normal users never saw it; it now works through the server.
- Clearer Riot ID error text.

## [0.5.2] — 2026-11-12

### Fixed
- Counters: the pick list only said "good against them" when a champion
  averaged over 55% against the whole enemy team, which real matchups
  (47-53%) almost never reach, so it never showed. The bar is now 52% (and
  48% for "hard lane"), and pairs with under 50 games are ignored so an
  off-lane enemy's tiny sample can't drown the real lane matchup.
- Rune icons: if the rune list failed to download at startup, every rune
  icon stayed broken until restart; it now retries.

### Added
- Simple champ select, top strip: win chance with its main reason, what
  your team lacks (or the enemy damage type), and a warning when an enemy
  plays their champion a lot.
- "Get ready" step: runes, summoner spells and skill order for your pick,
  with one button to put runes and spells in the client (they are still
  set automatically on lock-in).
- "How you win": the game plan in two plain sentences.
- Tap an enemy in the bottom bar to mark them as your lane opponent; a note
  says when the lane opponent isn't known yet; a line shows how many
  champions are left to pick; a short first-time tour.
- Simple in-game screen: how each lane is doing in gold (items bought plus
  farm, approximate).

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
