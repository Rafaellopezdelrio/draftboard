import { memo, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChampionDb } from "../types/champion";
import { getSummonerById } from "../services/lcuService";
import { scoutPlayer, type ScoutResult } from "../services/enemyScout";
import { loadSettings } from "../services/settingsRepo";
import { usePrefsStore } from "../state/prefsStore";
import { toast } from "./Toaster";
import { voiceCoach } from "../services/voiceCoach";
import { Panel, PanelHeader } from "./ui/Panel";
import { RankBadge } from "./ui/RankBadge";
import {
  assessThreat,
  summarizeEnemies,
  type PlayerThreat,
  type ThreatLevel,
} from "../engine/scoutInsights";
import { Eye, Flame, Snowflake, Crown, Target, AlertTriangle } from "lucide-react";

// Threat level -> text/dot classes (literals so Tailwind JIT scans them).
function threatStyle(level: ThreatLevel): { text: string; dot: string } {
  switch (level) {
    case "danger":
      return { text: "text-bad", dot: "bg-bad" };
    case "elevated":
      return { text: "text-meh", dot: "bg-meh" };
    case "weak":
      return { text: "text-good", dot: "bg-good" };
    default:
      return { text: "text-white/55", dot: "bg-white/40" };
  }
}

interface Props {
  db: ChampionDb;
  enemySummonerIds: number[];
  enemyChampionIds: (number | null)[];
}

function EnemyScoutPanelInner({
  db,
  enemySummonerIds,
  enemyChampionIds,
}: Props) {
  const { t } = useTranslation();
  const liveRefresh = usePrefsStore((s) => s.prefs.liveScoutRefresh);
  const notifyHot = usePrefsStore((s) => s.prefs.notifyOnEnemyHotStreak);
  const [scouts, setScouts] = useState<
    Record<number, ScoutResult | "loading" | "error">
  >({});
  const lastChampSnapshot = useRef<string>("");
  // Mirror `scouts` into a ref so the scout loop can read the LATEST map
  // (to skip already-scouted summoners) WITHOUT listing `scouts` as an effect
  // dep — that would re-run the effect every setScouts → infinite loop.
  // Updating a ref during render is safe (no re-render triggered).
  const scoutsRef = useRef(scouts);
  scoutsRef.current = scouts;

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
        if (!force && scoutsRef.current[sid] && scoutsRef.current[sid] !== "loading") continue;
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
          // Audio alert for the genuinely scary enemies — hands-free at champ
          // select. Reuses the same threat synthesis the cards show.
          if (notifyHot) {
            const champName = champId
              ? db.champions[String(champId)]?.name ?? null
              : null;
            const threat = assessThreat({
              scout: r,
              pickedChampionId: champId ?? null,
              championName: champName,
            });
            if (threat.level === "danger") {
              voiceCoach.speak(`Amenaza: ${threat.note}`, `threat-${sid}`);
            }
          }
        } catch {
          setScouts((s) => ({ ...s, [sid]: "error" }));
        }
      }
    }
  }, [enemySummonerIds, enemyChampionIds, liveRefresh, notifyHot, db.champions]);

  if (enemySummonerIds.every((s) => s <= 0)) return null;

  const filledCount = enemySummonerIds.filter((s) => s > 0).length;

  // Synthesize a threat read per loaded enemy (+ a team verdict). Reuses the
  // data we already fetched — no extra API calls.
  const threatBySid: Record<number, PlayerThreat> = {};
  const threatList: PlayerThreat[] = [];
  for (let i = 0; i < enemySummonerIds.length; i++) {
    const sid = enemySummonerIds[i];
    const r = scouts[sid];
    if (sid <= 0 || !r || r === "loading" || r === "error") continue;
    const cid = enemyChampionIds[i] ?? null;
    const t = assessThreat({
      scout: r,
      pickedChampionId: cid,
      championName: cid ? db.champions[String(cid)]?.name ?? null : null,
    });
    threatBySid[sid] = t;
    threatList.push(t);
  }
  const summary = threatList.length > 0 ? summarizeEnemies(threatList) : null;

  return (
    <Panel padding="sm">
      <PanelHeader
        icon={<Eye className="w-3 h-3" />}
        title={t("scout.title")}
        action={
          <span className="text-[10px] tabular-nums text-white/40">
            {filledCount}/5
          </span>
        }
      />
      {summary && (
        <div
          className={`mb-1.5 px-2 py-1 rounded text-[11px] font-medium ${
            summary.dangerCount > 0
              ? "bg-bad/10 text-bad border border-bad/30"
              : "bg-good/10 text-good border border-good/30"
          }`}
        >
          {summary.text}
        </div>
      )}
      <div className="space-y-1.5">
        {enemySummonerIds.map((sid, i) => {
          if (sid <= 0)
            return (
              <p key={i} className="text-[11px] text-white/25 italic px-1">
                {t("scout.slotEmpty", { n: i + 1 })}
              </p>
            );
          const r = scouts[sid];
          if (r === "loading" || !r)
            return (
              <div key={sid} className="text-[11px] text-white/40 px-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent/40 animate-pulse" />
                {t("scout.slotLoading", { n: i + 1 })}
              </div>
            );
          if (r === "error")
            return (
              <p key={sid} className="text-[11px] text-bad px-1">
                {t("scout.slotError", { n: i + 1 })}
              </p>
            );
          return (
            <ScoutCard
              key={sid}
              db={db}
              r={r}
              threat={threatBySid[sid]}
              highlightHot={notifyHot}
            />
          );
        })}
      </div>
    </Panel>
  );
}

function ScoutCard({
  db,
  r,
  threat,
  highlightHot,
}: {
  db: ChampionDb;
  r: ScoutResult;
  threat: PlayerThreat | undefined;
  highlightHot: boolean;
}) {
  const { t } = useTranslation();
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
            title={t("scout.main", { name: main.name })}
          />
        ) : (
          <div className="w-9 h-9 rounded bg-bg-elev" />
        )}
        <div className="flex-1 min-w-0 space-y-0.5">
          <RankBadge tier={tier} division={division} lp={r.lp ?? undefined} size="sm" />
          {recent && (
            <p className="text-[11px] text-white/60 truncate">
              {t("scout.spam")} <span className="text-white/80">{recent.name}</span>
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

      {threat && (
        <div
          className={`mt-1.5 flex items-start gap-1.5 text-[11px] ${threatStyle(threat.level).text}`}
        >
          <span
            className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${threatStyle(threat.level).dot}`}
          />
          <span className="leading-snug">{threat.note}</span>
        </div>
      )}

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
              <Flame className="w-3 h-3" /> {t("scout.hotStreak")}
            </>
          ) : (
            <>
              <Snowflake className="w-3 h-3" /> {t("scout.coldStreak")}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// keep AlertTriangle import used (referenced in toast warnings elsewhere)
void AlertTriangle;

/** Memoised: `enemySummonerIds` + `enemyChampionIds` come from draftStore;
 * App passes them by reference. memo() prevents re-render when the
 * parent App re-renders but our concrete props are array-equal. */
export const EnemyScoutPanel = memo(EnemyScoutPanelInner);
