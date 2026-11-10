// Build against your lane opponent — what players of your champion actually
// buy and run in THIS matchup (op.gg), next to the generic build. Renders
// nothing until a lane opponent is known and op.gg has data for the pair.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Swords } from "lucide-react";
import type { ChampionDb, Role } from "../../types/champion";
import { inferEnemyRoles } from "../../data/matchupTips";
import { usePrefsStore } from "../../state/prefsStore";
import { fetchMatchupBuild, type MatchupBuildResponse } from "../../services/opggMatchupBuild";
import { BuildRow } from "./BuildRow";
import { PerkIcon } from "./icons";

/** Below this many games the matchup numbers are noise, not advice. */
export const MIN_MATCHUP_BUILD_GAMES = 100;

interface Props {
  db: ChampionDb;
  /** Data Dragon id of my champion. */
  championDdId: string;
  role: Role;
  /** Enemy champion keys (numeric strings), as held by the draft board. */
  enemyKeys: string[];
}

/** The enemy that plays my role, by best-guess role assignment. */
export function laneOpponentKey(db: ChampionDb, role: Role, enemyKeys: string[]): string | null {
  const roles = inferEnemyRoles(enemyKeys.map((k) => db.champions[k]?.id));
  const i = roles.indexOf(role);
  return i >= 0 ? enemyKeys[i] : null;
}

export function MatchupBuildCard({ db, championDdId, role, enemyKeys }: Props) {
  const { t } = useTranslation();
  const lang = usePrefsStore((s) => s.prefs.uiLocale);
  const enemySig = enemyKeys.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- enemySig stands in for enemyKeys
  const oppKey = useMemo(() => laneOpponentKey(db, role, enemyKeys), [db, role, enemySig]);
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
  const build = want && got?.key === want ? got.data?.build : null;
  if (!opp || !build) return null;
  if (build.games !== null && build.games < MIN_MATCHUP_BUILD_GAMES) return null;

  const winRate = build.games && build.wins !== null ? build.wins / build.games : null;
  const core = build.coreItems[0];
  const boots = build.boots[0];
  const starter = build.starterItems[0];
  const runes = build.runes[0];
  const edge =
    build.laneAdvantage === null
      ? null
      : build.laneAdvantage.toLowerCase() === opp.name.toLowerCase()
        ? "theirs"
        : "mine";

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
            {(winRate * 100).toFixed(0)}% WR
          </span>
        )}
      </div>
      {edge && (
        <p className={`text-[11px] ${edge === "mine" ? "text-good" : "text-meh"}`}>
          {t(edge === "mine" ? "build.laneEdgeMine" : "build.laneEdgeTheirs", { name: opp.name })}
        </p>
      )}
      {starter && <BuildRow label={t("build.matchupStart")} path={starter} patch={db.patch} />}
      {core && <BuildRow label={t("build.matchupCore")} path={core} patch={db.patch} highlight />}
      {boots && <BuildRow label={t("build.matchupBoots")} path={boots} patch={db.patch} />}
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
    </div>
  );
}
