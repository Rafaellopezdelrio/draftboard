import { useEffect, useState } from "react";
import type { ChampionDb } from "../types/champion";
import { getSummonerById } from "../services/lcuService";
import { scoutPlayer, type ScoutResult } from "../services/enemyScout";
import { loadSettings } from "../services/settingsRepo";

interface Props {
  db: ChampionDb;
  enemySummonerIds: number[];
}

export function EnemyScoutPanel({ db, enemySummonerIds }: Props) {
  const [scouts, setScouts] = useState<Record<number, ScoutResult | "loading" | "error">>(
    {}
  );

  useEffect(() => {
    if (enemySummonerIds.length === 0) return;
    (async () => {
      const cfg = await loadSettings();
      if (!cfg) return;
      for (const sid of enemySummonerIds) {
        if (sid <= 0 || scouts[sid]) continue;
        setScouts((s) => ({ ...s, [sid]: "loading" }));
        const lcuSum = await getSummonerById(sid);
        if (!lcuSum?.puuid) {
          setScouts((s) => ({ ...s, [sid]: "error" }));
          continue;
        }
        try {
          const r = await scoutPlayer(cfg, lcuSum.puuid);
          setScouts((s) => ({ ...s, [sid]: r }));
        } catch {
          setScouts((s) => ({ ...s, [sid]: "error" }));
        }
      }
    })();
  }, [enemySummonerIds]);

  if (enemySummonerIds.every((s) => s <= 0)) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm uppercase tracking-wide text-white/50">
        Scout enemigos
      </h3>
      {enemySummonerIds.map((sid, i) => {
        if (sid <= 0)
          return (
            <p key={i} className="text-xs text-white/30">
              Slot {i + 1} vacío
            </p>
          );
        const r = scouts[sid];
        if (r === "loading" || !r) {
          return (
            <p key={sid} className="text-xs text-white/40">
              Scout slot {i + 1}...
            </p>
          );
        }
        if (r === "error") {
          return (
            <p key={sid} className="text-xs text-bad">
              Slot {i + 1}: sin datos
            </p>
          );
        }
        return <ScoutCard key={sid} db={db} r={r} />;
      })}
    </div>
  );
}

function ScoutCard({ db, r }: { db: ChampionDb; r: ScoutResult }) {
  const main = r.mainChampionId ? db.champions[String(r.mainChampionId)] : null;
  const recent = r.mostPlayedRecent
    ? db.champions[String(r.mostPlayedRecent.championId)]
    : null;
  const total = r.recentWins + r.recentLosses;
  const wr = total > 0 ? (r.recentWins / total) * 100 : 0;
  const wrColor = wr >= 60 ? "text-bad" : wr >= 50 ? "text-meh" : "text-good";

  return (
    <div className="p-2 rounded border border-border-subtle bg-bg-card">
      <div className="flex items-center gap-2">
        {main && (
          <img
            src={main.iconUrl}
            alt={main.name}
            className="w-9 h-9 rounded"
            title={`Main: ${main.name}`}
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">
            {r.rank ? `${r.rank} · ${r.lp}LP` : "Sin rango"}
          </p>
          <p className="text-xs text-white/60">
            {recent ? `Spam: ${recent.name}` : "—"}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-bold ${wrColor}`}>{wr.toFixed(0)}%</p>
          <p className="text-xs text-white/40">
            {r.recentWins}W {r.recentLosses}L
          </p>
        </div>
      </div>
      {(r.hotStreak || r.coldStreak) && (
        <p
          className={`text-xs mt-1 ${r.hotStreak ? "text-bad" : "text-good"}`}
        >
          {r.hotStreak ? "🔥 En racha" : "❄️ En coldstreak"}
        </p>
      )}
    </div>
  );
}
