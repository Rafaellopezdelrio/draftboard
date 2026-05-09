import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { loadChampionDb } from "./services/championDb";
import { useDraftStore } from "./state/draftStore";
import type { ChampionDb, Role } from "./types/champion";
import { suggest } from "./engine/suggestionEngine";
import { DraftBoard } from "./components/DraftBoard";
import { SuggestionPanel } from "./components/SuggestionPanel";
import { CompAnalysis } from "./components/CompAnalysis";

const ROLES: Role[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

function App() {
  const [db, setDb] = useState<ChampionDb | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { ally, enemy, bans, myRole, setMyRole } = useDraftStore();

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
    });
  }, [db, myRole, allyKeys, enemyKeys, bannedKeys]);

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
          <span className="text-xs text-white/40">Patch {db.patch}</span>
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
          <SuggestionPanel suggestions={suggestions} />
          <CompAnalysis db={db} allyKeys={allyKeys} />
        </div>
      </div>
    </main>
  );
}

export default App;
