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
import { predictDraftWinrate } from "./engine/draftWinrateEngine";
import { personalStatsByChampion } from "./services/matchRepo";
import { loadSettings } from "./services/settingsRepo";
import { getTopMasteries, type ChampionMasteryDto } from "./services/riotApi";
import type { ChampionPersonalStat } from "./services/matchRepo";

const ROLES: Role[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

function App() {
  const [db, setDb] = useState<ChampionDb | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { ally, enemy, bans, myRole, setMyRole, enemySummonerIds } =
    useDraftStore();
  const lcuStatus = useLcuSync();
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [showTrends, setShowTrends] = useState(false);
  const [personalStats, setPersonalStats] = useState<ChampionPersonalStat[]>([]);
  const [masteries, setMasteries] = useState<ChampionMasteryDto[]>([]);

  useEffect(() => {
    personalStatsByChampion().then(setPersonalStats);
    loadSettings().then((cfg) => {
      if (cfg?.puuid) getTopMasteries(cfg, cfg.puuid, 20).then(setMasteries).catch(() => {});
    });
  }, []);

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
      personalStats,
      masteries,
    });
  }, [db, myRole, allyKeys, enemyKeys, bannedKeys, personalStats, masteries]);

  const draftPrediction = useMemo(() => {
    if (!db || allyKeys.length === 0 || enemyKeys.length === 0) return null;
    return predictDraftWinrate({ db, allyKeys, enemyKeys });
  }, [db, allyKeys, enemyKeys]);

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
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-accent">LoL Draft Advisor</h1>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-1 rounded ${lcuStatus.connected ? "bg-good/20 text-good" : "bg-white/5 text-white/50"}`}
            title={lcuStatus.reason ?? ""}
          >
            {lcuStatus.connected ? "Cliente conectado" : "Modo manual"}
          </span>
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
        <DraftBoard db={db} />
        <div className="space-y-4">
          {draftPrediction && <DraftWinrateBadge pred={draftPrediction} />}
          <SuggestionPanel suggestions={suggestions} />
          {suggestions[0] && myRole && (
            <BuildPanel
              db={db}
              championKey={suggestions[0].champion.key}
              role={myRole}
            />
          )}
          <CompAnalysis db={db} allyKeys={allyKeys} />
          <EnemyScoutPanel db={db} enemySummonerIds={enemySummonerIds} />
        </div>
      </div>

      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}
      {showHistory && (
        <HistoryView db={db} onClose={() => setShowHistory(false)} />
      )}
      {showCoach && <CoachView db={db} onClose={() => setShowCoach(false)} />}
      {showTrends && <TrendsView onClose={() => setShowTrends(false)} />}
    </main>
  );
}

export default App;
