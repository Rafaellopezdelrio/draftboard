import { useEffect, useRef, useState } from "react";
import type { ChampionDb } from "../types/champion";
import { getSummonerById } from "../services/lcuService";
import { scoutPlayer, type ScoutResult } from "../services/enemyScout";
import { loadSettings } from "../services/settingsRepo";
import { usePrefsStore } from "../state/prefsStore";
import { toast } from "./Toaster";
import { voiceCoach } from "../services/voiceCoach";
import { Panel, PanelHeader } from "./ui/Panel";
import { RankBadge } from "./ui/RankBadge";
import { Eye, Flame, Snowflake, Crown, Target, AlertTriangle } from "lucide-react";

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
            voiceCoach.speak(
              `Cuidado, enemigo en racha${champName ? ` con ${champName}` : ""}`,
              `hot-${sid}`
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

  const filledCount = enemySummonerIds.filter((s) => s > 0).length;

  return (
    <Panel padding="sm">
      <PanelHeader
        icon={<Eye className="w-3 h-3" />}
        title="Scout enemigos"
        action={
          <span className="text-[10px] tabular-nums text-white/40">
            {filledCount}/5
          </span>
        }
      />
      <div className="space-y-1.5">
        {enemySummonerIds.map((sid, i) => {
          if (sid <= 0)
            return (
              <p key={i} className="text-[11px] text-white/25 italic px-1">
                Slot {i + 1} vacío
              </p>
            );
          const r = scouts[sid];
          if (r === "loading" || !r)
            return (
              <div key={sid} className="text-[11px] text-white/40 px-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent/40 animate-pulse" />
                Scout slot {i + 1}...
              </div>
            );
          if (r === "error")
            return (
              <p key={sid} className="text-[11px] text-bad px-1">
                Slot {i + 1}: sin datos
              </p>
            );
          return <ScoutCard key={sid} db={db} r={r} highlightHot={notifyHot} />;
        })}
      </div>
    </Panel>
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

  // Extract tier from rank string like "GOLD II"
  const rankParts = r.rank?.split(" ") ?? [];
  const tier = rankParts[0];
  const division = rankParts[1];

  return (
    <div className="p-2 rounded-md ring-1 ring-border-subtle bg-bg-card/60 hover:bg-bg-card transition">
      <div className="flex items-center gap-2">
        {main ? (
          <img
            src={main.iconUrl}
            alt={main.name}
            className="w-9 h-9 rounded ring-1 ring-border-strong"
            title={`Main: ${main.name}`}
          />
        ) : (
          <div className="w-9 h-9 rounded bg-bg-elev" />
        )}
        <div className="flex-1 min-w-0 space-y-0.5">
          <RankBadge tier={tier} division={division} lp={r.lp ?? undefined} size="sm" />
          {recent && (
            <p className="text-[11px] text-white/60 truncate">
              Spam: <span className="text-white/80">{recent.name}</span>
            </p>
          )}
        </div>
        <div className="text-right">
          <p className={`text-sm font-bold tabular-nums ${wrColor}`}>
            {wr.toFixed(0)}%
          </p>
          <p className="text-[10px] text-white/40 tabular-nums">
            {r.recentWins}W·{r.recentLosses}L
          </p>
        </div>
      </div>

      {pickedChamp && pm && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
          <img src={pickedChamp.iconUrl} alt="" className="w-4 h-4 rounded" />
          <span className="text-white/65">
            M{pm.level} · {Math.round(pm.points / 1000)}k
          </span>
          {isMain && (
            <span className="inline-flex items-center gap-0.5 text-bad font-medium">
              <Crown className="w-3 h-3" /> main
            </span>
          )}
          {oneTrick && (
            <span className="inline-flex items-center gap-0.5 text-bad font-medium">
              <Target className="w-3 h-3" /> one-trick
            </span>
          )}
        </div>
      )}

      {r.topMasteries.length > 0 && (
        <div className="flex gap-1 mt-1.5">
          {r.topMasteries.slice(0, 5).map((m) => {
            const c = db.champions[String(m.championId)];
            return (
              <img
                key={m.championId}
                src={c?.iconUrl}
                alt={c?.name}
                title={`${c?.name} · M${m.level} · ${Math.round(m.points / 1000)}k`}
                className="w-5 h-5 rounded opacity-70 hover:opacity-100 transition"
              />
            );
          })}
        </div>
      )}

      {(r.hotStreak || r.coldStreak) && highlightHot && (
        <div
          className={`flex items-center gap-1 text-[11px] mt-1.5 font-medium ${
            r.hotStreak ? "text-bad" : "text-good"
          }`}
        >
          {r.hotStreak ? (
            <>
              <Flame className="w-3 h-3" /> en racha
            </>
          ) : (
            <>
              <Snowflake className="w-3 h-3" /> coldstreak
            </>
          )}
        </div>
      )}
    </div>
  );
}

// keep AlertTriangle import used (referenced in toast warnings elsewhere)
void AlertTriangle;
