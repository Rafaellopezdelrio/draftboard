# Draftboard — Session Handoff (2026-10-27)

Internal working notes: where the repo stands, what's verified, what's still
open. Not user documentation — see [`../README.md`](../README.md) for that.

## Status

- **main is green.** `tsc --noEmit`, `eslint src`, 961 vitest tests (117 files),
  `cargo clippy -D warnings` and `cargo fmt --check` all pass locally.
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
- `src-tauri/Cargo.lock` shows as modified in the working tree — not from the
  2026-10-27 session; inspect before committing.
- Coverage: **36.4% statements / 54.9% functions** (2026-07-27). Behind the
  [`TESTING_POLICY.md`](../TESTING_POLICY.md) curve — 40/55 was due 2026-07-01,
  60/70 is due 2026-09-01.

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

- **dpm.lol "All ranks" bracket is dead upstream**: `tier=all` → `422 Invalid
  tier`. The app silently falls back to op.gg. The new value is unknown — dpm.lol
  serves a Cloudflare challenge to local curl and `wrangler dev --remote` can't
  open a preview on this account; probe it from the deployed worker.
- **Champ-select pick detection under Riot's anonymized champ select.** The LCU
  session carries `obfuscatedPuuid` / `playerAlias`, and `myTeam[].championId` +
  `session.actions[].championId` read 0 where the app looks, so the local
  champion never resolves *during champ select*.
  - Mitigated end-to-end everywhere else: in-game rosters come from the Live
    Client player list, the loading screen fills from the gameflow session,
    the empty board auto-hides and the Build tab falls back to Picks.
  - The parse itself is pinned by a regression test against the real
    anonymized shape — it is not the bug. Remaining suspect: Riot omitting the
    other players' pick actions entirely.
  - Diagnosis needs a live game: `[lcu-shape]` already dumps the unresolved
    session to the disk log (throttled). Run `npm run tauri dev`, enter a real
    champ select, then read where Riot puts `championId` now.
- **Live-game surfaces are not verifiable headless**: overlay topmost /
  click-through, auto-apply runes and items, live coach, lobby scout. They need
  LoL actually running.
- **metaAggregator does non-atomic per-table DELETE+INSERT.** Left alone on
  purpose — tauri-plugin-sql can't hold BEGIN/COMMIT across `execute()` calls
  (pooled connections); batching already minimizes the partial-write window.
  A documented tradeoff, not a bug.
