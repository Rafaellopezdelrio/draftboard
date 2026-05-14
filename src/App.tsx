import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import "./App.css";
import { loadChampionDb } from "./services/championDb";
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
import { BanSuggestionsPanel } from "./components/BanSuggestionsPanel";
import { MatchupTipsPanel } from "./components/MatchupTipsPanel";
import { ChampionPoolPanel } from "./components/ChampionPoolPanel";
import { InGameTimers } from "./components/InGameTimers";
import { PlaystylePanel } from "./components/PlaystylePanel";
import { TradeSuggestionPanel } from "./components/TradeSuggestionPanel";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { useEscape, useGlobalShortcut } from "./hooks/useKeyboardShortcuts";
import { voiceCoach } from "./services/voiceCoach";
import { lcuMasteries, lcuRank } from "./services/lcuPersonalData";
import { useScheduledJobs } from "./state/scheduledJobs";
import { useGamePhase } from "./state/inGameDetection";
import { setCoachEloBucket } from "./engine/coachEngine";
import { predictDraftWinrate } from "./engine/draftWinrateEngine";
import { personalStatsByChampion } from "./services/matchRepo";
import { loadSettings } from "./services/settingsRepo";
import { getTopMasteries, type ChampionMasteryDto } from "./services/riotApi";
import type { ChampionPersonalStat } from "./services/matchRepo";
import { usePrefsStore } from "./state/prefsStore";
import { useAutoActions } from "./state/autoActions";

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
  } = useDraftStore();
  const lcuStatus = useLcuSync();
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
  const [guideChampionKey, setGuideChampionKey] = useState<string | null>(null);
  const [personalStats, setPersonalStats] = useState<ChampionPersonalStat[]>([]);
  const [masteries, setMasteries] = useState<ChampionMasteryDto[]>([]);
  const gamePhase = useGamePhase();

  useAutoActions({ db });
  useScheduledJobs();

  // Voice coach init
  useEffect(() => {
    voiceCoach.init();
  }, []);
  useEffect(() => {
    voiceCoach.setEnabled(prefs.voiceCoachEnabled);
    voiceCoach.setLanguage(prefs.aiCoachLanguage);
  }, [prefs.voiceCoachEnabled, prefs.aiCoachLanguage]);

  // Ctrl+K to open command palette
  useGlobalShortcut({ key: "k", ctrl: true }, () => setShowPalette(true));

  // Esc closes palette
  useEscape(() => setShowPalette(false), showPalette);

  const commands: Command[] = [
    { id: "tier", label: "Tier List", action: () => setShowTierList(true) },
    { id: "lookup", label: "Buscar jugador (Riot ID)", action: () => setShowLookup(true) },
    { id: "pro", label: "Pro Players (LCK / LEC / LCS)", action: () => setShowProPlayers(true) },
    { id: "coach", label: "Abrir Coach (post-game)", action: () => setShowCoach(true) },
    { id: "chat", label: "Hablar con AI Coach", action: () => setShowChat(true) },
    { id: "trends", label: "Ver tendencias", action: () => setShowTrends(true) },
    { id: "history", label: "Historial", action: () => setShowHistory(true) },
    { id: "prefs", label: "Preferencias", action: () => setShowPrefs(true) },
    { id: "diag", label: "Diagnóstico de conexión", action: () => setShowDiag(true) },
    { id: "privacy", label: "Mis datos / privacidad", action: () => setShowPrivacy(true) },
    { id: "settings", label: "Configuración Riot", action: () => setShowSettings(true) },
  ];

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

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
      if (rank) setCoachEloBucket(rank.tier);
    })();
  }, [lcuStatus.connected]);

  // Reload personal stats whenever role changes — so the engine uses
  // only your data in that specific role (mid CS != support CS).
  useEffect(() => {
    personalStatsByChampion(myRole ? { position: myRole } : undefined).then(
      setPersonalStats
    );
  }, [myRole]);

  useEffect(() => {
    loadChampionDb().then(setDb).catch((e) => setError(String(e)));
  }, []);

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
      <main className="h-full flex items-center justify-center text-bad p-8 text-center">
        <div>
          <p className="text-lg font-semibold">Error cargando datos</p>
          <p className="text-sm mt-2 text-white/60">{error}</p>
        </div>
      </main>
    );
  }

  if (!db) {
    return (
      <main className="h-full flex items-center justify-center text-white/60">
        Cargando datos de campeones...
      </main>
    );
  }

  return (
    <main className="min-h-full p-4 space-y-4">
      <header className="glass border border-border-subtle rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Logo />
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md font-medium ${
                lcuStatus.connected
                  ? "bg-good/15 text-good ring-1 ring-good/40"
                  : "bg-white/5 text-white/50 ring-1 ring-white/10"
              }`}
              title={lcuStatus.reason ?? ""}
            >
              {lcuStatus.connected ? (
                <Wifi className="w-3 h-3" />
              ) : (
                <WifiOff className="w-3 h-3" />
              )}
              {lcuStatus.connected ? "Cliente conectado" : "Modo manual"}
            </span>
            {prefs.liveTimer && <PhaseTimer />}
            <span className="text-[10px] uppercase tracking-widest text-white/40 font-medium">
              Patch {db.patch}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <HeaderBtn onClick={() => setShowChat(true)} primary icon={<Sparkles className="w-3.5 h-3.5" />} label="AI Coach" />
          <HeaderBtn onClick={() => setShowTierList(true)} icon={<Trophy className="w-3.5 h-3.5" />} label="Tier List" />
          <HeaderBtn onClick={() => setShowLookup(true)} icon={<UserSearch className="w-3.5 h-3.5" />} label="Buscar" />
          <HeaderBtn onClick={() => setShowCoach(true)} icon={<GraduationCap className="w-3.5 h-3.5" />} label="Coach" />
          <HeaderBtn onClick={() => setShowTrends(true)} icon={<TrendingUp className="w-3.5 h-3.5" />} label="Trends" />
          <HeaderBtn onClick={() => setShowHistory(true)} icon={<History className="w-3.5 h-3.5" />} label="Historial" />
          <HeaderBtn onClick={() => setShowPrefs(true)} icon={<SlidersHorizontal className="w-3.5 h-3.5" />} label="Prefs" />
          <HeaderBtn onClick={() => setShowDiag(true)} icon={<Activity className="w-3.5 h-3.5" />} label="Diag" />
          <HeaderBtn onClick={() => setShowSettings(true)} icon={<Cog className="w-3.5 h-3.5" />} label="" title="Configuración" />
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

      <div className="grid grid-cols-[2fr_320px] gap-4">
        <DraftBoard db={db} lcuConnected={lcuStatus.connected} />
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
            <BuildPanel
              db={db}
              championKey={buildChampionKey}
              role={myRole}
              enemyKeys={enemyKeys}
            />
          )}
          <BanSuggestionsPanel
            db={db}
            role={myRole}
            bannedKeys={bans.ally.concat(bans.enemy)}
            pickedKeys={[...allyKeys, ...enemyKeys]}
          />
          {prefs.showCompAnalysis && (
            <CompAnalysis db={db} allyKeys={allyKeys} />
          )}
          <MatchupTipsPanel db={db} enemyKeys={enemyKeys} />
          {prefs.showEnemyScout && (
            <EnemyScoutPanel
              db={db}
              enemySummonerIds={enemySummonerIds}
              enemyChampionIds={enemyChampionIds}
            />
          )}
          <PlaystylePanel />
          <ChampionPoolPanel db={db} masteries={masteries} />
          <OwnMasteriesPanel
            db={db}
            masteries={masteries}
            personalStats={personalStats}
          />
        </div>
      </div>

      <Toaster />
      <Suspense fallback={null}>
        {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}
        {showHistory && (
          <HistoryView db={db} onClose={() => setShowHistory(false)} />
        )}
        {showCoach && <CoachView db={db} onClose={() => setShowCoach(false)} />}
        {showTrends && <TrendsView db={db} onClose={() => setShowTrends(false)} />}
        {showPrefs && <PreferencesView onClose={() => setShowPrefs(false)} />}
        {showDiag && <DiagnosticsView onClose={() => setShowDiag(false)} />}
        {showChat && <AiChatView db={db} onClose={() => setShowChat(false)} />}
        {showPrivacy && (
          <DataPrivacyView onClose={() => setShowPrivacy(false)} />
        )}
        {showTierList && (
          <TierListView
            db={db}
            onClose={() => setShowTierList(false)}
            onSelectChampion={(k) => {
              setShowTierList(false);
              setGuideChampionKey(k);
            }}
          />
        )}
        {showLookup && (
          <SummonerLookupView db={db} onClose={() => setShowLookup(false)} />
        )}
        {showProPlayers && (
          <ProPlayersView db={db} onClose={() => setShowProPlayers(false)} />
        )}
        {guideChampionKey && (
          <ChampionGuideView
            db={db}
            championKey={guideChampionKey}
            onClose={() => setGuideChampionKey(null)}
          />
        )}
        {!prefs.onboardingDone && (
          <OnboardingView
            onClose={() => usePrefsStore.getState().set("onboardingDone", true)}
          />
        )}
      </Suspense>
      {showPalette && (
        <CommandPalette
          commands={commands}
          onClose={() => setShowPalette(false)}
        />
      )}
    </main>
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
