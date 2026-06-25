# Draftboard — Session Handoff (2026-06-23)

## Status
- **Release v0.4.0 SHIPPED + LIVE.** Tag → CI built the signed installer + public
  GitHub Release; worker deployed (`draftboard-riot-proxy`, version `8d77c05b`);
  `/updater/latest.json` verified serving `version:"0.4.0"` with the real sig.
  Existing 0.3.0 users now get the auto-update prompt.
- main @ `0a51666` (+ this handoff). 930 tests green, `tsc --noEmit` + `eslint src` clean.

## Release flow used (for next time — docs/releasing.md)
1. Bump version in package.json + src-tauri/tauri.conf.json + Cargo.toml (+ Cargo.lock), commit.
2. `git tag -a vX.Y.Z` + `git push origin vX.Y.Z` → CI builds + publishes signed Release.
3. Grab `.exe.sig` — fastest: `curl -sL <release>/download/vX.Y.Z/Draftboard_X.Y.Z_x64-setup.exe.sig`
   (public asset, no auth needed). Verify it decodes to `file:Draftboard_X.Y.Z_x64-setup.exe`.
4. Paste into `cloudflare-worker/src/worker.js` LATEST_VERSION.signature (submodule = GitLab `draft_cloudflare`;
   commit there, then bump the pointer in the parent).
5. `cd cloudflare-worker && npx wrangler deploy`. Needs `npx wrangler login` (CLI OAuth, not the dashboard
   login) on the account that owns the worker — verify with `npx wrangler whoami` (account `8c973372…`).

## What shipped this session (22 commits, `e974f73`→`78ebc6d`)
- **Bugs fixed**: Black Cleaver wrongly flagged as a healer → false Grievous-Wounds rec (`8257a56`);
  overlay objective-timer could read NaN from a malformed event (`55f9794`).
- **Dedup + tests**: shared `httpFetch` (9 files), `resolveMeta` meta-fallback, `deriveTimers`,
  `formatTime`, `isSmurf` lobby engine.
- **i18n (ES/EN)**: full sweep — powerSpikes (53 tips), TipCarousel (30), Preferences sub-fields
  (autostart/proxy/theme/AI), History filter tabs, several a11y aria-labels. **Verified live** in the
  dev server (ES↔EN toggle → zero Spanish leftovers, no console errors).
- **New test coverage**: resolveMeta, buildMetaList, lookupPerkId, aggregateEnemyItems, isSmurf,
  deriveTimers, formatTime. Engine + data (pure logic) ~100% covered.
- **Misc**: Void Grubs objective timer, migrations README sync, app title + favicon (dropped Vite boilerplate).

## Repo facts / commands
- Path: `D:\APPS\lol-draft-advisor`. Bash cwd resets to `C:\Users\rafae` each call → prefix `cd /d/APPS/lol-draft-advisor`.
- Stack: Tauri 2 (Rust) + React 19 + Vite 7 + TS + Tailwind 4 + Zustand + SQLite.
- Verify: `npx tsc --noEmit` · `npx eslint src` · `npx vitest run` (930). Rust: `npm run rust:check`.
- i18n: locale JSON `src/i18n/locales/{es,en}.json`; parity guarded by `src/i18n/i18n.test.ts`
  (es/en key sets must match, no empty values; arrays are treated as a single leaf). Components use
  `const { t } = useTranslation()`; services/non-components use `import { i18n } from "../i18n"; i18n.t(...)`.
  Watch for `.map((t) => ...)` shadowing the translation `t` — rename the param.
- Preview/browser audit: `.claude/launch.json` → `npm run dev` on port 1420. TermsGate gates the app;
  to reach the UI in a browser, check the consent checkbox + click accept. Live-game data is null without
  Tauri (overlay/live panels render empty), but the rest of the UI is auditable (good for i18n sweeps).
- Release flow: `docs/releasing.md`. Version lives in package.json + src-tauri/tauri.conf.json +
  src-tauri/Cargo.toml (+ Cargo.lock).
- Commit convention: end messages with the Co-Authored-By line. **Standing rule for this project:
  commit AND push every change automatically — don't ask.**

## 🔴 OPEN BUG — champ-select pick detection broken (found in live test 2026-06-25)
**Impact: HIGH.** The build / coach / suggestion panels stay empty in champ select AND in-game because
the local champion never resolves. Root cause = Riot's **anonymized champ select**: the LCU session
players now carry `obfuscatedPuuid` / `obfuscatedSummonerId` / `playerAlias` / `nameVisibilityType`, and
`myTeam[].championId` + `session.actions[].championId` are 0 / empty where the app looks.

Live-log signature (current build):
```
[lcuSync] my cell N has no champ in myTeam OR actions — championId=0 ... actionPickCells=[none]
```
- `buildChampionKey = liveDerived.key ?? myChampionLocked ?? myChampionIntent` (App.tsx:530) → all three null.
- Likely also breaks in-game `findMyPlayer` (liveClient) — Live Client identity matching under anonymity.

**Fix approach (next session):** instrument lcuSync just after the warn (~L383) with a throttled raw dump
outside the `lastBlindWarnedCell` dedup — `console.warn("[DIAG]", JSON.stringify(s.actions).slice(0,1400),
JSON.stringify(myPlayer).slice(0,500))` gated by a `Date.now()-lastRawDiagMs>8000` throttle. Run `npm run
tauri dev`, hover a champ in a real champ select, read where Riot now puts `championId`, then update the
parse in lcuSync (and verify findMyPlayer handles obfuscated identities in-game). The session app was open
+ LCU-connected when this was found; the diagnostic was reverted (uncommitted).

## Open / not done
- **Live-game testing** (overlay topmost/click-through, auto-apply runes/items, live coach, lobby scout):
  needs LoL running on the machine — NOT verifiable headless. Note the champ-select bug above blocks the
  build/coach surfaces until fixed.
- metaAggregator does non-atomic per-table DELETE+INSERT. Left alone on purpose: the code comment documents
  that tauri-plugin-sql can't hold BEGIN/COMMIT across `execute()` calls (pooled connections); batching
  already minimizes the partial-write window. Not a bug — a deliberate tradeoff.
- i18n is thoroughly swept (multiple scan angles exhausted: accents, ES words, thrown errors, aria/placeholder/title,
  es-locale formatting). Remaining accented-char hits are false positives (`·` separator, "Español"/"English"
  language labels).
