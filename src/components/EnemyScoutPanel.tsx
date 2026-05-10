import { useEffect, useRef, useState } from "react";
import type { ChampionDb } from "../types/champion";
import { getSummonerById } from "../services/lcuService";
import { scoutPlayer, type ScoutResult } from "../services/enemyScout";
import { loadSettings } from "../services/settingsRepo";
import { usePrefsStore } from "../state/prefsStore";
import { toast } from "./Toaster";

interface Props {
  db: ChampionDb;
  enemySummonerIds: number[];
  enemyChampionIds: (number | null)[];
}

export function EnemyScoutPanel({
  db,
  enemySummonerIds,
  enemyChampionIds,
}: Props) {
  const liveRefresh = usePrefsStore((s) => s.prefs.liveScoutRefresh);
  const notifyHot = usePrefsStore((s) => s.prefs.notifyOnEnemyHotStreak);
  const [scouts, setScouts] = useState<
    Record<number, ScoutResult | "loading" | "error">
  >({});
  const lastChampSnapshot = useRef<string>("");

  useEffect(() => {
    if (enemySummonerIds.every((s) => s <= 0)) return;
    const snapshot = enemyChampionIds.join(",") + "|" + enemySummonerIds.join(",");
    const champsChanged = snapshot !== lastChampSnapshot.current;
    lastChampSnapshot.current = snapshot;

    runScout(champsChanged);

    if (!liveRefresh) return;
    const id = setInterval(() => runScout(false), 60_000);
    return () => clearInterval(id);

    async function runScout(force: boolean) {
      const cfg = await loadSettings();
      if (!cfg) return;
      for (let i = 0; i < enemySummonerIds.length; i++) {
        const sid = enemySummonerIds[i];
        const champId = enemyChampionIds[i] ?? undefined;
        if (sid <= 0) continue;
        if (!force && scouts[sid] && scouts[sid] !== "loading") continue;
        setScouts((s) => ({ ...s, [sid]: "loading" }));
        const lcuSum = await getSummonerById(sid);
        if (!lcuSum?.puuid) {
          setScouts((s) => ({ ...s, [sid]: "error" }));
          continue;
        }
        try {
          const r = await scoutPlayer(cfg, lcuSum.puuid, champId);
          setScouts((s) => ({ ...s, [sid]: r }));
          if (notifyHot && r.hotStreak) {
            const champName = champId
              ? db.champions[String(champId)]?.name
              : null;
            toast(
              `🔥 Enemigo en racha (${r.rank ?? "?"}) ${champName ? `con ${champName}` : ""}`,
              { severity: "warn", ttlMs: 6000 }
            );
          }
          if (
            notifyHot &&
            r.pickedChampionMastery &&
            r.pickedChampionMastery.points > 200000
          ) {
            const c = db.champions[String(r.pickedChampionMastery.championId)];
            toast(`🎯 One-trick: ${c?.name} (${Math.round(r.pickedChampionMastery.points / 1000)}k pts)`, {
              severity: "warn",
              ttlMs: 7000,
            });
          }
        } catch {
          setScouts((s) => ({ ...s, [sid]: "error" }));
        }
      }
    }
  }, [enemySummonerIds, enemyChampionIds, liveRefresh]);

  if (enemySummonerIds.every((s) => s <= 0)) return null;

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
        if (r === "loading" || !r)
          return (
            <p key={sid} className="text-xs text-white/40">
              Scout slot {i + 1}...
            </p>
          );
        if (r === "error")
          return (
            <p key={sid} className="text-xs text-bad">
              Slot {i + 1}: sin datos
            </p>
          );
        return (
          <ScoutCard key={sid} db={db} r={r} highlightHot={notifyHot} />
        );
      })}
    </div>
  );
}

function ScoutCard({
  db,
  r,
  highlightHot,
}: {
  db: ChampionDb;
  r: ScoutResult;
  highlightHot: boolean;
}) {
  const main = r.mainChampionId ? db.champions[String(r.mainChampionId)] : null;
  const recent = r.mostPlayedRecent
    ? db.champions[String(r.mostPlayedRecent.championId)]
    : null;
  const total = r.recentWins + r.recentLosses;
  const wr = total > 0 ? (r.recentWins / total) * 100 : 0;
  const wrColor = wr >= 60 ? "text-bad" : wr >= 50 ? "text-meh" : "text-good";

  // Mastery on the champion they just picked
  const pm = r.pickedChampionMastery;
  const pickedChamp = pm ? db.champions[String(pm.championId)] : null;
  const isMain = pm && r.mainChampionId === pm.championId;
  const oneTrick = pm && pm.points > 200000;

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

      {pickedChamp && pm && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <img src={pickedChamp.iconUrl} alt="" className="w-5 h-5 rounded" />
          <span className="text-white/70">
            Maestría {pm.level} ({Math.round(pm.points / 1000)}k pts)
          </span>
          {isMain && <span className="text-bad font-medium">⚠️ es su main</span>}
          {oneTrick && (
            <span className="text-bad font-medium">🎯 one-trick</span>
          )}
        </div>
      )}

      {r.topMasteries.length > 0 && (
        <div className="flex gap-1 mt-2">
          {r.topMasteries.slice(0, 5).map((m) => {
            const c = db.champions[String(m.championId)];
            return (
              <img
                key={m.championId}
                src={c?.iconUrl}
                alt={c?.name}
                title={`${c?.name} · M${m.level} · ${Math.round(m.points / 1000)}k`}
                className="w-5 h-5 rounded opacity-80"
              />
            );
          })}
        </div>
      )}

      {(r.hotStreak || r.coldStreak) && highlightHot && (
        <p
          className={`text-xs mt-1 ${r.hotStreak ? "text-bad" : "text-good"}`}
        >
          {r.hotStreak ? "🔥 En racha" : "❄️ En coldstreak"}
        </p>
      )}
    </div>
  );
}
