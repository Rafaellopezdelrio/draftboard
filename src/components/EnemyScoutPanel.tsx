import { memo, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n";
import type { ChampionDb } from "../types/champion";
import { useDraftStore, type EnemyScoutTarget } from "../state/draftStore";
import { getSummonerById } from "../services/lcuService";
import { isRandomPickScout } from "../state/enemyScoutTargets";
import { scoutPlayer, type ScoutResult } from "../services/enemyScout";
import { loadSettings } from "../services/settingsRepo";
import { usePrefsStore } from "../state/prefsStore";
import { toast } from "./Toaster";
import { voiceCoach } from "../services/voiceCoach";
import { Panel } from "./ui/Panel";
import { RankBadge } from "./ui/RankBadge";
import {
  assessThreat,
  scoutViewpoint,
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
  /** Enemies identified from the loading screen on (spectator-v5).
   *  Used when anonymized champ select leaves every summonerId at 0. */
  enemyScoutTargets?: EnemyScoutTarget[];
}

/** One enemy to scout: by LCU summonerId (champ select) or PUUID (in game). */
interface Slot {
  key: string;
  summonerId: number;
  puuid: string | null;
  championId: number | null;
  hasSmite: boolean;
}

function buildSlots(
  summonerIds: number[],
  championIds: (number | null)[],
  targets: EnemyScoutTarget[]
): Slot[] {
  // In-game targets win: they carry real Smite data, and champ-select ids
  // can linger into the game (lcuSync keeps them at GameStart).
  if (targets.length > 0) {
    return targets.map((tg) => ({
      key: `p${tg.puuid}`,
      summonerId: 0,
      puuid: tg.puuid,
      championId: tg.championId,
      hasSmite: !!tg.hasSmite,
    }));
  }
  if (!summonerIds.some((s) => s > 0)) return [];
  return summonerIds.map((sid, i) => ({
    key: `s${sid}`,
    summonerId: sid,
    puuid: null,
    championId: championIds[i] ?? null,
    hasSmite: false,
  }));
}

const EMPTY_TARGETS: EnemyScoutTarget[] = [];

function EnemyScoutPanelInner({
  db,
  enemySummonerIds,
  enemyChampionIds,
  enemyScoutTargets = EMPTY_TARGETS,
}: Props) {
  const { t } = useTranslation();
  const liveRefresh = usePrefsStore((s) => s.prefs.liveScoutRefresh);
  const notifyHot = usePrefsStore((s) => s.prefs.notifyOnEnemyHotStreak);
  // Notes are phrased for my role (jungler gets gank/invade advice).
  const myRole = useDraftStore((s) => s.myRole);
  const [scouts, setScouts] = useState<
    Record<string, ScoutResult | "loading" | "error">
  >({});
  const slots = buildSlots(enemySummonerIds, enemyChampionIds, enemyScoutTargets);
  // Stable identity for the effect: re-scout only when who/what changes.
  const slotsSig = slots.map((s) => `${s.key}:${s.championId ?? ""}`).join(",");
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const lastChampSnapshot = useRef<string>("");
  // Mirror `scouts` into a ref so the scout loop can read the LATEST map
  // (to skip already-scouted summoners) WITHOUT listing `scouts` as an effect
  // dep — that would re-run the effect every setScouts → infinite loop.
  // Updating a ref during render is safe (no re-render triggered).
  const scoutsRef = useRef(scouts);
  scoutsRef.current = scouts;

  useEffect(() => {
    const current = slotsRef.current;
    if (!current.some((s) => s.summonerId > 0 || s.puuid)) return;
    // Advanced only when a forced run finishes (end of runScout): a forced
    // run cut short by a re-run with the same slots must force again.
    const champsChanged = slotsSig !== lastChampSnapshot.current;
    const sig = slotsSig;

    // Superseded runs (slots changed / unmount) must not write: a late,
    // champion-less result would overwrite the fresh one.
    let stale = false;
    runScout(champsChanged);

    const id = liveRefresh ? setInterval(() => runScout(false), 60_000) : null;
    return () => {
      stale = true;
      if (id) clearInterval(id);
    };

    async function runScout(force: boolean) {
      const cfg = await loadSettings();
      if (!cfg || stale) return;
      for (const slot of current) {
        if (stale) return;
        const sid = slot.key;
        const champId = slot.championId ?? undefined;
        if (slot.summonerId <= 0 && !slot.puuid) continue;
        // Skip only loaded slots; "error" ones are retried on the next tick.
        const prev = scoutsRef.current[sid];
        if (!force && prev && prev !== "loading" && prev !== "error") continue;
        setScouts((s) => ({ ...s, [sid]: "loading" }));
        const puuid = slot.puuid ?? (await getSummonerById(slot.summonerId))?.puuid;
        if (stale) return;
        if (!puuid) {
          setScouts((s) => ({ ...s, [sid]: "error" }));
          continue;
        }
        try {
          const r = await scoutPlayer(cfg, puuid, champId);
          if (stale) return;
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
              `hot-${slot.summonerId || slot.puuid}`
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
            const randomPick = !!slot.puuid && isRandomPickScout();
            const threat = assessThreat({
              // Read at call time: role changes must not re-run the scout fetch.
              viewpoint: scoutViewpoint(
                randomPick ? null : useDraftStore.getState().myRole,
                slot.hasSmite
              ),
              randomPick,
              scout: r,
              pickedChampionId: champId ?? null,
              championName: champName,
            });
            if (threat.level === "danger") {
              // i18n.t (module singleton) instead of the hook's t so this
              // fire-and-forget effect doesn't need t in its deps (which would
              // re-run the whole scout fetch on every language change).
              voiceCoach.speak(
                `${i18n.t("scout.threatPrefix")} ${i18n.t(threat.noteKey, threat.noteParams)}`,
                `threat-${slot.summonerId || slot.puuid}`
              );
            }
          }
        } catch {
          if (stale) return;
          setScouts((s) => ({ ...s, [sid]: "error" }));
        }
      }
      if (force && !stale) lastChampSnapshot.current = sig;
    }
  }, [slotsSig, liveRefresh, notifyHot, db.champions]);

  const isFilled = (s: Slot) => s.summonerId > 0 || !!s.puuid;
  if (!slots.some(isFilled)) return null;

  const filledCount = slots.filter(isFilled).length;

  // Synthesize a threat read per loaded enemy (+ a team verdict). Reuses the
  // data we already fetched — no extra API calls.
  const threatBySid: Record<string, PlayerThreat> = {};
  const threatList: PlayerThreat[] = [];
  // ARAM: no lanes/jungle and random champions — no role or off-pool advice.
  const randomPick = enemyScoutTargets.length > 0 && isRandomPickScout();
  for (const slot of slots) {
    const sid = slot.key;
    const r = scouts[sid];
    if (!isFilled(slot) || !r || r === "loading" || r === "error") continue;
    const cid = slot.championId;
    const t = assessThreat({
      viewpoint: scoutViewpoint(randomPick ? null : myRole, slot.hasSmite),
      randomPick,
      scout: r,
      pickedChampionId: cid,
      championName: cid ? db.champions[String(cid)]?.name ?? null : null,
    });
    threatBySid[sid] = t;
    threatList.push(t);
  }
  const summary = threatList.length > 0 ? summarizeEnemies(threatList) : null;

  return (
    <Panel
      padding="sm"
      collapsible
      defaultOpen={false}
      storageKey="enemyScout"
      icon={<Eye className="w-3 h-3" />}
      title={t("scout.title")}
      // Collapsed by default: surface the verdict in the header so the threat
      // read is visible without opening the panel.
      summary={summary ? t(summary.textKey, summary.textParams) : `${filledCount}/5`}
    >
      {summary && (
        <div
          className={`mb-1.5 px-2 py-1 rounded text-[11px] font-medium ${
            summary.dangerCount > 0
              ? "bg-bad/10 text-bad border border-bad/30"
              : "bg-good/10 text-good border border-good/30"
          }`}
        >
          {t(summary.textKey, summary.textParams)}
        </div>
      )}
      <div className="space-y-1.5">
        {slots.map((slot, i) => {
          const sid = slot.key;
          if (!isFilled(slot))
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
  const wr = total > 0 ? (r.recentWins / total) * 100 : null;
  const wrColor =
    wr === null ? "text-white/40" : wr >= 60 ? "text-bad" : wr >= 50 ? "text-meh" : "text-good";

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
            {wr === null ? "—" : `${wr.toFixed(0)}%`}
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
          <span className="leading-snug">{t(threat.noteKey, threat.noteParams)}</span>
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
