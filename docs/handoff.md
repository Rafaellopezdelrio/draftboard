# Draftboard — Session Handoff (2026-11-17)

Internal working notes: where the repo stands, what's verified, what's still
open. Not user documentation — see [`../README.md`](../README.md) for that.

## Status

- **2026-11-18 — v0.6.3 published** (worker 2026-11-18.1, manifest checked
  live, installer 3 966 739 bytes downloads). Users go 0.5.9 → 0.6.3
  (0.6.0–0.6.2 built, never offered). Contents: Mis campeones (whole season,
  ranked first, Clash apart), automatic account + smurf separation (migration
  011 `matches.account`), player Ajustes (language/updates/account only; data
  tools DEV-only), bans filtered by lane, ELO card. In-app update from an
  installed 0.5.9 not checked yet.
- **Not released:** voice picker (88d016d). Next step on voice: test Piper
  neural voices in DEV, one Spanish and one English voice, picked by app
  language (user rule: every feature in Spanish and English). Open questions:
  new Piper models need Piper 1.5+ (web package may not load them → use older
  revision); espeak-ng phonemizer is GPL (matters if monetized); ~60 MB per
  voice, downloaded once.

- **Roadmap (2026-11-17): `docs/PLAN_CONSEJO.md`** — council verdict (stop
  polishing, closed test with 5-10 people for 3 weeks, decide on day 21), Riot
  key rules (personal key = small private community only; public download is a
  violation), plan B per dependency. Work through it step by step.
- **2026-11-17 — user reports (not released):** published builds had no
  Sentry DSN, so error reporting was off and the feedback box said "sent"
  while nothing arrived. Now: header button "Sugerencia / Error" → worker
  `POST /report` → D1 `draftboard-reports`; failures are shown. Automatic
  errors still use the Sentry SDK for capture only, with a transport that
  posts a scrubbed summary to `/report` (nothing goes to Sentry). Opt-in
  usage counter `POST /usage` (random install id, views per day). Consent is
  an unticked box in TermsGate (TERMS_VERSION 2); `telemetryEnabled` now
  defaults to false. Worker 2026-11-17.15 deployed with D1
  `draftboard-reports` (live POST checked, test rows deleted). App side ships
  with the tester build. Reading them: `docs/REPORTS.md`.
- **2026-11-17 — v0.5.9 published** (manifest on worker 2026-11-17.14): AI
  coach by role + facts block + facts-only, model fall-through on Groq 429.
  Next-version AI fixes committed (cf791bf: data-picked main topic, role
  targets, no "cost you the game" on wins) — not released. Eval on the same
  20 jungle games (40 answers), before → 0.5.9 → cf791bf: lane-wave advice to
  a jungler 28 → 2 → 0; "cost you the game" on wins 1 → 3 → 0; first-drake
  owner wrong 4 → 0 → 0; numbers backed by the data 94 → 91 → 98 %; both
  answers open on the data-picked topic in 18/20 games. Run it again with
  `AI_EVAL=<dir with ids.json> npx vitest run src/eval/aiCoach.eval.test.ts`.

- **2026-11-17 — v0.5.8 published** (tag v0.5.8, manifest live on worker
  2026-11-17.9): tier list S needs a 51 % win rate, Cho'Gath/Qiyana jungle
  back, Trends in plain words, builds most-played first, more tests.
  Installer answers 200, `/updater/latest.json` serves 0.5.8. Not verified:
  the in-app update 0.5.7 → 0.5.8 and a live champ select.
- **2026-11-17 — cleanup + security pass.** Dead code out (2 modules,
  25 exports, legacy op.gg parser; −1028 lines); aiMemory now capped at 200
  rows on every save (the trim existed but was never called). Security
  review: npm audit 0; no secrets in git; CSP strict (`script-src 'self'`);
  ability HTML goes through an allowlist sanitizer; SQL is parameterised
  (table/column names are constants); Riot relay is path+query allow-listed;
  BYO AI keys encrypted with DPAPI. **Found and fixed (HIGH):** `/groq/*`
  forwarded ANY Groq endpoint with our key (audio, files, batches, unlimited
  tokens). Worker 2026-11-17.13 allows only POST chat completions, body ≤
  64 KB, max_tokens ≤ 2048, n = 1, no stream (`groqProxy.test.js`).
  Deployed and checked live: models/audio/files → 404, chat → 200 "ok".
  Left as LOW: http/CSP allow `*.workers.dev` (could be our subdomain only);
  per-IP limit lives in each Cloudflare datacenter's cache.
- **2026-11-17 — worker 2026-11-17.12:** every S wins ≥ 51 %, in every list.
  The general (fallback) list now uses `rankLaneRows` like the per-rank one
  (old 0-2 → S + crutch blacklist gone: S 74 → 20, Lee Sin 48 % was S);
  fill-ins also need 51 %, so a lane may have fewer than 3 S (Iron mid/ADC
  have 1). Stored rank lanes are regraded when served, so a rule change
  applies at once without cold rebuilds. Live scan: 50 rank×lane lists +
  general, 0 S under 51 %. Owner's rule: criteria over number of S.
- **2026-11-17 — worker 2026-11-17.10:** removed the public `/dpm/tierlist`
  route (scraped dpm.lol against its terms; the app stopped calling it on
  2026-10-29). The app's paused dpm code stays until dpm.lol answers.
- **2026-11-17 — v0.5.7 published** (tag v0.5.7, manifest live on worker
  2026-11-17.7): per-rank champion list from op.gg, op.gg grades per rank,
  pick advice where the draft decides inside your pool, "best for this
  game". Installer answers 200, `/updater/latest.json` serves 0.5.7. Not
  verified: the in-app update 0.5.6 → 0.5.7 and a live champ select.
- **2026-11-17 — v0.5.6 published** (tag v0.5.6, manifest live on worker
  2026-11-17.1): updater recheck, "best players" sync, background downloads.
  Installer answers 200, `/updater/latest.json` serves 0.5.6. Not verified:
  the in-app update from an installed 0.5.5, and a real game on 0.5.6.
  CI was red since before 0.5.5 for two stale reasons, fixed in 20fa4d5:
  e2e smoke looked for English labels ("Patch", "TOP", "Tier List") and
  RUSTSEC-2026-0538 (quinn-udp → 0.5.16, lockfile only; landed after the
  0.5.6 tag, so the 0.5.6 binary still has 0.5.14).
- **2026-11-16 — v0.5.5 published; "best players" sync + updater recheck
  built (released in 0.5.6).**
  - **Working rule from the owner (2026-11-16): never start something new
    until the previous thing is finished** — done, checked in the real app
    and released if it applies. Open items go first, one at a time.
  - **v0.5.5 (released, manifest live):** pro games from GRID Open Access
    with Leaguepedia as fallback (`services/gridProPlay.ts`,
    `proPlayAggregator.ts`; GRID has no lanes → roles from
    `inferEnemyRoles`; ban rate only with GRID), clean-install audit
    (features work with no saved account; scout uses the client's region
    through the proxy), AI on by default, plain texts. GRID is
    non-commercial: fine while the app is free.
  - **Released in 0.5.6:**
    - Updater: an open app re-checks every 30 min until an update is found
      (`UPDATE_RECHECK_MS`, `useUpdateCheck`).
    - Settings → "🏆 Actualizar con los mejores jugadores"
      (`aggregateMultiRegion`): top 100 Challenger by LP in KR and in EUW,
      ranked solo only (`queue=420`), both regions in parallel, timeline for
      every other match. The old button took the first 150 entries of the
      unsorted 10,000-entry Master list in KR/EUW/NA (≈2 h 50 min, not the
      "~30 min" it claimed). `riotApi.ts` keeps one rate limiter per
      regional cluster (Riot limits are per region).
    - The single-region sync (`aggregateFromMaster`, automatic job with a
      personal key) is unchanged: still the first 150 Master entries.
  - **Worker 2026-11-16.6 (deployed):** allow-list takes
    `challengerleagues` and the `queue` param on match ids; per-IP Riot
    limit 300/min; a refused Riot call forwards `Retry-After` and
    `X-Rate-Limit-Type` so the app waits what Riot asks. 0.5.6 needs this
    worker (0.5.5 does not).
  - **Measured through the worker (2026-11-16, ~22:45 CET):** KR 689 unique
    matches ≈ 24 min, EUW ≈ 700 ≈ 25 min at ~47 requests/min per region.
    Europe's match service answers 429 `x-rate-limit-type: server` in bursts
    (≈9 calls pass, then ≈25 s refused) even at one call per 10 s; KR never
    did. Peak-hour EUW can stretch the run to 30–35 min.
  - **Real-app run:** done 2026-11-16 23:02→23:27 (24.5 min) in the dev app,
    through the worker, no saved key. 100 + 100 players listed in 2 min, 689 KR
    + 708 EUW matches, none lost, no region failed. Stored for patch 16.22.1:
    312 meta rows (130 with ≥30 games, 106 with <10), 1528 counter rows (196
    with ≥10 games), 1782 rune rows, 662 build rows.
    **Weak spot found:** a build row is one exact item set, so no build has
    more than 8 games and `loadAggregatedBuilds` sorts by win rate first →
    one-game 100 % builds on top. This data is only the backup: op.gg is the
    default for meta, builds and runes (`resolveMeta`, `BuildPanel`,
    `autoActions`), ours shows when op.gg fails or the user picks it.
    A first run was cut by me: editing any repo file while the dev app runs
    makes Vite reload the page (Tailwind scans `docs/*.md` too) and the sync
    dies with it. Don't touch the repo during a long run in `tauri dev`.
  - **Driving the dev app headless:** computer-use cannot target the dev
    exe. Launch with
    `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 npm run tauri dev`
    and talk CDP to `http://127.0.0.1:9222/json/list` (main page = the one
    without `?overlay=1`): `Runtime.evaluate` to click by text,
    `Page.captureScreenshot` to look.
  - **Shared-key risk:** the proxy's Riot allowance is one per region for
    every user; one person running the 25-min sync uses nearly all of it.
    Next improvement (designed, not started): compute the aggregate once a
    night outside the app (GitHub scheduled job calling the worker, result
    served as a file) so installs only download it.
  - **Owner rules (2026-11-16):** a change that makes things worse is not
    done — keep what there is; only build what improves, and say which with
    numbers. An own tier list from Riot data was dropped for that reason
    (≈1,400 matches vs hundreds of thousands per champion at op.gg).
  - **Tier list per rank (on main, NOT released; worker 2026-11-17.5 live).**
    Worker `/opgg/tierlist-rank?tier=&lane=`: the lane's champions from the
    default op.gg list, each asked `lol_get_champion_analysis` with `tier`
    and the lane's own `positions[].stats` (NOT `average_stats`, which mixes
    every lane — first version read that and matched op.gg 4/10). One retry
    pass for dropped calls within the 50-subrequest budget; a stored copy is
    served at once and rebuilt behind (fresh 3h, 10 min with gaps); a cold
    build keeps running after the client leaves (`waitUntil`). Cold rank:
    ~9 s for the five lanes, 0-2 gaps; stored: ~0.1 s.
    Checked: 10 random champions/lanes/ranks match op.gg's own pages 10/10.
    App: `fetchOpggMetaForRank` (all five lanes or nothing, 25 s cap),
    `resolveMeta` source `opggRank` behind dpm for the "by rank" choice
    (pref `dpmTier`). Boot waits at most `RANK_LIST_WAIT_MS` (2.5 s), then
    shows the general list and reloads via `DATA_UPDATED_EVENT` when the rank
    arrives; picking a rank in the list waits for it ("Actualizando…").
    A missed rank list is not cached for the hour, and the rank select stays
    with the note so the user can retry. Rows flag "pocos datos" under 1000
    games; op.gg rates are whole percents, shown without a decimal.
    Checked in the dev app: Grandmaster, Gold, Diamond+, Silver, Iron.
    Not released: goes out with the next version.
    **Grades (worker 2026-11-17.6):** the per-rank list uses op.gg's own
    grade one to one (`gradeForRankList`: OP,1,2,3,4,5 → S+,S,A,B,C,D). The
    old mapping (0-2 → S, kept for the general list) put 11-24 champions per
    lane in S; now 3-11, 5.5 on average. Check vs other sites (2026-11-17):
    77 % of our S are in lolalytics' top 10 for the same rank and lane (the
    misses are very popular picks — Malphite, Garen, Lux — op.gg weighs pick
    rate, lolalytics win rate); u.gg Gold top S+/S holds 5/5 of ours.
    Owner's rating of the per-rank list: 7/10 before this, target 8.
    Ideas above 8 (owner agreed order): order by reliability (games),
    trend arrows (op.gg rank_prev_patch), a personal list.
  - **Pick advice: stale mains (on main, NOT released, 2026-11-17).** The
    owner (jungle; recent games J4 14, Viego/Vi/Wukong a few) got Lee Sin
    every draft: M11 128k points, last played 2026-05-25, 1 stored game.
    Mastery is lifetime and the one-trick boost (+0.12) ignored recency, so
    mastery alone gave him +0.32 out of 1. `masteryRecency(lastPlayTime)`
    now scales the mastery score (full ≤30 d, 85 % ≤90 d, 60 % ≤1 y, 40 %
    beyond; no date = full); the one-trick boost needs ≤30 d and the
    comfort / "perfect pick" label ≤90 d. His Lee Sin: 0.320 → 0.136.
    Still weak: recent games only enter as win rate (`personalScore`), not
    as how much a champion is played — that is the personal-list idea.
  - **Pick advice: your champions filter, the game decides (2026-11-17).**
    Owner: "no porque sea el campeón más jugado es el pick más adecuado".
    Measured before: mastery could move a pick by 0.28, a 45 vs 55 % lane by
    0.02; no read of the enemy comp. Now `score = 0.5·context + 0.25·meta +
    comfort step` (unranked 0.6/0.15). Context = counter 0.55 (lane opponent
    from `inferEnemyRoles` counted ×2, win rate stretched ×5 around 50 %),
    comp 0.2 (`compFitScore`: vs 3+ engage/divers → peel/frontline, vs 2+
    poke → engage, vs 2+ assassins → frontline/peel, own team ≥75 % one
    damage type over 3+ sources → the other type), synergy 0.1, team gap
    0.15 (only from 2 allies picked). Comfort is a step (`comfortTier`):
    pool +0.25 (3+ games in the role or recent mastery ≥0.7, dropped if
    losing badly), known +0.12. "Best for this game" (`bestForDraft`
    reason, `breakdown.fit`): best fit outside the pool when ≥0.05 above #1;
    simple view gives it the third slot. Checked on the owner's jungle (16
    logged + 40 synthetic drafts, real op.gg matchups at gold, real
    mastery): top pick lane WR 49.2 → 52.1 %, losing lanes 12 → 1, top pick
    from the pool 55 → 56/56, 3 → 6 different top picks, best-for-game shown
    8/56. Not checked in a live champ select (needs LoL open).
  - **Installed app showed 0.5.1 (2026-11-17):** the desktop icon
    `Draftboard.lnk` points at an old local build
    (`src-tauri/target/release/…`, 0.5.1 from 2026-11-12); the updater
    updates `C:\Program Files\Draftboard` (0.5.6). Not an app bug.
    Fixed with the owner's yes: the icon now opens
    `C:\Program Files\Draftboard\lol-draft-advisor-app.exe` (0.5.7, updated
    in-app); old icon kept at `D:\Claude\Draftboard.lnk.backup-2026-11-17`.
    Also: the installed app and `tauri dev` cannot run at once (WebView2
    0x8007139F on the shared data folder) — close the installed one first.
  - **Background downloads (0.5.6, 1953bd7):** the pro, ranked
    and best-players downloads live in `state/dataSyncStore.ts`
    (`runDataSync`): footer pill "Actualizando datos · N%" then the result
    (`AppFooter` → `DataSyncPill`), Settings shows the progress again when
    reopened and keeps the download buttons disabled, no second run on top,
    and `DATA_UPDATED_EVENT` makes `useChampionDbBoot` reload the champion
    data in place (the "reload the app" hints are gone). Checked in the dev
    app with the pro download: 1 % → 99 % with Settings closed, 613 games,
    data reloaded the same second. Closing the app still stops a download.
  - **Next:** release the tier list per rank.
    The "compute the aggregate once a night" idea is parked under the
    owner's rule: our aggregate is only the backup behind op.gg, so making
    it faster to get improves little.
  - **dpm.lol-style grade tested, NOT adopted (2026-11-17):** from the
    owner's capture of dpm's Emerald+ list (202 rows) its grade fits
    `WR% + 0.45 × pick%` (Spearman 0.93; cuts S+ 56.9 / S 55.05 / A 53.8 /
    B 52.8 / C 51.35 reproduce 151/202 grades). dpm's FAQ/tier pages do not
    explain the method. On our op.gg data (5 ranks × 5 lanes) vs the current
    rule: S also S on lolalytics 55 → 39 %, recall 42 → 26 %, S that lose
    (< 50 %) 0 → 6, 2 lanes left without S; better only against dpm itself
    (circular). Variants with the 51 % rule or shrunk WR also worse. Kept the
    current rule. op.gg and dpm win/pick rates match (median pick ratio
    1.00, WR within 0.3 pts), so the data is fine; only the formula differs.
  - **Test quality pass (2026-11-17, not released):** mutation testing with
    Stryker (`npx stryker run`, ~12 min; narrow set in
    `vitest.stryker.config.ts`): pick engine 41 → 90 %, op.gg tier grading
    72 → 92 % after edge tests (`suggestionEngine.edges.test.ts`,
    `opggTier.parse.test.js`). Property tests with a new seed every run
    (`src/test/random.ts`, replay `PROP_SEED=<seed>`):
    `suggestionEngine.props.test.ts`, `opggTier.props.test.js`. They caught
    "best for this game" overwriting #1 on a one-pick list (fixed). Also:
    the hand role map hid Qiyana/Cho'Gath jungle in the tier list and in the
    pick engine — op.gg lane lists now count too; Trends window in plain
    words. Owner rules: re-run Stryker on changed brain files before a
    release; clean-up pass after each release.
  - **Per-rank S needs a real win rate (worker 2026-11-17.8, live, no app
    release needed):** owner saw Lee Sin S in Challenger. op.gg's grade
    leans on pick rate (Lee 50 % WR, 19 % pick → S; Nidalee 56 % → B).
    `rankLaneRows`: op.gg S/S+ under 51 % → A; a lane with < 3 S is filled
    by shrunk win rate (K 400 games) among picks ≥ 2 %; S rows move to the
    top. Cache key v5. 25 rank×lane lists vs lolalytics: S under 50 % 9 → 0,
    avg S win rate 51.2 → 52.1 %, S also S on lolalytics 53 → 55 % (Master+
    and Challenger 35 → 50 %), recall same 42 %. Capping S at 5/6/8 per lane
    was worse on both (not done). Challenger jungle now: Qiyana, Nidalee,
    Nunu S; Lee Sin A. op.gg gives win rate in whole percents only.
  - **Fixed after 0.5.7 (released in 0.5.8):** best-players button is 🌍
    (pro stays 🏆); ranked tooltip in plain words; `loadAggregatedBuilds`
    sorts most-played first, then win rate. Measured on the owner's DB
    (16.22.1, 108 champion+lane lists): shown build 2.26 → 2.65 games on
    average, "100 % on ≤3 games" shown 61 → 42. Per-build data is thin
    (512 of 662 rows have 2 games); op.gg stays the main build source.
  - **Still open from before:** real-game pass of the simple screens and
    the list below; Spanish item names in in-game/build advice; matchup tip
    text in Spanish.
- **2026-11-12 — simple view complete + v0.5.0 tagged.**
  - `prefs.simpleView` (default on) picks one screen per moment in
    `App.tsx` (`mainView`): `SimpleHomeView` (no draft, no game),
    `SimpleDraftView` (champ select or a hand-filled board) and
    `SimpleLiveView` (in game). "More details" shows the full panel layout.
    The simple screens use plain-language twins of the engine texts
    (`simple.why.*`, `simple.banWhy.*`, `simpleLive.coach.*`) and fall back
    to the engine text; the full layout and the voice keep the original ones.
  - `SimpleLiveView` replaces `LiveGamePanel` on screen, so it also mounts
    `LiveVoice` and drives `setOverlayVisible`.
  - Header language switch sets `aiCoachLanguage` too.
  - `PerkIcon` reads its URL from the CDragon perks manifest (was a dead URL).
  - CI green again: rustfmt, ubuntu pinned to 24.04, RUSTSEC-2026-0459
    (bundled SQLite) accepted in `src-tauri/.cargo/audit.toml` until sqlx
    allows libsqlite3-sys >= 0.39.
  - **Not verified in a real game**: the three simple screens (home with
    real stored matches, live screen with a real snapshot), plus the list
    below. v0.5.0 was tagged at the owner's request before that pass; the
    updater manifest was deployed the same day (worker version
    2026-11-12.1), so 0.4.0 installs now get the update banner. Rollback:
    put LATEST_VERSION back to 0.4.0 in the worker and redeploy.
- **2026-11-09..11 — two review rounds + contextual builds (all pushed; worker
  deployed 2026-11-11, version a86ed1fa).**
  - Round 1 (32 issues, commit 2062737): advice that ignored role/mode —
    soul/elder/baron timers, ARAM/Arena gating, counter items per class,
    role-aware matchup tips + win conditions, GPI/coach/trends baselines for
    jungle/support, scout + lobby fixes. Round 2 (30 issues, dd2c83d +
    ecf447a): item-set push now GET+merge (it used to wipe the player's other
    sets), Flash key kept, rune retry only on "Max pages reached", safe DB
    backup/restore (VACUUM INTO), AI features via proxy without a personal
    key, resync probes a real match before wiping, more i18n.
  - **Contextual builds v1.** Worker `/opgg/matchup-build?champion&role&
    opponent&lang` (op.gg MCP `lol_get_lane_matchup_guide`, mapper
    `matchupBuildFromGuide`). App: `services/opggMatchupBuild.ts`,
    `components/build/MatchupBuildCard.tsx`, `engine/matchupPlan.ts`. The card
    shows ONE buy order: start + first item from the lane matchup; boots and
    2nd/3rd slots give way to `suggestBuildAdaptations` "core" items (user
    rule: "ganar solo tu línea no sirve, es un juego de equipo"). Lane
    opponent = `inferEnemyRoles` guess in champ select, with a chooser when
    several enemies can play the role (flex picks); in game it is the real
    one (`liveLaneOpponentKey`, Live Client positions).
  - **Not verified in a real game**: the matchup card, item-set merge, Flash
    key, jungle scout notes, Baron timer (shows from 17:00).
  - Known gaps: op.gg's tip text comes in English even with `lang=es_ES`;
    team needs come from tag rules, not stats; matchup runes are shown, not
    applied (auto-runes still use the generic page).
  - Ideas parked: push-to-talk "ask the coach" (seen in Amokk; allowed if it
    only uses on-screen data + mic consent); Production key application text
    is ready in docs/RIOT_KEY_APPLICATION.md (user submits).
  - Session tooling: scratchpad helpers get wiped between runs; recreate
    `phase.ps1` (LCU gameflow phase via lockfile) before trusting any
    "is the user in game" check.

- **main is green locally.** `tsc --noEmit`, `eslint src`, **2603 vitest tests** (+170 worker, 35 Rust)
  (145 files, 0 skipped; worker tests excluded when the submodule is absent),
  `cargo check --all-targets`.
- **2026-10-29 Tauri 2.11 → 2.12.5** (+ all plugins to latest 2.x, npm
  @tauri-apps/* to matching minors, windows-rs 0.61 → 0.62). `cargo audit`
  passes: zip advisories fixed by updater 2.14.1 (zip 9.1.3); rkyv
  (RUSTSEC-2026-0235) ignored with owner approval (not compiled).
  Follow-ups from the changelog review:
  - **Overlay focus**: tao 0.37.1 makes `show()` activate a `focus:false`
    window, which would steal focus from LoL. Overlay now has
    `"focusable": false`. **Not yet verified in game** — check the game keeps
    focus when the overlay appears, and that drag + click-through still work.
  - **Updater signed version**: CLI ≥ 2.12 writes `version:<x>` into the
    .sig trusted comment and updater 2.14 checks it. The worker's
    `LATEST_VERSION.version` must equal the tauri.conf.json version of the
    build that produced the .sig. Don't enable `requireSignedVersion` yet.
  - Capabilities: added `fs:allow-write-text-file` (prefs export was
    missing it) and `opener:allow-open-path` on `$APPLOG` (About → open logs
    folder). Retest both in the built app.
  - Tray icon now comes from the exe's embedded ICO (largest entry) — check
    it looks right.
- **2026-10-28 coverage push**: 37.2% → **69.8% statements**, 57.6% → 78.3%
  functions (meets TESTING_POLICY 60/70). 10 file groups, each written by one
  agent and adversarially reviewed by another; gate ratcheted to 65/85/73/65.
  The push surfaced **14 real bugs, all fixed with regression tests** (one
  commit each): lane deaths for MID/BOT, spectator 404 by status (EN UI),
  English AI prompt rank, pro-meta wiped on failed download, tier-list
  reload failure + count, op.gg region slug, champion-guide + matchup-panel
  tips for id≠name champions, LeBlanc tips key, prefs reset no-op in Tauri,
  lobby-scout collapse state, enemy-scout retry, BuildPanel stale aggregates.
- **Also 2026-10-27/28**: voice reads K/D/A as a score (not a date); death
  warning needs KDA < 2; Diagnostics no longer flags keys the worker provides;
  lookup accepts "Name#TAG" in the name box; `verify-data.mjs` probes the
  worker's Riot + Groq keys.
- **Keys**: worker `RIOT_API_KEY` = the non-expiring personal "Draftboard"
  app key (no secret change since June, still valid); the portal's
  "Development App" key expires daily but nothing uses it. Groq key valid.
- **GitHub `scraper-watch.yml` is `disabled_inactivity`** (GitHub turns
  scheduled workflows off after 60 days without commits). Re-enable in the
  Actions tab; it is the only thing that pages on a dead key/scraper.
- `git stash@{0}` holds the stray local Cargo.lock re-resolve (tempfile's
  getrandom 0.4.2 → 0.3.4) — not from these sessions; drop it if unneeded.
- **Nothing after v0.4.0 has reached users.** Tag `v0.4.1` exists only locally
  (never pushed → no CI Release), `0.4.2` is bumped in the manifests but not
  tagged, and the worker updater still advertises **0.4.0**. Publishing =
  release flow below (push tag → CI → signature into worker → deploy). Waiting
  on the user's go.
- **2026-10-27 data-rot pass** (app unused ~3 months; all committed + pushed):
  - Worker patch-notes parser rewritten for Riot's `h3.change-title` layout +
    buff/nerf from `A ⇒ B` numbers (26.21 returned 3 junk entries for 25
    champs → banner said "mains unchanged"). Cache key v6. **Committed in the
    submodule but NOT deployed yet** — `npx wrangler deploy` pending user OK.
  - Locke / Yunara added to `championRoles` + `championArchetypes` (were
    missing → never suggested). Fiddlesticks recovered in dpm meta (dpm sends
    `FiddleSticks`; fall back to numeric `championId`).
  - Verified fine: Riot API key (account/match-v5/timeline/league), op.gg
    tierlist/build/matchups, DDragon 16.21.1, worker `/health`.
- **2026-10-27 (later) — lolvvv pro builds** (worker **deployed**,
  `WORKER_VERSION 2026-10-27.2`, together with the patch-notes fix above):
  - Worker `GET /lolvvv/build?champion=<DDragon id>` scrapes lolvvv.com's
    public build page (`__NEXT_DATA__`; robots.txt allows `/champion/`).
    Only the champion's PRIMARY role is server-rendered — other roles load
    through lolvvv's own GraphQL, which we deliberately don't call. Rune rows
    come from DDragon `runesReforged.json` → a legal 9-perk page.
  - App: `LolvvvProBuild` panel above the u.gg variants (items, spells, skill
    order, rune page + apply). Hidden on off-role picks and on 404 (no pros).
- Tooling lesson: never create a git worktree INSIDE the repo while
  `tauri dev` runs — Vite sees the worktree's index.html/tsconfig and
  full-reloads the app. Use a sibling dir (e.g. `D:\APPS\draftboard-cov`) with
  a `node_modules` junction; run vitest there with `--no-cache`.

## Release flow (see also docs/releasing.md)

1. Bump version in package.json + src-tauri/tauri.conf.json + Cargo.toml
   (+ Cargo.lock), commit.
2. `git tag -a vX.Y.Z` + `git push origin vX.Y.Z` → CI builds and publishes the
   signed Release.
3. Grab the `.exe.sig` — fastest:
   `curl -sL <release>/download/vX.Y.Z/Draftboard_X.Y.Z_x64-setup.exe.sig`
   (public asset, no auth). Verify it decodes to
   `file:Draftboard_X.Y.Z_x64-setup.exe`.
4. Paste into `cloudflare-worker/src/worker.js` `LATEST_VERSION.signature`
   (submodule = GitLab `draft_cloudflare`; commit there, then bump the pointer
   in the parent).
5. `cd cloudflare-worker && npx wrangler deploy`. Needs `npx wrangler login`
   (CLI OAuth, not the dashboard login) on the account that owns the worker —
   verify with `npx wrangler whoami` (account `8c973372…`).

**Steps 3–5 are manual and easy to forget.** Skipping them ships an installer
that existing users never get offered: the updater manifest still advertises
the old version.

## Repo facts / commands

- Path: `D:\APPS\lol-draft-advisor`. Bash cwd resets to `C:\Users\rafae` each
  call → prefix `cd /d/APPS/lol-draft-advisor`.
- Stack: Tauri 2 (Rust) + React 19 + Vite 7 + TS + Tailwind 4 + Zustand + SQLite.
- Verify: `npm run check:all` (typecheck + vitest + clippy + fmt). E2E:
  `npm run test:e2e` (needs `npx playwright install chromium` once).
- Screenshots for the README: `npm run dev`, then `node scripts/screenshots.mjs`.
  Runs the app outside Tauri, so LCU/Live panels stay empty by design.
- i18n: locale JSON `src/i18n/locales/{es,en}.json`; parity guarded by
  `src/i18n/i18n.test.ts` (es/en key sets must match, no empty values; arrays
  count as one leaf). Components use `const { t } = useTranslation()`;
  services use `import { i18n } from "../i18n"; i18n.t(...)`. Watch for
  `.map((t) => ...)` shadowing the translation `t` — rename the param.
- Two language prefs, deliberately separate: `uiLocale` (interface, and the
  curated matchup tips) vs `aiCoachLanguage` (what the AI replies in).
- Preview/browser audit: `.claude/launch.json` → `npm run dev` on port 1420.
  TermsGate then the onboarding wizard gate the UI; both must be dismissed
  before anything else is reachable.
- Commit convention: end messages with the Co-Authored-By line.

## Open

- **Compliance audit (2026-11-01/02).** No cheating/bannable behavior found.
  Confirmed violations: (1) public app on a *personal* Riot key — needs a
  Production key (form answers ready in docs/RIOT_KEY_APPLICATION.md; user applies in the portal; describe the real features,
  incl. enemy scout, overlay, live coach, LCU writes); (2) open proxy relay —
  fixed in worker 5149610 (app-only allow-list, typed ids, 120/min);
  (3) op.gg web scrape — replaced by op.gg's public MCP. **Worker not
  deployed yet** (needs the user's explicit "despliega"). User decision: gray
  areas (in-game voice coach, in-game scout, auto-runes, lolvvv/u.gg, TermsGate
  wording) are kept and should be improved to real-coach quality.
- **Roadmap order set by the user (2026-11-02):** 1) polish the existing base,
  2) gray-area features as a real coach, 3) contextual builds. For (3): op.gg
  MCP `lol_get_lane_matchup_guide` (my_champion vs opponent, UPPER_SNAKE
  names, e.g. LEE_SIN / NUNU_WILLUMP) returns a matchup-specific build (core
  items, boots, starters, runes, skills), `opponent_champion_tip` and lane
  advantage — the natural source.

- **dpm.lol gates the worker too** (2026-10-27): uncached buckets (`all`,
  `gold_plus`, `platinum_plus`, `diamond_plus`, `master`) get a Cloudflare
  challenge (403) from the deployed worker; edge-cached ones still answer.
  Mitigation committed (not deployed): 7-day last-good copy served on 403.
  Not bypassing the challenge — if dpm stays gated, the op.gg fallback is the
  real source. `tier=all` was already `422 Invalid tier` before; its new value
  is still unknown (the browser pane's policy check failed this session).
- **Champ-select pick detection under Riot's anonymized champ select** (mostly resolved — see 2026-10-29 below). The LCU
  session carries `obfuscatedPuuid` / `playerAlias`, and `myTeam[].championId` +
  `session.actions[].championId` read 0 where the app looks, so the local
  champion never resolves *during champ select*.
  - Mitigated end-to-end everywhere else: in-game rosters come from the Live
    Client player list, the loading screen fills from the gameflow session,
    the empty board auto-hides and the Build tab falls back to Picks.
  - The parse itself is pinned by a regression test against the real
    anonymized shape — it is not the bug. Remaining suspect: Riot omitting the
    other players' pick actions entirely.
  - Diagnosis needs a live game: `[lcu-shape]` dumps the unresolved session
    to the disk log (throttled). Run `npm run tauri dev`, enter a real champ
    select, then read where Riot puts `championId` now.
  - 2026-10-27 real draft (16:05 UTC): `myTeamCells=[0:777,1:0,2:0,3:0,4:0]`,
    `actionPickCells=[0,1,2,4]` with the local player on cell 3 — the local
    cell had NO pick action at all. The old dump was sliced inside the bans
    (second action group starts `id 100, actorCellId -1`), so it showed
    nothing more. Now compacted to `id:type:actorCell:champ+flags` tokens —
    the next real champ select logs the whole draft.
  - 2026-10-29 compact dumps (8 drafts) read on 2026-11-01: picks DO live in
    `actions[].championId` (e.g. `10:pick:0:39+`, `11:pick:5:21+A`), every
    dump was the normal pre-hover state (my pick action pending, champ 0), and
    dumps stopped on the local player's turn — i.e. resolution works. The
    dump now fires only on real gaps (my pick completed with champ 0, or picks
    exist but none is mine). Also seen: the local cellId can change mid-draft
    (7 → 9, pick-order swap); applySession re-resolves it every frame.
  - Open: all 8 games hit the gameflow refill at GameStart, so the board was
    empty there — leaveChampSelect reset it (last phase not FINALIZATION /
    GAME_STARTING?). It now logs `[lcuSync] left champ select — last phase X
    → board kept|reset`; read it after the next real game.
  - Log lives at `%LOCALAPPDATA%\com.draftboard.app\logs\draftboard.log`
    (timestamps UTC).
- **Live-game surfaces are not verifiable headless**: overlay topmost /
  click-through, auto-apply runes and items, live coach, lobby scout. They need
  LoL actually running.
- **metaAggregator does non-atomic per-table DELETE+INSERT.** Left alone on
  purpose — tauri-plugin-sql can't hold BEGIN/COMMIT across `execute()` calls
  (pooled connections); batching already minimizes the partial-write window.
  A documented tradeoff, not a bug.
