// One buy order for this game: what players of your champion buy against
// your lane opponent (op.gg), with boots and later items swapped for what the
// whole enemy team calls for (comp adaptations). Renders nothing until a lane
// opponent is known and op.gg has data for the pair.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Swords } from "lucide-react";
import type { ChampionDb, Role } from "../../types/champion";
import { inferEnemyRoles } from "../../data/matchupTips";
import { CHAMPION_ROLES } from "../../data/championRoles";
import { usePrefsStore } from "../../state/prefsStore";
import { fetchMatchupBuild, type MatchupBuildResponse } from "../../services/opggMatchupBuild";
import type { BuildAdaptation } from "../../engine/adaptiveBuildEngine";
import { buildMatchupPlan } from "../../engine/matchupPlan";
import { ItemIcon, PerkIcon } from "./icons";

/** Below this many games the matchup numbers are noise, not advice. */
export const MIN_MATCHUP_BUILD_GAMES = 100;

interface Props {
  db: ChampionDb;
  /** Data Dragon id of my champion. */
  championDdId: string;
  role: Role;
  /** Enemy champion keys (numeric strings), as held by the draft board. */
  enemyKeys: string[];
  /** What the whole enemy team calls for (suggestBuildAdaptations). */
  adaptations?: BuildAdaptation[];
  /** In game: the enemy really in my position (Live Client). Beats the guess. */
  knownOpponentKey?: string | null;
  /** Shown instead of nothing when there is no matchup data to show. */
  fallback?: ReactNode;
}

/** The enemy that plays my role, by best-guess role assignment. */
export function laneOpponentKey(db: ChampionDb, role: Role, enemyKeys: string[]): string | null {
  const roles = inferEnemyRoles(enemyKeys.map((k) => db.champions[k]?.id));
  const i = roles.indexOf(role);
  return i >= 0 ? enemyKeys[i] : null;
}

/** Every enemy that can play my role: with flex picks the guess above can be
 * wrong, so the player gets to choose among these. */
export function laneOpponentCandidates(db: ChampionDb, role: Role, enemyKeys: string[]): string[] {
  return enemyKeys.filter((k) => {
    const id = db.champions[k]?.id;
    return id ? (CHAMPION_ROLES[id] ?? []).includes(role) : false;
  });
}

const NO_ADAPTATIONS: BuildAdaptation[] = [];

export function MatchupBuildCard({
  db,
  championDdId,
  role,
  enemyKeys,
  adaptations = NO_ADAPTATIONS,
  knownOpponentKey = null,
  fallback = null,
}: Props) {
  const { t } = useTranslation();
  const lang = usePrefsStore((s) => s.prefs.uiLocale);
  const enemySig = enemyKeys.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- enemySig stands in for enemyKeys
  const guessKey = useMemo(() => laneOpponentKey(db, role, enemyKeys), [db, role, enemySig]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- enemySig stands in for enemyKeys
  const candidates = useMemo(() => laneOpponentCandidates(db, role, enemyKeys), [db, role, enemySig]);
  // The player's own choice wins while that enemy is still on the board.
  const [picked, setPicked] = useState<string | null>(null);
  const oppKey = knownOpponentKey ?? (picked && candidates.includes(picked) ? picked : guessKey);
  const opp = oppKey ? db.champions[oppKey] : undefined;
  const oppDdId = opp?.id;
  const want = oppDdId ? `${championDdId}:${role}:${oppDdId}:${lang}` : null;
  const [got, setGot] = useState<{ key: string; data: MatchupBuildResponse | null } | null>(null);

  useEffect(() => {
    if (!want || !oppDdId) return;
    let stale = false;
    void fetchMatchupBuild(championDdId, role, oppDdId, lang).then((data) => {
      if (!stale) setGot({ key: want, data });
    });
    return () => {
      stale = true;
    };
  }, [want, championDdId, role, oppDdId, lang]);

  // Only the answer for the pair on screen — never the previous opponent's.
  const answer = want && got?.key === want ? got.data?.build : null;
  const build =
    answer && (answer.games === null || answer.games >= MIN_MATCHUP_BUILD_GAMES) ? answer : null;
  const flex = !knownOpponentKey && candidates.length > 1;
  // With a flex pick the chooser stays up even when this pair has no data.
  if (!opp || (!build && !flex)) return <>{fallback}</>;
  const chooser = flex && (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[10px] text-white/45">{t("build.matchupFlex")}</span>
      {candidates.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => setPicked(k)}
          aria-pressed={k === oppKey}
          className={`px-1.5 py-0.5 rounded text-[10px] ring-1 ${
            k === oppKey ? "bg-accent/20 text-accent ring-accent/40" : "text-white/60 ring-white/15 hover:text-white"
          }`}
        >
          {db.champions[k]?.name}
        </button>
      ))}
    </div>
  );
  if (!build) {
    return (
      <div className="rounded-lg bg-white/5 ring-1 ring-accent/25 p-2 space-y-1.5" data-testid="matchup-build">
        <p className="text-xs font-semibold text-white/85">{t("build.vsOpponent", { name: opp.name })}</p>
        {chooser}
        {fallback}
      </div>
    );
  }

  const winRate = build.games && build.wins !== null ? build.wins / build.games : null;
  const plan = buildMatchupPlan(build, adaptations);
  const runes = build.runes[0];
  // op.gg names the champion with the edge, or "EVEN".
  const adv = build.laneAdvantage?.toLowerCase();
  const edge =
    adv === opp.name.toLowerCase()
      ? "theirs"
      : adv !== undefined && adv === got?.data?.championName.toLowerCase()
        ? "mine"
        : null;

  return (
    <div className="rounded-lg bg-white/5 ring-1 ring-accent/25 p-2 space-y-1.5" data-testid="matchup-build">
      <div className="flex items-center gap-1.5">
        <Swords className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden />
        <p className="text-xs font-semibold text-white/85 flex-1">
          {t("build.vsOpponent", { name: opp.name })}
        </p>
        {winRate !== null && build.games !== null && (
          <span
            className={`text-[11px] tabular-nums font-semibold ${
              winRate >= 0.52 ? "text-good" : winRate >= 0.49 ? "text-white/65" : "text-bad/80"
            }`}
            title={t("build.games", { count: build.games })}
          >
            {t("build.matchupWinRate", { pct: (winRate * 100).toFixed(0) })}
          </span>
        )}
      </div>
      {chooser}
      {edge && (
        <p className={`text-[11px] ${edge === "mine" ? "text-good" : "text-meh"}`}>
          {t(edge === "mine" ? "build.laneEdgeMine" : "build.laneEdgeTheirs", { name: opp.name })}
        </p>
      )}
      {plan.steps.map((step) => (
        <div key={step.slot} className="flex items-center gap-2" data-testid={`plan-${step.slot}`}>
          <span className="text-[10px] uppercase tracking-wider text-white/45 w-12 shrink-0">
            {t(`build.planSlot.${step.slot}`)}
          </span>
          <div className="flex gap-1 shrink-0">
            {step.ids.map((id, i) => (
              <ItemIcon key={i} patch={db.patch} id={id} />
            ))}
          </div>
          <span
            className={`text-[10px] leading-snug flex-1 min-w-0 ${
              step.source === "team" ? "text-meh" : "text-white/45"
            }`}
          >
            {step.source === "team"
              ? t("build.planWhyTeam", { reason: step.reason })
              : t("build.planWhyLane", { name: opp.name })}
          </span>
        </div>
      ))}
      {plan.situational.length > 0 && (
        <div className="flex items-center gap-2" data-testid="plan-situational">
          <span className="text-[10px] uppercase tracking-wider text-white/45 w-12 shrink-0">
            {t("build.planSituational")}
          </span>
          <div className="flex gap-1 flex-1 flex-wrap">
            {plan.situational.map((a, i) => (
              <span key={i} title={`${a.itemName} — ${a.reason}`}>
                <ItemIcon patch={db.patch} id={a.itemId} />
              </span>
            ))}
          </div>
        </div>
      )}
      {runes && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-white/45 w-12 shrink-0">
            {t("build.matchupRunes")}
          </span>
          <div className="flex gap-1 flex-1 items-center">
            {runes.perks.map((id, i) => (
              <PerkIcon key={i} id={id} small={i !== 0} />
            ))}
          </div>
        </div>
      )}
      {build.tip && <p className="text-[11px] text-white/60 leading-snug">{build.tip}</p>}
      <p className="text-[10px] text-white/40 leading-snug">{t("build.matchupTeamNote")}</p>
    </div>
  );
}
