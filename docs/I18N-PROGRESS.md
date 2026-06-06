# i18n Progress — EN/ES coverage

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

## Remaining
### Chrome (A)
CoachView · TierListView · ProPlayersView · AiChatView · LessonPlanView ·
SummonerLookupView · LiveGamePanel · LiveGameView · OnboardingView ·
ChampionPoolPanel · PlaystylePanel · PatchImpactPanel · OwnMasteriesPanel ·
DraftCoachPanel · GpiRadar · misc banners/modals
(MatchupTipsPanel chrome done; tip content already bilingual via data layer)

### Engine content (B)
- `liveCoachEngine.ts` (live insights — also spoken)
- `topInsight.ts` / `gpiEngine.ts` (post-game tips, GPI axis labels)
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
