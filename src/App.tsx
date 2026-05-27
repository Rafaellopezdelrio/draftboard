import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import "./App.css";
import { loadChampionDb, readChampionDbCacheUnsafe } from "./services/championDb";
import { trackEvent, trackFetch, trackNavigation } from "./services/breadcrumbs";
import { mark, measure, warnIfSlow } from "./services/perf";
import { useDraftStore } from "./state/draftStore";
import type { ChampionDb, Role } from "./types/champion";
import { suggest } from "./engine/suggestionEngine";
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
import { CHAMPION_ROLES } from "./data/championRoles";
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
import { lcuMasteries, lcuRank } from "./services/lcuPersonalData";
import { useScheduledJobs } from "./state/scheduledJobs";
import { useGamePhase } from "./state/inGameDetection";
import { setCoachEloBucket } from "./engine/coachEngine";
import { predictDraftWinrate } from "./engine/draftWinrateEngine";
import { personalStatsByChampion } from "./services/matchRepo";
import { loadSettings } from "./services/settingsRepo";
import { getTopMasteries, setRiotProxyUrl, type ChampionMasteryDto } from "./services/riotApi";
import type { ChampionPersonalStat } from "./services/matchRepo";
import { usePrefsStore } from "./state/prefsStore";
import {
  didRecoverFromCorruption,
  consumeCorruptionRecovery,
  probeRustRecoveryMarker,
} from "./db/client";
import { subscribeFetchFailure } from "./services/fetchNotify";
import { BOOT_TIMEOUTS_MS } from "./config";
import { PATCH_UPDATED_EVENT } from "./state/scheduledJobs";
import { setUiLocale } from "./i18n";
import { setSentryTags } from "./services/sentry";
import { useAutoActions } from "./state/autoActions";
import { useOverlayFollowLol } from "./hooks/useOverlayFollowLol";
import { useThemeAccent } from "./hooks/useThemeAccent";
import { useVoiceCoach } from "./hooks/useVoiceCoach";
import { useLcuConnectToasts, useChampionLockToast } from "./hooks/useLcuToasts";
import { useAutoOpenCoach } from "./hooks/useAutoOpenCoach";
import { startAutoProSync } from "./services/autoProSync";

const ROLES: Role[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

function App() {
  const [db, setDb] = useState<ChampionDb | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  const [guideChampionKey, setGuideChampionKey] = useState<string | null>(null);
  const [personalStats, setPersonalStats] = useState<ChampionPersonalStat[]>([]);
  // Rank tier from LCU (e.g. "GOLD", "DIAMOND", null when unranked or
  // the client isn't running). Passed to the suggest engine so it can
  // boost mastery weight for unranked players who have no rank signal
  // to anchor their meta calibration.
  const [rankTier, setRankTier] = useState<string | null>(null);
  const [masteries, setMasteries] = useState<ChampionMasteryDto[]>([]);
  const gamePhase = useGamePhase();

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

  // Sentry navigation breadcrumbs. Fires "open"/"close" for every
  // view modal. Sentry events captured AFTER a crash include this
  // trail — turns "TypeError at line 47" into "user opened History,
  // then Coach, then crashed in Coach". Each effect watches one flag
  // independently so React's useEffect dep diff catches the transition.
  useEffect(() => {
    trackNavigation("SettingsView", showSettings ? "open" : "close");
  }, [showSettings]);
  useEffect(() => {
    trackNavigation("HistoryView", showHistory ? "open" : "close");
  }, [showHistory]);
  useEffect(() => {
    trackNavigation("CoachView", showCoach ? "open" : "close");
  }, [showCoach]);
  useEffect(() => {
    trackNavigation("PreferencesView", showPrefs ? "open" : "close");
  }, [showPrefs]);
  useEffect(() => {
    trackNavigation("DiagnosticsView", showDiag ? "open" : "close");
  }, [showDiag]);
  useEffect(() => {
    trackNavigation("AiChatView", showChat ? "open" : "close");
  }, [showChat]);
  useEffect(() => {
    trackNavigation("DataPrivacyView", showPrivacy ? "open" : "close");
  }, [showPrivacy]);
  useEffect(() => {
    trackNavigation("TierListView", showTierList ? "open" : "close");
  }, [showTierList]);
  useEffect(() => {
    trackNavigation("ProPlayersView", showProPlayers ? "open" : "close");
  }, [showProPlayers]);
  useEffect(() => {
    trackNavigation("ChampionGuideView", guideChampionKey ? "open" : "close");
  }, [guideChampionKey]);

  // Right-click on a champion slot in the draft board dispatches this
  // event from DraftBoard. We open the guide modal for that champion
  // — saves a click vs going through TierList.
  useEffect(() => {
    const onShowGuide = (e: Event) => {
      const ce = e as CustomEvent<{ championKey: string }>;
      if (ce.detail?.championKey) {
        setGuideChampionKey(ce.detail.championKey);
      }
    };
    window.addEventListener("draft:show-champion-guide", onShowGuide);
    return () =>
      window.removeEventListener("draft:show-champion-guide", onShowGuide);
  }, []);

  // Sentry global tags. Pushed to the scope so every subsequent event
  // (errors, breadcrumbs, performance) carries this context. Useful in
  // the dashboard: filter "errors on patch 14.10 KR users in champ
  // select" instead of digging through stack traces. Tags are cheap +
  // ride along automatically with no per-event boilerplate.
  useEffect(() => {
    setSentryTags({
      locale: uiLocale,
      patch: db?.patch ?? null,
      lcuConnected: lcuStatus.connected,
      inGame: gamePhase.phase === "InProgress",
    });
  }, [uiLocale, db?.patch, lcuStatus.connected, gamePhase.phase]);

  useEffect(() => {
    // Probe the Rust pre-boot recovery marker BEFORE loading prefs so
    // the flag is set by the time the toast effect (further down) runs.
    // Race-safe: probeRustRecoveryMarker is idempotent and Rust deletes
    // the marker after the first successful read.
    probeRustRecoveryMarker().finally(() => loadPrefs());
  }, [loadPrefs]);

  // Mirror the telemetry pref into localStorage so the NEXT app boot can
  // read the user's choice synchronously (SQLite prefs hydrate async →
  // would miss early-crash window). Also call shutdownSentry mid-session
  // when the user flips the pref off, so consent withdrawal is immediate.
  useEffect(() => {
    try {
      localStorage.setItem(
        "draftboard:telemetry",
        prefs.telemetryEnabled ? "true" : "false"
      );
    } catch {
      // localStorage unavailable — fall through; next boot defaults to on.
    }
    if (!prefs.telemetryEnabled) {
      import("./services/sentry").then(({ shutdownSentry }) => {
        shutdownSentry().catch(() => {});
      });
    }
  }, [prefs.telemetryEnabled]);

  // Sync Riot proxy URL into the API client whenever prefs change. Lets the
  // user toggle proxy mode without restarting the app.
  useEffect(() => {
    setRiotProxyUrl(prefs.riotProxyUrl || null);
  }, [prefs.riotProxyUrl]);

  // Try LCU first for masteries (no key needed); fall back to Riot API.
  // Also pull the user's rank to calibrate coach benchmarks to their actual elo.
  useEffect(() => {
    (async () => {
      const fromLcu = await lcuMasteries();
      if (fromLcu.length > 0) {
        setMasteries(fromLcu);
      } else {
        const cfg = await loadSettings();
        if (cfg?.puuid && cfg.apiKey) {
          getTopMasteries(cfg, cfg.puuid, 20).then(setMasteries).catch(() => {});
        }
      }
      const rank = await lcuRank();
      if (rank) {
        setCoachEloBucket(rank.tier);
        setRankTier(rank.tier);
      } else {
        setRankTier(null);
      }
      // Tag Sentry events with an anonymised PUUID hash so we can group
      // "this same person hit this same bug" without ever knowing who
      // they are. Raw PUUID never leaves the device.
      try {
        const { getCurrentSummoner } = await import("./services/lcuService");
        const me = await getCurrentSummoner();
        if (me?.puuid) {
          const { setSentryAnonUser } = await import("./services/sentry");
          setSentryAnonUser(me.puuid);
        }
      } catch {
        // LCU offline — Sentry user stays unset.
      }
    })();
  }, [lcuStatus.connected]);


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
  const prefsLoaded = usePrefsStore((s) => s.loaded);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [usingStaleCache, setUsingStaleCache] = useState(false);
  const { push: pushToast } = useToast();

  // Bridge service-layer fetch failures to user-facing toasts.
  // Services emit via fetchNotify (throttled 30s/source) when a retry
  // chain exhausts — without this, panels just silently render empty
  // and the user has no idea the network/proxy is down. We dedupe by
  // source on the emitter side, so this subscriber stays dumb.
  useEffect(() => {
    return subscribeFetchFailure(({ source, error }) => {
      pushToast({
        type: "warn",
        title: `No se pudo cargar: ${source}`,
        detail:
          typeof error === "object" && error && "message" in error
            ? String((error as { message: unknown }).message).slice(0, 140)
            : "Comprueba tu conexión o reintenta en unos segundos.",
        durationMs: 6000,
      });
    });
  }, [pushToast]);

  // LCU lifecycle toasts (connect/disconnect + champion lock) extracted
  // to hooks. Each one owns its own useEffect + dedup state so App.tsx
  // stays a layout shell instead of a toast-router.
  useLcuConnectToasts(lcuStatus);
  useChampionLockToast(db);

  // Listen for the patch-poll signal (scheduledJobs fires this when
  // DDragon reports a new top version mid-session). Show an actionable
  // toast inviting the user to refresh — clicking the action button
  // forces a fresh champion DB load + reloads the UI to surface new
  // tier-list/build data immediately.
  useEffect(() => {
    function onPatchUpdate(e: Event) {
      const ce = e as CustomEvent<{ previous: string; latest: string }>;
      const latest = ce.detail?.latest ?? "?";
      pushToast({
        type: "info",
        title: `Nuevo parche ${latest} detectado`,
        detail: "Recarga la app para actualizar tier-list, builds y matchups.",
        durationMs: 0, // sticky — user opts in to refresh
        action: {
          label: "Recargar",
          onClick: () => window.location.reload(),
        },
      });
    }
    window.addEventListener(PATCH_UPDATED_EVENT, onPatchUpdate);
    return () => window.removeEventListener(PATCH_UPDATED_EVENT, onPatchUpdate);
  }, [pushToast]);

  // Surface a one-time toast if the DB was quarantined on boot due to
  // corruption. The flag is set inside db/client.ts when Database.load
  // fails and the retry-after-quarantine path succeeds. We poll once
  // shortly after mount — by then any first getDb() call (from prefs
  // load) has already fired and set the flag if recovery happened.
  useEffect(() => {
    const t = setTimeout(() => {
      if (didRecoverFromCorruption()) {
        pushToast({
          type: "warn",
          title: "Datos restablecidos",
          detail:
            "Tu base de datos estaba dañada y se ha guardado a un lado. La app arranca con datos en blanco para que puedas seguir usándola.",
          durationMs: 12000,
        });
        consumeCorruptionRecovery();
      }
    }, BOOT_TIMEOUTS_MS.recoveryProbeDelay);
    return () => clearTimeout(t);
  }, [pushToast]);

  useEffect(() => {
    if (!prefsLoaded) return;
    let cancelled = false;
    setError(null);
    setUsingStaleCache(false);
    mark("dbLoad:start");
    loadChampionDb()
      .then((loadedDb) => {
        if (cancelled) return;
        mark("dbLoad:end");
        const elapsed = measure("dbLoad:start", "dbLoad:end");
        // Boot budget: 2s. Anything slower indicates DDragon/worker
        // is sluggish or the user is on a poor connection. Breadcrumb
        // surfaces this in Sentry if a later error fires.
        warnIfSlow(elapsed, 2000, "Champion DB initial load", {
          patch: loadedDb.patch,
        });
        trackEvent("config", "Champion DB loaded", {
          patch: loadedDb.patch,
          champCount: Object.keys(loadedDb.champions).length,
          loadMs: Math.round(elapsed),
        });
        setDb(loadedDb);
        // Auto-sync pro-play data in the background once we have champion data.
        // Silent — fails gracefully if Leaguepedia is rate-limited.
        startAutoProSync(loadedDb);
      })
      .catch((e) => {
        if (cancelled) return;
        trackFetch("championDb", "fail", String(e).slice(0, 200));
        // Fresh load failed — try stale cache fallback so user isn't
        // dead-ended. Common cases: CF Worker down, DDragon flaky,
        // user opened the app immediately after losing internet.
        const stale = readChampionDbCacheUnsafe();
        if (stale) {
          setDb(stale);
          setUsingStaleCache(true);
          const ageMin = Math.round((Date.now() - stale.fetchedAt) / 60_000);
          const ageLabel =
            ageMin < 60 ? `hace ${ageMin}min` : `hace ${Math.round(ageMin / 60)}h`;
          pushToast({
            type: "warn",
            title: "Mostrando datos en caché",
            detail: `No pude refrescar (${ageLabel}). Reintento en background.`,
            durationMs: 8000,
          });
          // Background retry every minute until fresh load works.
          const t = setInterval(async () => {
            try {
              const fresh = await loadChampionDb(true);
              if (!cancelled) {
                setDb(fresh);
                setUsingStaleCache(false);
                clearInterval(t);
                pushToast({
                  type: "success",
                  title: "Datos actualizados",
                  detail: "Refresco completado.",
                });
              }
            } catch {
              // Keep retrying silently.
            }
          }, 60_000);
        } else {
          // No cache + load failure = hard error. User retries manually.
          setError(String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [prefsLoaded, bootAttempt]);

  // Role derivation. Two-step logic:
  //
  //   1. If myRole is null (Practice Tool / blind pick with no assigned
  //      position) AND we have a hovered/locked champion -> derive role
  //      from the champion's primary role in CHAMPION_ROLES.
  //
  //   2. If myRole IS set but the picked champion CAN'T play that role
  //      (e.g. queue assigned UTILITY but user picked Kha'Zix who's
  //      JUNGLE-only) -> override to the champion's primary role. Without
  //      this, BuildPanel + spell coherence + matchup grid all use the
  //      wrong role, producing nonsense ("Soporte pick → Ignite" for a
  //      jungler) and empty build data because op.gg has no support
  //      stats for Kha'Zix.
  //
  // We don't auto-override for borderline cases like Vayne TOP — those
  // are listed in CHAMPION_ROLES with both BOTTOM and TOP, so the role
  // check passes. Override only fires when the role is truly impossible.
  useEffect(() => {
    if (!db) return;
    const championKey = myChampionLocked ?? myChampionIntent;
    if (!championKey) return;
    const champ = db.champions[championKey];
    if (!champ) return;
    const allowedRoles = CHAMPION_ROLES[champ.id];
    if (!allowedRoles || allowedRoles.length === 0) return;

    if (!myRole) {
      setMyRole(allowedRoles[0]);
      return;
    }
    if (!allowedRoles.includes(myRole)) {
      // Hard role mismatch — switch to the champion's primary role.
      setMyRole(allowedRoles[0]);
    }
  }, [myRole, myChampionLocked, myChampionIntent, db, setMyRole]);

  const allyKeys = useMemo(
    () => ally.map((s) => s.championKey).filter((x): x is string => Boolean(x)),
    [ally]
  );
  const enemyKeys = useMemo(
    () => enemy.map((s) => s.championKey).filter((x): x is string => Boolean(x)),
    [enemy]
  );
  const enemyChampionIds = useMemo(
    () => enemy.map((s) => (s.championKey ? Number(s.championKey) : null)),
    [enemy]
  );
  const bannedKeys = useMemo(
    () => [...bans.ally, ...bans.enemy].filter(Boolean),
    [bans]
  );

  const suggestions = useMemo(() => {
    if (!db) return [];
    return suggest({
      db,
      role: myRole,
      allyKeys,
      enemyKeys,
      bannedKeys,
      personalStats: prefs.usePersonalStats ? personalStats : [],
      masteries: prefs.useMastery ? masteries : [],
      rankTier,
    });
  }, [
    db,
    myRole,
    allyKeys,
    enemyKeys,
    bannedKeys,
    personalStats,
    masteries,
    prefs.usePersonalStats,
    prefs.useMastery,
    rankTier,
  ]);

  const draftPrediction = useMemo(() => {
    if (!db || allyKeys.length === 0 || enemyKeys.length === 0) return null;
    return predictDraftWinrate({ db, allyKeys, enemyKeys });
  }, [db, allyKeys, enemyKeys]);

  // Use locked champion if available, else hovered intent, else first suggestion
  const buildChampionKey =
    myChampionLocked ?? myChampionIntent ?? suggestions[0]?.champion.key ?? null;

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
              onClick={() => {
                setError(null);
                setBootAttempt((n) => n + 1);
              }}
              className="flex-1 px-3 py-2 bg-accent text-black font-medium rounded hover:bg-accent-deep transition"
            >
              Reintentar
            </button>
            <button
              onClick={() => {
                setError(null);
                setBootAttempt((n) => n + 1);
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
