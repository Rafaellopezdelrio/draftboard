// The simple main screen: three steps left to right — ban, pick, buy — each
// with a plain-language reason. Everything else lives behind "more details"
// (the full panel layout). Pure presentation over data App already computes.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChampionDb, Role } from "../types/champion";
import type { ScoredSuggestion } from "../engine/suggestionEngine";
import { suggestBans, type BanSuggestion } from "../engine/banEngine";
import { suggestBuildAdaptations } from "../engine/adaptiveBuildEngine";
import { personalMatchupsByRole, type PersonalMatchupStat } from "../services/matchRepo";
import { fetchOpggBuild, topBuild, type OpggBuild } from "../services/opggBuilds";
import { useEnemyMains } from "../hooks/useEnemyMains";
import { MatchupBuildCard } from "./build/MatchupBuildCard";
import { ItemIcon } from "./build/icons";
import type { DraftPrediction } from "../engine/draftWinrateEngine";
import { SimpleGamePlan, SimplePrepare, SimpleTopStrip } from "./SimpleDraftExtras";

interface Props {
  db: ChampionDb;
  role: Role | null;
  suggestions: ScoredSuggestion[];
  bannedKeys: string[];
  allyKeys: string[];
  enemyKeys: string[];
  enemySummonerIds: number[];
  /** Champion the build is for (locked, hovered or played), if any. */
  buildChampionKey: string | null;
  buildRole: Role | null;
  /** ARAM / Arena: no lanes, no bans. */
  noLaneMode: boolean;
  /** Draft win chance (same as the detailed view badge); null until picks exist. */
  prediction?: DraftPrediction | null;
  onShowDetails: () => void;
}

const CARD = "rounded-2xl bg-bg-elev/60 border border-border-subtle p-4 flex flex-col gap-3 min-w-0";
const STEP = "text-[11px] uppercase tracking-[0.14em] text-accent font-bold";

function Row({
  icon,
  name,
  text,
  tag,
  big = false,
}: {
  icon: string;
  name: string;
  text: string;
  tag?: { label: string; tone: "good" | "info" | "meh" };
  big?: boolean;
}) {
  const tone = { good: "bg-good/15 text-good", info: "bg-blue-500/15 text-blue-300", meh: "bg-meh/15 text-meh" };
  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-xl border ${
        big ? "bg-accent/10 border-accent/40" : "bg-bg/60 border-border-subtle"
      }`}
    >
      <img src={icon} alt="" className={`${big ? "w-16 h-16" : "w-11 h-11"} rounded-lg shrink-0`} />
      <div className="min-w-0 flex-1">
        <p className={`font-semibold text-white leading-tight ${big ? "text-lg" : "text-sm"}`}>{name}</p>
        <p className="text-xs text-white/60 leading-snug">{text}</p>
      </div>
      {tag && (
        <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${tone[tag.tone]}`}>
          {tag.label}
        </span>
      )}
    </div>
  );
}

/** Generic buy order (no lane opponent known yet): op.gg's best build. */
function GenericBuy({ db, championKey, role }: { db: ChampionDb; championKey: string; role: Role }) {
  const { t } = useTranslation();
  const ddId = db.champions[championKey]?.id;
  const want = ddId ? `${ddId}:${role}` : null;
  const [got, setGot] = useState<{ key: string; build: OpggBuild | null } | null>(null);
  useEffect(() => {
    if (!want || !ddId) return;
    let stale = false;
    void fetchOpggBuild(ddId, role).then((build) => {
      if (!stale) setGot({ key: want, build });
    });
    return () => {
      stale = true;
    };
  }, [want, ddId, role]);
  const build = want && got?.key === want ? got.build : null;
  if (!build) return <p className="text-xs text-white/45">{t("simple.buyLoading")}</p>;
  const top = topBuild(build);
  const rows: Array<[string, number[]]> = [
    [t("build.planSlot.start"), top.starter?.ids ?? []],
    [t("simple.buyCore"), top.core?.ids ?? []],
    [t("build.planSlot.boots"), top.boots?.ids.slice(0, 1) ?? []],
  ];
  return (
    <div className="space-y-2" data-testid="simple-generic-buy">
      {rows
        .filter(([, ids]) => ids.length > 0)
        .map(([label, ids]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-white/45 w-12 shrink-0">{label}</span>
            <div className="flex gap-1">
              {Array.from(new Set(ids)).map((id) => (
                <ItemIcon key={id} patch={db.patch} id={id} />
              ))}
            </div>
          </div>
        ))}
      <p className="text-[11px] text-white/45 leading-snug">{t("simple.buyGenericNote")}</p>
    </div>
  );
}

export function SimpleDraftView({
  db,
  role,
  suggestions,
  bannedKeys,
  allyKeys,
  enemyKeys,
  enemySummonerIds,
  buildChampionKey,
  buildRole,
  noLaneMode,
  prediction = null,
  onShowDetails,
}: Props) {
  const { t } = useTranslation();
  const [matchups, setMatchups] = useState<PersonalMatchupStat[]>([]);
  const enemyMains = useEnemyMains(enemySummonerIds);
  useEffect(() => {
    if (!role) {
      setMatchups([]);
      return;
    }
    let stale = false;
    void personalMatchupsByRole(role).then((m) => {
      if (!stale) setMatchups(m);
    });
    return () => {
      stale = true;
    };
  }, [role]);

  // Champions you know first: a pick you can actually play beats a stronger one you can't.
  const picks = useMemo(() => {
    const comfort = suggestions.filter((s) => s.breakdown.isComfort);
    const rest = suggestions.filter((s) => !s.breakdown.isComfort);
    return [...comfort, ...rest].slice(0, 3);
  }, [suggestions]);

  const bans = useMemo(
    () =>
      role && !noLaneMode
        ? suggestBans({
            db,
            role,
            matchups,
            bannedKeys,
            pickedKeys: [...allyKeys, ...enemyKeys],
            enemyMains,
            limit: 6,
          })
            // Never tell the player to ban what step 2 tells them to pick.
            .filter((b) => !picks.some((p) => p.champion.key === b.championKey))
            .slice(0, 3)
        : [],
    [db, role, noLaneMode, matchups, bannedKeys, allyKeys, enemyKeys, enemyMains, picks]
  );

  const buildChamp = buildChampionKey ? db.champions[buildChampionKey] : undefined;
  const adaptations = useMemo(
    () => (buildChamp ? suggestBuildAdaptations({ db, champion: buildChamp, enemyKeys }) : []),
    [db, buildChamp, enemyKeys]
  );

  // Plain-language twin of each engine reason; falls back to the engine text.
  const reasonOf = (s: ScoredSuggestion) =>
    s.reasons
      .slice(0, 2)
      .map((r) => t(`simple.why.${r.split(".").pop()}`, { defaultValue: t(r) }))
      .join(" · ") || t("suggestions.decentPick");
  // Same for bans: the numbers say it without "S-tier" or "WR".
  const banWhy = (b: BanSuggestion) => {
    if (b.source === "scout") return t("simple.banWhy.scout");
    if (b.source === "personal" && b.personalGames && b.personalWinRate != null)
      return t("simple.banWhy.personal", {
        lost: Math.round(b.personalGames * (1 - b.personalWinRate)),
        games: b.personalGames,
      });
    if (b.source === "global" && b.globalWinRate != null)
      return t("simple.banWhy.global", { wr: Math.round(b.globalWinRate * 100) });
    return b.reason;
  };
  const tagOf = (s: ScoredSuggestion, i: number) =>
    i === 0
      ? { label: t("simple.tagBest"), tone: "good" as const }
      : s.breakdown.isComfort
        ? { label: t("simple.tagKnown"), tone: "info" as const }
        : { label: t("simple.tagNew"), tone: "meh" as const };

  return (
    <div className="space-y-4" data-testid="simple-draft">
      {!noLaneMode && (
        <SimpleTopStrip
          db={db}
          prediction={prediction}
          allyKeys={allyKeys}
          enemyKeys={enemyKeys}
          bannedKeys={bannedKeys}
          enemyMains={enemyMains}
        />
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.25fr_1.25fr] gap-4">
        <section className={CARD} aria-label={t("simple.banTitle")}>
          <p className={STEP}>{t("simple.step", { n: 1 })}</p>
          <h2 className="text-xl font-bold text-white">{t("simple.banTitle")}</h2>
          {noLaneMode ? (
            <p className="text-xs text-white/45">{t("simple.banNoBans")}</p>
          ) : !role ? (
            <p className="text-xs text-white/45">{t("simple.needRole")}</p>
          ) : bans.length === 0 ? (
            <p className="text-xs text-white/45">{t("simple.banEmpty")}</p>
          ) : (
            bans.map((b) => <Row key={b.championKey} icon={b.iconUrl} name={b.championName} text={banWhy(b)} />)
          )}
        </section>

        <section className={`${CARD} border-accent/40`} aria-label={t("simple.pickTitle")}>
          <p className={STEP}>{t("simple.step", { n: 2 })}</p>
          <h2 className="text-xl font-bold text-white">{t("simple.pickTitle")}</h2>
          {picks.length === 0 ? (
            <p className="text-xs text-white/45">{t("suggestions.empty")}</p>
          ) : (
            picks.map((s, i) => (
              <Row
                key={s.champion.key}
                icon={s.champion.iconUrl}
                name={s.champion.name}
                text={reasonOf(s)}
                tag={tagOf(s, i)}
                big={i === 0}
              />
            ))
          )}
          {!role && picks.length > 0 && <p className="text-[11px] text-white/45">{t("simple.needRole")}</p>}
          {!noLaneMode && (
            <SimpleGamePlan
              db={db}
              myChampionKey={buildChampionKey}
              myRole={role}
              allyKeys={allyKeys}
              enemyKeys={enemyKeys}
            />
          )}
        </section>

        <section className={CARD} aria-label={t("simple.buyTitle")}>
          <p className={STEP}>{t("simple.step", { n: 3 })}</p>
          <h2 className="text-xl font-bold text-white">{t("simple.prepareTitle")}</h2>
          {buildChampionKey && buildRole && buildChamp ? (
            <>
              {!noLaneMode && <SimplePrepare db={db} champion={buildChamp} role={buildRole} />}
              <div className="border-t border-white/5" />
              <p className="text-xs text-white/60">{t("simple.buyFor", { name: buildChamp.name })}</p>
              {noLaneMode ? (
                <GenericBuy db={db} championKey={buildChampionKey} role={buildRole} />
              ) : (
                <MatchupBuildCard
                  db={db}
                  championDdId={buildChamp.id}
                  role={buildRole}
                  enemyKeys={enemyKeys}
                  adaptations={adaptations}
                  fallback={<GenericBuy db={db} championKey={buildChampionKey} role={buildRole} />}
                />
              )}
            </>
          ) : (
            <p className="text-xs text-white/45">{t("simple.buyEmpty")}</p>
          )}
        </section>
      </div>

      <div className="flex items-center gap-2 flex-wrap rounded-xl bg-bg-elev/60 border border-border-subtle px-3 py-2">
        {allyKeys.length + enemyKeys.length > 0 && (
          <>
            <span className="text-xs text-white/50">{t("simple.yourTeam")}</span>
            {allyKeys.map((k) => (
              <img key={`a${k}`} src={db.champions[k]?.iconUrl} alt={db.champions[k]?.name ?? ""} className="w-8 h-8 rounded-md" />
            ))}
            <span className="text-xs font-bold text-white/35 mx-2">{t("simple.versus")}</span>
            {enemyKeys.map((k) => (
              <img key={`e${k}`} src={db.champions[k]?.iconUrl} alt={db.champions[k]?.name ?? ""} className="w-8 h-8 rounded-md" />
            ))}
          </>
        )}
        <button
          type="button"
          onClick={onShowDetails}
          className="ml-auto text-xs text-white/60 hover:text-white border border-dashed border-border-strong rounded-full px-4 py-1.5 transition"
        >
          {t("simple.moreDetails")}
        </button>
      </div>
    </div>
  );
}
