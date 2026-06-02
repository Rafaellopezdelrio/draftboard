# Competitive Roadmap — Mission: parity, then surpass

Goal: reach **at least parity** with the best competitor in every sector, then
progressively pass them. We don't out-scrape op.gg/U.GG (impossible solo) — we
win on **AI + analysis + native LCU/live integration**, where we already lead
or can lead.

Ratings are our own estimate (codebase vs known public competitor features),
1–10 vs the *best* rival in that sector.

| # | Sector | Now | Rival (best) | Target | Status |
|---|--------|:---:|--------------|:------:|--------|
| 1 | Draft / champ-select (counters, suggestions, bans, win-prob, Draft AI Coach) | 7 | Mobalytics 8 | 8→9 | close |
| 2 | Live in-game coaching | 6 | Porofessor 8 | 8 | logic done, overlay-gated |
| 3 | Builds / runes (pro builds, item-adapt, LCU apply) | 6 | Blitz 9 | 8 | needs polish |
| 4 | Post-game (matchAnalytics, GPI, AI match coach + memory) | 6 | Mobalytics 9 | 8 | expand GPI |
| 5 | Personal analytics / trends / leaks | 7 | Mobalytics 8 | 9 | leak engine + vision/gold ✓ |
| 6 | **AI coaching** (draft/trends/match/lesson/tips/chat+memory) | 8 | Blitz 5 | 9+ | **our moat** |
| 7 | Meta / tier list / champion data | 4 | op.gg/U.GG 10 | 6 | data-scale; partial only |
| 8 | Lobby / enemy scout pre-game | 5 | Porofessor 10 | 8 | data fetched, needs synthesis |
| 9 | Overlay / in-game UX | 4 | Blitz/Porofessor 9 | 7 | hard-disabled (Win32 v2) |
| 10 | Infra / data freshness (worker, scraper-cron, MCP, auto-update) | 5 | op.gg 9 | 7 | scale-bound |

## Phases (ROI-ordered)

**Phase 1 — land cheap wins + unlock built work**
- [x] Scout synthesis (8: 5→9): Porofessor-style verdicts from data we already fetch. Enemies → `scoutInsights.ts` (per-enemy threat + OTP/smurf/streak + team summary) in EnemyScoutPanel. Allies/lobby → `lobbyInsights.ts` (carry to play around, liability to cover, top enemy threat, team rank balance) in LobbyScoutPanel. Danger-level enemies are spoken aloud at champ select (voiceCoach). Scout→bans: `useEnemyMains` feeds each enemy's #1 mastery champ into banEngine so it suggests denying their comfort pick.
- [~] Live coach delivery (2: 6→7): voice coaching landed — critical live insights
  (soul-deny, heavy deaths) are spoken aloud hands-free, so the value lands even
  without a visual overlay. `LiveVoice` in LiveGamePanel, reuses voiceCoach.
- [~] Overlay v2 (9: 4→6): CONTENT ready — OverlayApp renders the live coach
  (soul/baron/deaths/lane/HP) + score/stats/timers/teams. RE-ENABLED behind the
  opt-in `showInGameOverlay` pref (default OFF → zero regression): when on, the
  window shows only in a live game (LiveGamePanel no longer force-hides it).
  PENDING — live tuning session (you in-game): verify topmost survives alt-tab,
  click-through on empty zones, anchor/position vs the LoL window. The render
  path is live so we tune against real behavior instead of flying blind.

**Phase 2 — depth where we're close**
- [x] Post-game GPI expansion (4: 6→8.5): `scoreObjectives` uses real objective
  damage share (was a fake kills+assists re-use); farming + vision now score
  against rank-bracket baselines (`baselineFor`) so the same CS/min reads
  differently in Gold vs Master. The post-game AI coach also gets a per-match
  rank-benchmark line (`buildMatchBenchmarkLine`). Optional: a laning-phase dimension.
- [x] Draft win-prob calibration (1: 7→8): re-weighted meta/archetype/counter
  factors so a lopsided draft reads ~32–68% instead of always ~50%. Test locks it.
- [ ] Build auto-import 1-click parity (3: 6→8).
- [x] ARAM advisor (product gap): `aramEngine.ts` — Howling Abyss-specific advice
  (poke/sustain/no-recall/anti-heal/tenacity by champion class) replaces the old
  "ARAM recs coming" placeholder in BuildPanel. Most tools ignore ARAM; we don't.

**Phase 3 — widen the moat (surpass)**
- [~] AI best-in-class (6: 8→9): deeper grounding — leaks/vision ✓, persistent
  leak memory ✓ (`leakMemory.ts`), playstyle grounding ✓ (trends coach now gets
  your archetype + traits → advice fits HOW you play). Pure `buildTrendsPrompts`
  extracted + tested. Still TODO: voice coaching, multi-session synthesis report.
- [x] Analytics rank benchmarks (5: 7.5→9): `rankBenchmarks.ts` — your CS/min,
  vision/min, deaths/min, KDA vs an estimated baseline for your bracket+role
  (from LCU rank). Shown in TrendsView as "vs tu rango (estimado)" AND fed to the
  AI trends coach so it prioritizes closing the metrics below your rank. Curated
  baselines, labeled as estimates — honest, not faked precision.

**Phase 4 — data scale (hardest, partial)**
- [ ] Meta pipeline depth (7,10: 4→6): more patches/regions via worker; never full op.gg parity.

## Identity (read this before building anything)
Parity means matching their **level of value in a sector, not copying their
features**. We level up 1→2 like a *different character* — same power tier,
different kit. Our kit:

- **Synthesis over raw data** — they dump stats; we give the verdict + the
  "now what" (e.g. scout shows rank/WR; we say "OTP, don't 1v1 early, ping jungle").
- **AI coaching grounded in your data** — our moat, not a bolt-on.
- **Native LCU / Live Client integration** — real-time, in your client.
- **Local-first & private** — your data stays on your machine.
- **ToS-safe always** — official APIs only (LCU, Live Client, Riot API). No
  memory reads, no OCR, nothing bannable.

So for every sector: don't ask "how do we copy op.gg" — ask "what's *our* way to
hit their level here?" If a feature would just be a worse clone of theirs, find
the version only we would ship.

## Principle
Fight on AI + analysis + integration, not on data scale.
