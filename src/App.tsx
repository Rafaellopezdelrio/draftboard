import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { loadChampionDb } from "./services/championDb";
import { useDraftStore } from "./state/draftStore";
import type { ChampionDb, Role } from "./types/champion";
import { suggest } from "./engine/suggestionEngine";
import { DraftBoard } from "./components/DraftBoard";
import { SuggestionPanel } from "./components/SuggestionPanel";
import { CompAnalysis } from "./components/CompAnalysis";
import { useLcuSync } from "./state/lcuSync";
import { SettingsView } from "./components/SettingsView";
import { HistoryView } from "./components/HistoryView";
import { CoachView } from "./components/CoachView";
import { EnemyScoutPanel } from "./components/EnemyScoutPanel";
import { TrendsView } from "./components/TrendsView";
import { BuildPanel } from "./components/BuildPanel";
import { DraftWinrateBadge } from "./components/DraftWinrateBadge";
import { PreferencesView } from "./components/PreferencesView";
import { OwnMasteriesPanel } from "./components/OwnMasteriesPanel";
import { PhaseTimer } from "./components/PhaseTimer";
import { BanSuggestionsPanel } from "./components/BanSuggestionsPanel";
import { OnboardingView } from "./components/OnboardingView";
import { lcuMasteries } from "./services/lcuPersonalData";
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
  const [personalStats, setPersonalStats] = useState<ChampionPersonalStat[]>([]);
  const [masteries, setMasteries] = useState<ChampionMasteryDto[]>([]);

  useAutoActions({ db });

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  // Try LCU first for masteries (no key needed); fall back to Riot API.
  useEffect(() => {
    (async () => {
      const fromLcu = await lcuMasteries();
      if (fromLcu.length > 0) {
        setMasteries(fromLcu);
        return;
      }
      const cfg = await loadSettings();
      if (cfg?.puuid && cfg.apiKey) {
        getTopMasteries(cfg, cfg.puuid, 20).then(setMasteries).catch(() => {});
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
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-accent">LoL Draft Advisor</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-xs px-2 py-1 rounded ${lcuStatus.connected ? "bg-good/20 text-good" : "bg-white/5 text-white/50"}`}
            title={lcuStatus.reason ?? ""}
          >
            {lcuStatus.connected ? "Cliente conectado" : "Modo manual"}
          </span>
          {prefs.liveTimer && <PhaseTimer />}
          <span className="text-xs text-white/40">Patch {db.patch}</span>
          <button
            onClick={() => setShowCoach(true)}
            className="px-2 py-1 text-xs bg-bg-elev border border-border-subtle rounded hover:border-accent text-white/80"
          >
            Coach
          </button>
          <button
            onClick={() => setShowTrends(true)}
            className="px-2 py-1 text-xs bg-bg-elev border border-border-subtle rounded hover:border-accent text-white/80"
          >
            Trends
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className="px-2 py-1 text-xs bg-bg-elev border border-border-subtle rounded hover:border-accent text-white/80"
          >
            Historial
          </button>
          <button
            onClick={() => setShowPrefs(true)}
            className="px-2 py-1 text-xs bg-bg-elev border border-border-subtle rounded hover:border-accent text-white/80"
            title="Preferencias"
          >
            Prefs
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="px-2 py-1 text-xs bg-bg-elev border border-border-subtle rounded hover:border-accent text-white/80"
          >
            ⚙
          </button>
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

      <div className="grid grid-cols-[2fr_320px] gap-4">
        <DraftBoard db={db} lcuConnected={lcuStatus.connected} />
        <div className={prefs.compactMode ? "space-y-2" : "space-y-4"}>
          {prefs.showDraftWinrate && draftPrediction && (
            <DraftWinrateBadge pred={draftPrediction} />
          )}
          {prefs.showSuggestions && (
            <SuggestionPanel suggestions={suggestions} />
          )}
          {prefs.showBuildPanel && buildChampionKey && myRole && (
            <BuildPanel
              db={db}
              championKey={buildChampionKey}
              role={myRole}
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
          {prefs.showEnemyScout && (
            <EnemyScoutPanel
              db={db}
              enemySummonerIds={enemySummonerIds}
              enemyChampionIds={enemyChampionIds}
            />
          )}
          <OwnMasteriesPanel
            db={db}
            masteries={masteries}
            personalStats={personalStats}
          />
        </div>
      </div>

      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}
      {showHistory && (
        <HistoryView db={db} onClose={() => setShowHistory(false)} />
      )}
      {showCoach && <CoachView db={db} onClose={() => setShowCoach(false)} />}
      {showTrends && <TrendsView onClose={() => setShowTrends(false)} />}
      {showPrefs && <PreferencesView onClose={() => setShowPrefs(false)} />}
      {!prefs.onboardingDone && (
        <OnboardingView onClose={() => usePrefsStore.getState().set("onboardingDone", true)} />
      )}
    </main>
  );
}

export default App;
