# i18n Progress — EN/ES coverage

> **▶ RESUME HERE (next session):** "termina la cola i18n desde este doc".
> State: ~42 components localized, 576 es=en keys, 858 tests green, tree clean.
> The toggle-revert bug is FIXED (commit 2a95979). Pattern is proven — just
> work the **Remaining** list below, one component per commit:
> 1. Read the component, find hardcoded Spanish.
> 2. Add keys to BOTH `src/i18n/locales/{es,en}.json` under a namespace.
> 3. Wire `useTranslation()` + `t(key)`; rename any `.map((t,...))` that shadows `t`.
> 4. For engines: emit keys+params, resolve in the panel, add an orphan-key guard test.
> 5. Verify: `npx tsc --noEmit` + `npx vitest run src/i18n/i18n.test.ts` + lint, then commit+push.

Root cause of "select English, UI stays Spanish": most components hardcoded
Spanish. Fix = externalize to `src/i18n/locales/{es,en}.json` keys + `useTranslation()`.
Parity guarded by `src/i18n/i18n.test.ts` (es/en key sets must match, no empty values).

Two workstreams:
- **A. Chrome** — static UI (titles, buttons, labels, empty states). Mechanical.
- **B. Engine content** — heuristic advice text generated in engines. Engines emit
  i18n **keys + params** (not prose); components resolve via `t()`. Each engine ships
  an orphan-key guard test. AI-coach text already respects language separately.

## Done
### Chrome (A)
header/nav · SuggestionPanel · DraftBoard · WinConditionsPanel · TradeSuggestionPanel ·
BanSuggestionsPanel · CompAnalysis · EnemyScoutPanel · BuildPanel · TrendsView ·
LobbyScoutPanel · (+ pre-existing: AboutModal, AppFooter, ChampionPicker,
DiagnosticsView, HistoryView, PreferencesView, SettingsView, ConfirmDialog, ViewBoundary)

### Engine content (B) — keyed + tested
- `winConditions.ts` → `winConditions.rules.*` (27 rules)
- `scoutInsights.ts` → `scout.note.*` / `scout.summary.*` (note also spoken via i18n.t)
- `lobbyInsights.ts` → `lobby.*` (dodgeHint returns structured; panel composes text)
- `leakEngine.ts` → `trends.leak*` (additive keys; Spanish kept for AI-memory path)
- `aramEngine.ts` → `aram.*` (returns keys; BuildPanel resolves)
- `runeAdvice.ts` → `runeAdvice.*` (returns keys; BuildPanel resolves)
- `liveCoachEngine.ts` → `liveCoach.*` (16 insights; LiveGamePanel + OverlayApp + voice)
- `topInsight.ts` → `coach.category.*` / `coach.tip.*` (post-game; CoachView card)

## Remaining
### Chrome (A) — final tail (~9)
ProPlayersView · AiChatView · LessonPlanView · SummonerLookupView ·
LiveGameView · DiagnosticsView (partial) · LogViewerModal · DataPrivacyView ·
ChampionGuideView · AboutModal (partial) · prefs/* fields
(Done this run: SettingsView, MatchupTipsPanel, CoachView, TierListView,
LiveGamePanel, DraftCoachPanel, TermsGate, PatchNewBanner, GpiRadar,
PlaystylePanel, OwnMasteriesPanel, OnboardingView, ChampionPoolPanel,
PatchImpactPanel, InfoTooltip (glossary), ShortcutsHelp, TipCarousel (chrome),
FeedbackModal, + 5 banners. Suggestion reasons + LCU status.)

### Engine content (B) — remaining
playstyleEngine (archetype meta + traits) · trendsEngine (insights) ·
banEngine reasons · championPoolEngine messages

### Data (curated, AI-layer covers language)
TipCarousel CHAMPION_TIPS/ROLE_TIPS (fallback only; AI tips already bilingual)

### 🐛 FIXED: language toggle revert bug
Async boot race in setUiLocale reverted the locale to Spanish on reload.
Fixed: App effect gated on `prefsLoaded` + setUiLocale race-safe token. Verified
in-browser (reload with uiLocale=en now sticks). See commit 2a95979.

### Engine content (B)
- `gpiEngine.ts` (GPI axis labels in the radar — CoachView)
- `trendsEngine.ts` (trend insights)
- `playstyleEngine.ts` (archetype labels/traits)
- `banEngine.ts` reasons · `suggestionEngine` reasons · `matchupTips` data
- toasts/voice strings in various components

## Pattern (engine → keys)
1. Change engine return type: `text: string` → `key: string; params?: Record<...>`.
2. Move prose to `{es,en}.json` under a namespace.
3. Component resolves `t(key, params)`; for spoken/imperative paths use the
   `i18n.t` singleton (avoids adding `t` to effect deps).
4. Update the engine's test to assert keys; add an orphan-key guard sweep.
