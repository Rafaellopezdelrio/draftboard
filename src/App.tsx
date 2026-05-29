import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import "./App.css";
import { useDraftStore } from "./state/draftStore";
import type { Role } from "./types/champion";
import { DraftBoard } from "./components/DraftBoard";
import { SuggestionPanel } from "./components/SuggestionPanel";
import { CompAnalysis } from "./components/CompAnalysis";
import { useLcuSync } from "./state/lcuSync";
import { EnemyScoutPanel } from "./components/EnemyScoutPanel";
import { BuildPanel } from "./components/BuildPanel";
import { DraftWinrateBadge } from "./components/DraftWinrateBadge";
import { OwnMasteriesPanel } from "./components/OwnMasteriesPanel";
import { PhaseTimer } from "./components/PhaseTimer";
import { Toaster } from "./components/Toaster";
import { ViewBoundary } from "./components/ViewBoundary";
import { PanelBoundary } from "./components/PanelBoundary";
import { Logo } from "./components/ui/Logo";
import {
  Sparkles,
  GraduationCap,
  TrendingUp,
  History,
  Activity,
  SlidersHorizontal,
  Wifi,
  WifiOff,
  Cog,
  Trophy,
  UserSearch,
  Calendar,
  Radio,
} from "lucide-react";

// Lazy-load all modals — only fetched when opened, keeps initial bundle smaller.
const SettingsView = lazy(() =>
  import("./components/SettingsView").then((m) => ({ default: m.SettingsView }))
);
const HistoryView = lazy(() =>
  import("./components/HistoryView").then((m) => ({ default: m.HistoryView }))
);
const CoachView = lazy(() =>
  import("./components/CoachView").then((m) => ({ default: m.CoachView }))
);
const TrendsView = lazy(() =>
  import("./components/TrendsView").then((m) => ({ default: m.TrendsView }))
);
const PreferencesView = lazy(() =>
  import("./components/PreferencesView").then((m) => ({
    default: m.PreferencesView,
  }))
);
const OnboardingView = lazy(() =>
  import("./components/OnboardingView").then((m) => ({
    default: m.OnboardingView,
  }))
);
const DiagnosticsView = lazy(() =>
  import("./components/DiagnosticsView").then((m) => ({
    default: m.DiagnosticsView,
  }))
);
const AiChatView = lazy(() =>
  import("./components/AiChatView").then((m) => ({ default: m.AiChatView }))
);
const DataPrivacyView = lazy(() =>
  import("./components/DataPrivacyView").then((m) => ({
    default: m.DataPrivacyView,
  }))
);
const TierListView = lazy(() =>
  import("./components/TierListView").then((m) => ({ default: m.TierListView }))
);
const ChampionGuideView = lazy(() =>
  import("./components/ChampionGuideView").then((m) => ({
    default: m.ChampionGuideView,
  }))
);
const SummonerLookupView = lazy(() =>
  import("./components/SummonerLookupView").then((m) => ({
    default: m.SummonerLookupView,
  }))
);
const ProPlayersView = lazy(() =>
  import("./components/ProPlayersView").then((m) => ({
    default: m.ProPlayersView,
  }))
);
const LessonPlanView = lazy(() =>
  import("./components/LessonPlanView").then((m) => ({
    default: m.LessonPlanView,
  }))
);
const LiveGameView = lazy(() =>
  import("./components/LiveGameView").then((m) => ({
    default: m.LiveGameView,
  }))
);
import { BanSuggestionsPanel } from "./components/BanSuggestionsPanel";
import { LiveGamePanel } from "./components/LiveGamePanel";
import { LobbyScoutPanel } from "./components/LobbyScoutPanel";
import { PatchNewBanner } from "./components/PatchNewBanner";
import { UpdateBanner } from "./components/UpdateBanner";
import { OverlayCompatBanner } from "./components/OverlayCompatBanner";
import { NetworkStatusBanner } from "./components/NetworkStatusBanner";
import { FirstRunHealthBanner } from "./components/FirstRunHealthBanner";
import { TrackingStatusBar } from "./components/TrackingStatusBar";
// AboutModal + ShortcutsHelp lazy-loaded — they pull lucide icons + their
// own logic and are rarely opened. ChangelogModal stays eager because
// it's auto-mounted on every boot (version diff check); lazy would defer
// the import but the component still mounts to evaluate its predicate,
// so no savings.
const AboutModal = lazy(() =>
  import("./components/AboutModal").then((m) => ({ default: m.AboutModal }))
);
const ShortcutsHelp = lazy(() =>
  import("./components/ShortcutsHelp").then((m) => ({ default: m.ShortcutsHelp }))
);
import { ChangelogModal } from "./components/ChangelogModal";
import { Skeleton } from "./components/ui/Skeleton";
import { TermsGate } from "./components/TermsGate";
import { useToast } from "./components/ui/ToastContainer";
import { AppFooter } from "./components/AppFooter";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import { useTrayHealth } from "./hooks/useTrayHealth";

/** Single-panel skeleton used during the initial champion DB cold-load. */
function SkeletonPanel({ rows, title }: { rows: number; title?: string }) {
  return (
    <div className="glass border border-border-subtle rounded-xl p-4 space-y-2">
      {title && (
        <p className="text-[10px] uppercase tracking-widest text-white/30 mb-2">
          {title}
        </p>
      )}
      <Skeleton rows={rows} gap="normal" />
    </div>
  );
}
import { displayPatch } from "./data/patchDisplay";
import { MatchupTipsPanel } from "./components/MatchupTipsPanel";
import { ChampionPoolPanel } from "./components/ChampionPoolPanel";
import { InGameTimers } from "./components/InGameTimers";
import { PatchImpactPanel } from "./components/PatchImpactPanel";
import { PlaystylePanel } from "./components/PlaystylePanel";
import { WinConditionsPanel } from "./components/WinConditionsPanel";
import { TipCarousel } from "./components/TipCarousel";
import { TradeSuggestionPanel } from "./components/TradeSuggestionPanel";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { setOverlayVisible, setOverlayPosition } from "./services/overlay";
import { HeaderMenu } from "./components/ui/HeaderMenu";
import { useEscape, useGlobalShortcut } from "./hooks/useKeyboardShortcuts";
import { useScheduledJobs } from "./state/scheduledJobs";
import { useGamePhase } from "./state/inGameDetection";
import { useLiveGame } from "./hooks/useLiveGame";
import { findMyPlayer, liveChampionKey } from "./services/liveClient";
import { personalStatsByChampion } from "./services/matchRepo";
import { setRiotProxyUrl } from "./services/riotApi";
import type { ChampionPersonalStat } from "./services/matchRepo";
import { usePrefsStore } from "./state/prefsStore";
import { probeRustRecoveryMarker } from "./db/client";
import { setUiLocale } from "./i18n";
import { useAutoActions } from "./state/autoActions";
import { useOverlayFollowLol } from "./hooks/useOverlayFollowLol";
import { useThemeAccent } from "./hooks/useThemeAccent";
import { useVoiceCoach } from "./hooks/useVoiceCoach";
import { useLcuConnectToasts, useChampionLockToast } from "./hooks/useLcuToasts";
import { useAutoOpenCoach } from "./hooks/useAutoOpenCoach";
import { useViewBreadcrumb } from "./hooks/useViewBreadcrumbs";
import { useSentrySessionTags } from "./hooks/useSentrySessionTags";
import { useLcuPersonalData } from "./hooks/useLcuPersonalData";
import { useTelemetryConsent } from "./hooks/useTelemetryConsent";
import { useChampionGuideEvent } from "./hooks/useChampionGuideEvent";
import { useSystemToasts } from "./hooks/useSystemToasts";
import { useChampionDbBoot } from "./hooks/useChampionDbBoot";
import { useRoleDerivation } from "./hooks/useRoleDerivation";
import { useDraftDerivations } from "./hooks/useDraftDerivations";
import { useSuggestions } from "./hooks/useSuggestions";
import { useDraftPrediction } from "./hooks/useDraftPrediction";

const ROLES: Role[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

function App() {
  const {
    ally,
    enemy,
    bans,
    myRole,
    setMyRole,
    enemySummonerIds,
    myChampionIntent,
    myChampionLocked,
    reset,
  } = useDraftStore();
  const { status: lcuStatus, session: lcuSession } = useLcuSync();
  const prefs = usePrefsStore((s) => s.prefs);
  const loadPrefs = usePrefsStore((s) => s.load);
  const prefsLoaded = usePrefsStore((s) => s.loaded);
  const { push: pushToast } = useToast();
  // Champion DB cold-load with stale-cache fallback + background retry.
  // Owns: db, error, usingStaleCache. Exposes setDb so TierListView can
  // force-refresh after a meta-source change. Declared early so other
  // hooks (useAutoActions, useChampionLockToast) can consume `db`.
  const { db, error, usingStaleCache, retry: retryDbBoot, setDb } =
    useChampionDbBoot(prefsLoaded, pushToast);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [showTrends, setShowTrends] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showTierList, setShowTierList] = useState(false);
  const [showLookup, setShowLookup] = useState(false);
  const [showProPlayers, setShowProPlayers] = useState(false);
  const [showLessonPlan, setShowLessonPlan] = useState(false);
  const [showLiveGame, setShowLiveGame] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [forceChangelogVersion, setForceChangelogVersion] = useState<string | null>(null);

  // Push live health → tray tooltip so the user can hover and see
  // "LCU: ✓ · Backend: ✓ · v0.3.0" without opening the app.
  const netStatus = useNetworkStatus();
  useTrayHealth({
    lcuConnected: lcuStatus.connected,
    workerReachable: netStatus.workerReachable,
    online: netStatus.online,
    version: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev",
  });
  const { guideChampionKey, setGuideChampionKey } = useChampionGuideEvent();
  const [personalStats, setPersonalStats] = useState<ChampionPersonalStat[]>([]);
  const gamePhase = useGamePhase();
  // Personal data from LCU (masteries + rank). Rank feeds the coach
  // engine + suggestion engine — boosts mastery weight for unranked
  // players who lack a rank signal to anchor meta calibration.
  const { masteries, rankTier } = useLcuPersonalData(lcuStatus.connected);

  // Post-game auto-coach + "Partida empezada" voice cue. The full
  // in-match → out-of-match state machine lives in useAutoOpenCoach so
  // App.tsx stays focused on layout instead of phase plumbing.
  useAutoOpenCoach({
    phase: gamePhase.phase,
    coachAfterMatch: prefs.coachAfterMatch,
    showCoach,
    setShowCoach,
  });

  useAutoActions({ db });
  // Auto-pin the overlay to LoL's window + follow it when user drags LoL
  // across monitors. No-op when overlay-follow pref is off or running
  // outside Tauri (tests, browser).
  useOverlayFollowLol(true);
  useScheduledJobs();

  // Voice coach lifecycle — init + pref sync. Extracted to hook.
  useVoiceCoach();

  // Theme accent variant → <html data-accent>. Extracted into a hook
  // so App.tsx stays focused on layout glue.
  useThemeAccent();


  // Ctrl+K to open command palette
  useGlobalShortcut({ key: "k", ctrl: true }, () => setShowPalette(true));
  // Ctrl+/ to open the shortcuts help. Standard convention (Slack,
  // GitHub, GitLab, Linear, etc all use this binding for the same thing).
  useGlobalShortcut({ key: "/", ctrl: true }, () => setShowShortcuts(true));
  // 1-5 to pick role quickly (documented in ShortcutsHelp). Bare-key
  // bindings — skip when user is typing in an input/textarea so they
  // don't accidentally swap role while typing a Riot ID.
  const setRoleHotkey = (role: Role) => () => {
    const el = document.activeElement;
    const tag = el?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    setMyRole(role);
  };
  useGlobalShortcut({ key: "1" }, setRoleHotkey("TOP"));
  useGlobalShortcut({ key: "2" }, setRoleHotkey("JUNGLE"));
  useGlobalShortcut({ key: "3" }, setRoleHotkey("MIDDLE"));
  useGlobalShortcut({ key: "4" }, setRoleHotkey("BOTTOM"));
  useGlobalShortcut({ key: "5" }, setRoleHotkey("UTILITY"));
  // R = reset draft (same input-guard).
  useGlobalShortcut({ key: "r" }, () => {
    const el = document.activeElement;
    const tag = el?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    reset();
  });

  // Esc closes palette
  useEscape(() => setShowPalette(false), showPalette);

  const commands: Command[] = [
    { id: "tier", label: "Tier List", action: () => setShowTierList(true) },
    { id: "lookup", label: "Buscar jugador (Riot ID)", action: () => setShowLookup(true) },
    { id: "pro", label: "Pro Players (LCK / LEC / LCS)", action: () => setShowProPlayers(true) },
    { id: "coach", label: "Abrir Coach (post-game)", action: () => setShowCoach(true) },
    { id: "lesson", label: "Plan de mejora 7 días", action: () => setShowLessonPlan(true) },
    { id: "live", label: "Partida en directo (live)", action: () => setShowLiveGame(true) },
    { id: "chat", label: "Hablar con AI Coach", action: () => setShowChat(true) },
    { id: "trends", label: "Ver tendencias", action: () => setShowTrends(true) },
    { id: "history", label: "Historial", action: () => setShowHistory(true) },
    { id: "prefs", label: "Preferencias", action: () => setShowPrefs(true) },
    { id: "diag", label: "Diagnóstico de conexión", action: () => setShowDiag(true) },
    { id: "privacy", label: "Mis datos / privacidad", action: () => setShowPrivacy(true) },
    { id: "settings", label: "Configuración Riot", action: () => setShowSettings(true) },
    // Diagnostic: force the overlay window visible regardless of in-game
    // detection. Lets us tell apart "overlay never opened" (Tauri config
    // bug) from "overlay open but hidden under fullscreen-exclusive game"
    // (LoL window-mode issue — user needs Borderless).
    {
      id: "overlay-force",
      label: "🔍 Forzar overlay visible (test)",
      action: async () => {
        // Center-ish position so it can't be off-screen on multi-monitor
        // setups with weird DPI scaling.
        await setOverlayPosition(200, 200);
        await setOverlayVisible(true);
      },
    },
    {
      id: "overlay-hide",
      label: "Ocultar overlay",
      action: () => setOverlayVisible(false),
    },
    { id: "about", label: "ℹ️ Acerca de / Versión / Buscar updates", action: () => setShowAbout(true) },
    { id: "shortcuts", label: "⌨️ Atajos de teclado (Ctrl+/)", action: () => setShowShortcuts(true) },
    {
      id: "center-window",
      label: "🪟 Centrar ventana principal",
      action: async () => {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("center_main_window");
        } catch {
          /* command may not exist outside Tauri */
        }
      },
    },
  ];

  // Sync UI locale pref → i18next whenever it changes. main.tsx already
  // seeded the initial locale from localStorage for first-paint; this
  // effect handles runtime changes (user picks a new locale in Settings).
  const uiLocale = usePrefsStore((s) => s.prefs.uiLocale);
  useEffect(() => {
    setUiLocale(uiLocale);
  }, [uiLocale]);

  // Sentry navigation breadcrumbs — one hook call per view modal.
  // Extracted from a wall of 10 useEffects that all did the same
  // `trackNavigation(name, open?"open":"close")` thing.
  useViewBreadcrumb("SettingsView", showSettings);
  useViewBreadcrumb("HistoryView", showHistory);
  useViewBreadcrumb("CoachView", showCoach);
  useViewBreadcrumb("PreferencesView", showPrefs);
  useViewBreadcrumb("DiagnosticsView", showDiag);
  useViewBreadcrumb("AiChatView", showChat);
  useViewBreadcrumb("DataPrivacyView", showPrivacy);
  useViewBreadcrumb("TierListView", showTierList);
  useViewBreadcrumb("ProPlayersView", showProPlayers);
  useViewBreadcrumb("ChampionGuideView", !!guideChampionKey);

  // Sentry global tags — pushed to the scope so every event carries
  // session context. Extracted to a hook.
  useSentrySessionTags({
    uiLocale,
    patch: db?.patch ?? null,
    lcuConnected: lcuStatus.connected,
    gamePhase: gamePhase.phase,
  });

  useEffect(() => {
    // Probe the Rust pre-boot recovery marker BEFORE loading prefs so
    // the flag is set by the time the toast effect (further down) runs.
    // Race-safe: probeRustRecoveryMarker is idempotent and Rust deletes
    // the marker after the first successful read.
    probeRustRecoveryMarker().finally(() => loadPrefs());
  }, [loadPrefs]);

  // Mirrors telemetry pref → localStorage + shuts down Sentry mid-session.
  useTelemetryConsent(prefs.telemetryEnabled);

  // Sync Riot proxy URL into the API client whenever prefs change. Lets the
  // user toggle proxy mode without restarting the app.
  useEffect(() => {
    setRiotProxyUrl(prefs.riotProxyUrl || null);
  }, [prefs.riotProxyUrl]);

  // Reload personal stats whenever role changes — so the engine uses
  // only your data in that specific role (mid CS != support CS).
  useEffect(() => {
    personalStatsByChampion(myRole ? { position: myRole } : undefined).then(
      setPersonalStats
    );
  }, [myRole]);

  // Wait until prefs are hydrated before loading the champion DB so the
  // meta source selection (especially dpm.lol bracket/region/timeframe)
  // is visible to readMetaSourcePref(). Without this gate the first load
  // races prefsStore.load() and always falls back to op.gg defaults.

  // LCU lifecycle toasts (connect/disconnect + champion lock) extracted
  // to hooks. Each one owns its own useEffect + dedup state so App.tsx
  // stays a layout shell instead of a toast-router.
  useLcuConnectToasts(lcuStatus);
  useChampionLockToast(db);

  // System-level toasts: fetch failures + patch update + DB corruption
  // recovery. All three combined into one hook to keep the shell clean.
  useSystemToasts(pushToast);

  // Role derivation — fixes nonsense role when queue assigns one the
  // champion can't play (e.g. UTILITY + Kha'Zix → switch to JUNGLE).
  useRoleDerivation({
    db,
    myChampionLocked,
    myChampionIntent,
    myRole,
    setMyRole,
  });

  const { allyKeys, enemyKeys, enemyChampionIds, bannedKeys } =
    useDraftDerivations({ ally, enemy, bans });

  const suggestions = useSuggestions({
    db,
    role: myRole,
    allyKeys,
    enemyKeys,
    bannedKeys,
    personalStats,
    masteries,
    rankTier,
    usePersonalStats: prefs.usePersonalStats,
    useMastery: prefs.useMastery,
  });

  const draftPrediction = useDraftPrediction(db, allyKeys, enemyKeys);

  // In-game, the champion the player is ACTUALLY on (from the Live Client)
  // is the source of truth — champ select is over, so myChampionLocked /
  // intent are cleared and the old code fell through to suggestions[0]
  // (the top meta pick for the role), showing e.g. Warwick's build while
  // the player is on Jarvan. Derive the live champion and prefer it.
  // Only recomputes the KEY when it actually changes (stable per match).
  const liveGame = useLiveGame(true);
  const liveChampKey = useMemo(() => {
    if (!db || !liveGame.inGame || !liveGame.snapshot) return null;
    const me = findMyPlayer(
      liveGame.snapshot.activePlayer,
      liveGame.snapshot.allPlayers
    );
    return me ? liveChampionKey(db, me) : null;
  }, [db, liveGame.inGame, liveGame.snapshot]);

  // Priority: live (in-game truth) → locked → hovered intent → top suggestion.
  const buildChampionKey =
    liveChampKey ??
    myChampionLocked ??
    myChampionIntent ??
    suggestions[0]?.champion.key ??
    null;

  if (error) {
    return (
      <main className="h-full flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-bg-card border border-bad/40 rounded-lg p-6 space-y-4">
          <div>
            <p className="text-lg font-semibold text-bad">
              No pude cargar los datos
            </p>
            <p className="text-sm text-white/65 mt-2">
              Algo bloqueó la primera descarga de campeones y meta. Suele ser
              red sin conexión o el backend caído.
            </p>
          </div>
          <details className="text-xs text-white/45">
            <summary className="cursor-pointer hover:text-white/70">
              Detalles técnicos
            </summary>
            <pre className="mt-2 p-2 bg-bg rounded text-[10px] overflow-auto max-h-32">
              {error}
            </pre>
          </details>
          <div className="flex gap-2">
            <button
              onClick={retryDbBoot}
              className="flex-1 px-3 py-2 bg-accent text-black font-medium rounded hover:bg-accent-deep transition"
            >
              Reintentar
            </button>
            <button
              onClick={() => {
                retryDbBoot();
                setShowDiag(true);
              }}
              className="flex-1 px-3 py-2 bg-bg-elev border border-border-subtle text-white/80 rounded hover:bg-bg-card transition"
            >
              Diagnóstico
            </button>
          </div>
          <p className="text-[10px] text-white/40 text-center">
            La app sigue funcionando offline si ya cargaste datos antes.
          </p>
        </div>
        {showDiag && <DiagnosticsView onClose={() => setShowDiag(false)} />}
      </main>
    );
  }

  if (!db) {
    return (
      <TermsGate>
        <main className="min-h-full p-4 space-y-4">
          {/* Replicate the real layout with skeletons so content lands in
              place when the DB resolves — avoids the page jump from a
              full-screen spinner to a full-screen layout. */}
          <div className="glass border border-border-subtle rounded-xl px-4 py-3 flex items-center gap-3 animate-pulse">
            <div className="w-10 h-10 rounded-full bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 bg-white/10 rounded" />
              <div className="h-2 w-48 bg-white/10 rounded" />
            </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
            <SkeletonPanel rows={10} title="Cargando draft board..." />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SkeletonPanel rows={6} />
              <SkeletonPanel rows={6} />
            </div>
          </div>
        </main>
      </TermsGate>
    );
  }

  return (
    <TermsGate>
    <main className="min-h-full p-4 space-y-4">
      <UpdateBanner />
      <NetworkStatusBanner />
      <FirstRunHealthBanner
        lcuConnected={lcuStatus.connected}
        onShowDiagnostics={() => setShowDiag(true)}
      />
      <OverlayCompatBanner />
      <PatchNewBanner db={db} masteries={masteries} />
      {/* Tracking diagnostic strip — always visible. When the user says
        * "nada funciona" we can read straight from the pills what's
        * actually connected vs missing. No more guessing. */}
      <TrackingStatusBar lcuStatus={lcuStatus} gamePhase={gamePhase.phase} />
      <header className="glass border border-border-subtle rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Logo />
          <div className="flex items-center gap-2">
            {lcuStatus.connected ? (
              <span
                className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md font-medium bg-good/15 text-good ring-1 ring-good/40"
                title="Cliente de LoL detectado"
              >
                <Wifi className="w-3 h-3" />
                Conectado
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/35"
                title={lcuStatus.reason ?? "Esperando que abras el cliente de LoL"}
              >
                <WifiOff className="w-3 h-3" />
                Esperando cliente
              </span>
            )}
            {prefs.liveTimer && <PhaseTimer />}
            <span className="text-[10px] uppercase tracking-widest text-white/40 font-medium">
              Patch {displayPatch(db.patch)}
            </span>
            {usingStaleCache && (
              <span
                className="text-[10px] uppercase tracking-widest text-meh font-medium px-1.5 py-0.5 rounded ring-1 ring-meh/40"
                title="Mostrando datos en caché — reintentando refresh en background"
              >
                Caché
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <HeaderBtn onClick={() => setShowChat(true)} primary icon={<Sparkles className="w-3.5 h-3.5" />} label="AI Coach" />
          <HeaderBtn onClick={() => setShowTierList(true)} icon={<Trophy className="w-3.5 h-3.5" />} label="Tier List" />
          <HeaderBtn onClick={() => setShowLookup(true)} icon={<UserSearch className="w-3.5 h-3.5" />} label="Buscar" />
          <HeaderBtn onClick={() => setShowLiveGame(true)} icon={<Radio className="w-3.5 h-3.5" />} label="Live" />
          <HeaderMenu
            label="Mi juego"
            icon={<GraduationCap className="w-3.5 h-3.5" />}
            items={[
              { label: "Coach post-partida", icon: <GraduationCap className="w-3.5 h-3.5" />, onClick: () => setShowCoach(true) },
              { label: "Tendencias", icon: <TrendingUp className="w-3.5 h-3.5" />, onClick: () => setShowTrends(true) },
              { label: "Historial", icon: <History className="w-3.5 h-3.5" />, onClick: () => setShowHistory(true) },
              { label: "Plan 7 días", icon: <Calendar className="w-3.5 h-3.5" />, onClick: () => setShowLessonPlan(true) },
            ]}
          />
          <HeaderMenu
            label="Ajustes"
            icon={<Cog className="w-3.5 h-3.5" />}
            items={[
              { label: "Preferencias", icon: <SlidersHorizontal className="w-3.5 h-3.5" />, onClick: () => setShowPrefs(true) },
              { label: "Configuración Riot", icon: <Cog className="w-3.5 h-3.5" />, onClick: () => setShowSettings(true) },
              { label: "Diagnóstico", icon: <Activity className="w-3.5 h-3.5" />, onClick: () => setShowDiag(true) },
            ]}
          />
          <select
            value={myRole ?? ""}
            onChange={(e) =>
              setMyRole((e.target.value || null) as Role | null)
            }
            className="bg-bg-elev text-white text-sm px-2 py-1 rounded border border-border-subtle"
          >
            <option value="">Mi rol</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </header>

      {gamePhase.phase === "InProgress" && <InGameTimers />}

      {/* Multi-column layout: draft board on the left, a TWO-column right
          rail so panels distribute horizontally instead of becoming one
          giant scroll-needing column. Falls back to single column on
          narrow viewports. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
        <DraftBoard db={db} lcuConnected={lcuStatus.connected} />
        <div
          className={`grid grid-cols-1 lg:grid-cols-2 ${prefs.compactMode ? "gap-2" : "gap-4"}`}
        >
          {/* Column A — actionable: trades, suggestions, build, live game */}
          <div className={prefs.compactMode ? "space-y-2" : "space-y-4"}>
            {prefs.showDraftWinrate && draftPrediction && (
              <DraftWinrateBadge pred={draftPrediction} />
            )}
            <TradeSuggestionPanel
              db={db}
              myRole={myRole}
              myCurrentPick={myChampionLocked ?? myChampionIntent}
              allyKeys={allyKeys}
              enemyKeys={enemyKeys}
              bannedKeys={bannedKeys}
            />
            {prefs.showSuggestions && (
              <SuggestionPanel
                suggestions={suggestions}
                hasRole={!!myRole}
                hasDraft={allyKeys.length > 0 || enemyKeys.length > 0}
              />
            )}
            {prefs.showBuildPanel && buildChampionKey && myRole && (
              <PanelBoundary name="BuildPanel">
                <BuildPanel
                  db={db}
                  championKey={buildChampionKey}
                  role={myRole}
                  enemyKeys={enemyKeys}
                />
              </PanelBoundary>
            )}
            {/* Live game panel — only renders when a real LoL match is in
                progress. Auto-hides between games. Polls localhost:2999. */}
            <PanelBoundary name="LiveGamePanel">
              <LiveGamePanel db={db} />
            </PanelBoundary>
            <PanelBoundary name="BanSuggestionsPanel">
              <BanSuggestionsPanel
                db={db}
                role={myRole}
                bannedKeys={bans.ally.concat(bans.enemy)}
                pickedKeys={[...allyKeys, ...enemyKeys]}
              />
            </PanelBoundary>
          </div>

          {/* Column B — context: scouts, comp, matchups, mains, patch */}
          <div className={prefs.compactMode ? "space-y-2" : "space-y-4"}>
            {/* Lobby scout — only renders when LCU has a live champ select
                session. Shows rank + level + win-rate per teammate (and
                enemies when their names are visible). Re-runs only on
                roster changes, not on every hover. */}
            <PanelBoundary name="LobbyScoutPanel">
              <LobbyScoutPanel session={lcuSession} db={db} />
            </PanelBoundary>
            {prefs.showCompAnalysis && (
              <PanelBoundary name="CompAnalysis">
                <CompAnalysis db={db} allyKeys={allyKeys} />
              </PanelBoundary>
            )}
            <PanelBoundary name="MatchupTipsPanel">
              <MatchupTipsPanel
                db={db}
                enemyKeys={enemyKeys}
                myChampionKey={buildChampionKey}
                myRole={myRole}
              />
            </PanelBoundary>
            {prefs.showEnemyScout && (
              <PanelBoundary name="EnemyScoutPanel">
                <EnemyScoutPanel
                  db={db}
                  enemySummonerIds={enemySummonerIds}
                  enemyChampionIds={enemyChampionIds}
                />
              </PanelBoundary>
            )}
            {/* Win Conditions — game plan derived from comp matchup.
              * Renders top of side rail so the user sees the tactical
              * objective first, before the deeper context panels. */}
            <PanelBoundary name="WinConditionsPanel">
              <WinConditionsPanel
                db={db}
                myChampionKey={buildChampionKey}
                myRole={myRole}
                allyKeys={allyKeys}
                enemyKeys={enemyKeys}
              />
            </PanelBoundary>
            {/* Pre-game tip carousel — rotating champion/role-specific
              * one-liner advice. Replaces dead space with actionable
              * tactical reminders. Auto-hides when no role/champ. */}
            <PanelBoundary name="TipCarousel">
              <TipCarousel
                champion={buildChampionKey ? db.champions[buildChampionKey] ?? null : null}
                role={myRole}
              />
            </PanelBoundary>
            <PlaystylePanel />
            <PatchImpactPanel db={db} masteries={masteries} />
            <ChampionPoolPanel db={db} masteries={masteries} />
            <OwnMasteriesPanel
              db={db}
              masteries={masteries}
              personalStats={personalStats}
            />
          </div>
        </div>
      </div>

      <AppFooter
        onShowChangelog={() => {
          // Click on the version pill → show the changelog for THIS
          // build, regardless of whether the user has dismissed it
          // previously. Uses the same modal, `forceVersion` mode.
          const v = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
          setForceChangelogVersion(v);
        }}
        onShowDiagnostics={() => setShowDiag(true)}
      />
      {forceChangelogVersion && (
        <ChangelogModal
          forceVersion={forceChangelogVersion}
          onClose={() => setForceChangelogVersion(null)}
        />
      )}

      <Toaster />
      {/* Each lazy view wrapped in ViewBoundary so a crash inside one
          view doesn't take down the whole app (the root SentryErrorBoundary
          would otherwise blank the screen). ViewBoundary tags Sentry with
          the viewName and offers Reintentar + Cerrar to recover. */}
      <Suspense fallback={null}>
        {showSettings && (
          <ViewBoundary viewName="SettingsView" onClose={() => setShowSettings(false)}>
            <SettingsView onClose={() => setShowSettings(false)} />
          </ViewBoundary>
        )}
        {showHistory && (
          <ViewBoundary viewName="HistoryView" onClose={() => setShowHistory(false)}>
            <HistoryView db={db} onClose={() => setShowHistory(false)} />
          </ViewBoundary>
        )}
        {showCoach && (
          <ViewBoundary viewName="CoachView" onClose={() => setShowCoach(false)}>
            <CoachView db={db} onClose={() => setShowCoach(false)} />
          </ViewBoundary>
        )}
        {showTrends && (
          <ViewBoundary viewName="TrendsView" onClose={() => setShowTrends(false)}>
            <TrendsView db={db} onClose={() => setShowTrends(false)} />
          </ViewBoundary>
        )}
        {showPrefs && (
          <ViewBoundary viewName="PreferencesView" onClose={() => setShowPrefs(false)}>
            <PreferencesView onClose={() => setShowPrefs(false)} />
          </ViewBoundary>
        )}
        {showDiag && (
          <ViewBoundary viewName="DiagnosticsView" onClose={() => setShowDiag(false)}>
            <DiagnosticsView onClose={() => setShowDiag(false)} />
          </ViewBoundary>
        )}
        {showChat && (
          <ViewBoundary viewName="AiChatView" onClose={() => setShowChat(false)}>
            <AiChatView db={db} onClose={() => setShowChat(false)} />
          </ViewBoundary>
        )}
        {showPrivacy && (
          <ViewBoundary viewName="DataPrivacyView" onClose={() => setShowPrivacy(false)}>
            <DataPrivacyView onClose={() => setShowPrivacy(false)} />
          </ViewBoundary>
        )}
        {showTierList && (
          <ViewBoundary viewName="TierListView" onClose={() => setShowTierList(false)}>
            <TierListView
              db={db}
              onClose={() => setShowTierList(false)}
              onSelectChampion={(k) => {
                setShowTierList(false);
                setGuideChampionKey(k);
              }}
              onDbUpdate={setDb}
            />
          </ViewBoundary>
        )}
        {showLookup && (
          <ViewBoundary viewName="SummonerLookupView" onClose={() => setShowLookup(false)}>
            <SummonerLookupView db={db} onClose={() => setShowLookup(false)} />
          </ViewBoundary>
        )}
        {showProPlayers && (
          <ViewBoundary viewName="ProPlayersView" onClose={() => setShowProPlayers(false)}>
            <ProPlayersView db={db} onClose={() => setShowProPlayers(false)} />
          </ViewBoundary>
        )}
        {showLessonPlan && (
          <ViewBoundary viewName="LessonPlanView" onClose={() => setShowLessonPlan(false)}>
            <LessonPlanView db={db} onClose={() => setShowLessonPlan(false)} />
          </ViewBoundary>
        )}
        {showLiveGame && (
          <ViewBoundary viewName="LiveGameView" onClose={() => setShowLiveGame(false)}>
            <LiveGameView db={db} onClose={() => setShowLiveGame(false)} />
          </ViewBoundary>
        )}
        {guideChampionKey && (
          <ViewBoundary
            viewName="ChampionGuideView"
            onClose={() => setGuideChampionKey(null)}
          >
            <ChampionGuideView
              db={db}
              championKey={guideChampionKey}
              onClose={() => setGuideChampionKey(null)}
            />
          </ViewBoundary>
        )}
        {!prefs.onboardingDone && (
          <ViewBoundary viewName="OnboardingView">
            <OnboardingView
              onClose={() => usePrefsStore.getState().set("onboardingDone", true)}
            />
          </ViewBoundary>
        )}
      </Suspense>
      {showPalette && (
        <CommandPalette
          commands={commands}
          onClose={() => setShowPalette(false)}
        />
      )}
      {/* AboutModal + ShortcutsHelp are lazy — wrap their conditional
          mount in Suspense so the chunk fetch doesn't error. Empty
          fallback keeps the user's previous focus while the chunk
          loads (modals open instantly perceptually). */}
      <Suspense fallback={null}>
        {showAbout && (
          <ViewBoundary viewName="AboutModal" onClose={() => setShowAbout(false)}>
            <AboutModal onClose={() => setShowAbout(false)} />
          </ViewBoundary>
        )}
        {showShortcuts && (
          <ViewBoundary viewName="ShortcutsHelp" onClose={() => setShowShortcuts(false)}>
            <ShortcutsHelp onClose={() => setShowShortcuts(false)} />
          </ViewBoundary>
        )}
      </Suspense>
      {/* Auto-shows once when the running version differs from the last
          shown one. Suppressed on first install. No-op when no entry
          exists for the current version. */}
      <ChangelogModal />
    </main>
    </TermsGate>
  );
}

interface HeaderBtnProps {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  title?: string;
}

function HeaderBtn({ onClick, icon, label, primary, title }: HeaderBtnProps) {
  const base = "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition";
  const styles = primary
    ? "bg-gradient-to-br from-accent-soft/20 to-accent/15 text-accent ring-1 ring-accent/40 hover:ring-accent hover:from-accent-soft/30"
    : "bg-bg-elev/60 text-white/75 ring-1 ring-border-subtle hover:ring-accent/60 hover:text-white";
  return (
    <button onClick={onClick} className={`${base} ${styles}`} title={title ?? label}>
      {icon}
      {label && <span className="font-medium">{label}</span>}
    </button>
  );
}

export default App;
