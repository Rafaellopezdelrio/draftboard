# Draftboard — Session Handoff (2026-11-11)

Internal working notes: where the repo stands, what's verified, what's still
open. Not user documentation — see [`../README.md`](../README.md) for that.

## Status

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
