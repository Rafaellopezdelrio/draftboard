// Extra blocks of the simple champ-select screen (mockup 4): a top strip
// (win chance, what the team lacks, enemy main warning), the "prepare" rows
// (runes, spells, skill order + one button to put them in the game) and a
// one-line game plan. Plain words only; the engines stay the same as the
// detailed view's.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Champion, ChampionDb, Role } from "../types/champion";
import type { DraftPrediction } from "../engine/draftWinrateEngine";
import type { EnemyMain } from "../engine/banEngine";
import { detectMissingArchetypes } from "../engine/suggestionEngine";
import { deriveWinConditions, profileTeam } from "../engine/winConditions";
import { fetchOpggBuild, SUMMONER_SPELL_META } from "../services/opggBuilds";
import { applyRunesResult, applySummonerSpells, type RunePageInput } from "../services/lcuService";
import { pickAutoRunePage, pickAutoSpells } from "../state/autoActions";
import { PerkIcon, SpellIcon } from "./build/icons";

const STRIP = "rounded-2xl bg-bg-elev/60 border border-border-subtle px-4 py-3 flex items-center gap-3 min-w-0";
const LABEL = "text-[10px] uppercase tracking-[0.14em] text-white/45 w-16 shrink-0";

// Reverse map: the engine returns translated sentences; find the key so the
// simple screen can use its plain twin.
const CHANCE_KEYS = ["betterMetaTier", "enemyMoreMeta", "compComplete", "compGaps", "goodMatchups", "badMatchups"];

/** Top strip: win chance · what your team lacks · enemy main warning. */
export function SimpleTopStrip({
  db,
  prediction,
  allyKeys,
  enemyKeys,
  bannedKeys,
  enemyMains,
}: {
  db: ChampionDb;
  prediction: DraftPrediction | null;
  allyKeys: string[];
  enemyKeys: string[];
  bannedKeys: string[];
  enemyMains: EnemyMain[];
}) {
  const { t } = useTranslation();
  const pct = prediction ? Math.round(prediction.winrate * 100) : null;
  const chanceWhy = prediction?.reasons
    .map((r) => CHANCE_KEYS.find((k) => t(`engine.${k}`) === r))
    .filter((k): k is string => Boolean(k))
    .slice(0, 1)
    .map((k) => t(`simple.chanceWhy.${k}`))[0];

  // What the team lacks (first gap) or, failing that, the enemy damage type.
  const team = useMemo(() => {
    if (allyKeys.length === 0 && enemyKeys.length === 0) return null;
    const missing = [...detectMissingArchetypes(db, allyKeys)];
    if (allyKeys.length >= 2 && missing.length > 0) {
      return { title: t(`simple.gap.${missing[0]}`), text: t(`simple.gapHint.${missing[0]}`) };
    }
    if (enemyKeys.length >= 2) {
      const p = profileTeam(db, enemyKeys);
      if (p.adShare >= 0.7) return { title: t("simple.dmg.adTitle"), text: t("simple.dmg.adText") };
      if (p.apShare >= 0.7) return { title: t("simple.dmg.apTitle"), text: t("simple.dmg.apText") };
      return { title: t("simple.dmg.mixedTitle"), text: t("simple.dmg.mixedText") };
    }
    return null;
  }, [db, allyKeys, enemyKeys, t]);

  // Biggest enemy main still in play (not banned, not taken by your team).
  const main = useMemo(() => {
    const gone = new Set([...bannedKeys, ...allyKeys]);
    return [...enemyMains]
      .filter((m) => !gone.has(String(m.championId)) && db.champions[String(m.championId)])
      .sort((a, b) => b.points - a.points)[0];
  }, [enemyMains, bannedKeys, allyKeys, db]);

  if (pct == null && !team && !main) return null;
  const tone = pct == null ? "" : pct >= 53 ? "text-good" : pct <= 47 ? "text-bad" : "text-meh";
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="simple-top-strip">
      {pct != null ? (
        <div className={STRIP}>
          <span className="text-2xl" aria-hidden>📈</span>
          <div className="min-w-0">
            <p className={`text-xl font-bold leading-tight ${tone}`}>{t("simple.chance", { pct })}</p>
            <p className="text-xs text-white/60 leading-snug">{chanceWhy ?? t("simple.chanceText")}</p>
          </div>
        </div>
      ) : (
        <div />
      )}
      {team ? (
        <div className={STRIP}>
          <span className="text-2xl" aria-hidden>🧩</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white leading-tight">{team.title}</p>
            <p className="text-xs text-white/60 leading-snug">{team.text}</p>
          </div>
        </div>
      ) : (
        <div />
      )}
      {main ? (
        <div className={`${STRIP} border-meh/40`}>
          <img
            src={db.champions[String(main.championId)]?.iconUrl}
            alt=""
            className="w-9 h-9 rounded-lg shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white leading-tight">
              {t(main.points >= 300_000 ? "simple.mainTitleHuge" : "simple.mainTitle", {
                name: db.champions[String(main.championId)]?.name,
              })}
            </p>
            <p className="text-xs text-white/60 leading-snug">
              {t("simple.mainText", {
                player: main.summonerName ?? t("simple.mainSomeone"),
                points: Math.round(main.points / 1000),
              })}
            </p>
          </div>
        </div>
      ) : (
        <div />
      )}
    </div>
  );
}

/** "Q > W > E" from an 18-letter op.gg order: the order skills reach rank 5. */
export function maxOrderOf(order: string): string[] {
  const counts: Record<string, number> = { Q: 0, W: 0, E: 0 };
  const done: string[] = [];
  for (const ch of order.toUpperCase()) {
    if (!(ch in counts)) continue;
    counts[ch]++;
    if (counts[ch] === 5) done.push(ch);
  }
  const rest = (["Q", "W", "E"] as const)
    .filter((s) => !done.includes(s))
    .sort((a, b) => counts[b] - counts[a]);
  return [...done, ...rest];
}

/** Runes, spells and skill order for the chosen champion + one apply button. */
export function SimplePrepare({ db, champion, role }: { db: ChampionDb; champion: Champion; role: Role }) {
  const { t } = useTranslation();
  const want = `${champion.key}:${role}`;
  const [got, setGot] = useState<{
    key: string;
    page: RunePageInput | null;
    spells: [number, number] | null;
    skills: string[] | null;
  } | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let stale = false;
    setStatus("");
    void Promise.all([
      pickAutoRunePage(db, champion.key, role).catch(() => null),
      pickAutoSpells(champion, role).catch(() => null),
      fetchOpggBuild(champion.id, role).catch(() => null),
    ]).then(([page, spells, build]) => {
      if (stale) return;
      // Same pick as the detailed view: the highest-winning skill order.
      const best = build?.skills.reduce<{ order: string; wr: number } | null>((acc, s) => {
        const wr = s.play > 0 ? s.win / s.play : 0;
        return !acc || wr > acc.wr ? { order: s.order, wr } : acc;
      }, null);
      setGot({ key: want, page, spells, skills: best ? maxOrderOf(best.order) : null });
    });
    return () => {
      stale = true;
    };
  }, [db, champion, role, want]);

  const data = got?.key === want ? got : null;
  if (!data) return <p className="text-xs text-white/45">{t("simple.buyLoading")}</p>;
  const { page, spells, skills } = data;
  if (!page && !spells && !skills) return null;

  const spellName = (id: number) =>
    t(`simple.spell.${id}`, { defaultValue: SUMMONER_SPELL_META[id]?.name ?? "" });

  const apply = async () => {
    setStatus(t("build.applying"));
    const [runes, spellsOk] = await Promise.all([
      page ? applyRunesResult(page) : Promise.resolve(null),
      spells ? applySummonerSpells(spells[0], spells[1]) : Promise.resolve(null),
    ]);
    const runesOk = !runes || runes.ok;
    const limit = runes && !runes.ok && runes.reason === "page-limit";
    setStatus(
      runesOk && spellsOk !== false
        ? t("simple.prepDone")
        : limit
          ? t("build.applyPageLimit")
          : t("simple.prepFailed")
    );
  };

  return (
    <div className="space-y-2.5" data-testid="simple-prepare">
      {page && (
        <div className="flex items-center gap-2">
          <span className={LABEL}>{t("simple.prepRunes")}</span>
          <div className="flex items-center gap-1">
            {page.selectedPerkIds.slice(0, 4).map((id, i) => (
              <PerkIcon key={id} id={id} small={i > 0} />
            ))}
          </div>
        </div>
      )}
      {spells && (
        <div className="flex items-center gap-2">
          <span className={LABEL}>{t("simple.prepSpells")}</span>
          <SpellIcon id={spells[0]} meta={SUMMONER_SPELL_META[spells[0]]} patch={db.patch} />
          <SpellIcon id={spells[1]} meta={SUMMONER_SPELL_META[spells[1]]} patch={db.patch} />
          <span className="text-xs text-white/70 min-w-0">
            {t("simple.prepSpellsText", { a: spellName(spells[0]), b: spellName(spells[1]) })}
          </span>
        </div>
      )}
      {skills && (
        <div className="flex items-center gap-2">
          <span className={LABEL}>{t("simple.prepSkills")}</span>
          <div className="flex items-center gap-1">
            {skills.map((s, i) => (
              <span key={s} className="flex items-center gap-1">
                {i > 0 && <span className="text-white/30 text-xs">›</span>}
                <span className="w-7 h-7 rounded-md bg-blue-500/15 text-blue-300 text-sm font-bold grid place-items-center">
                  {s}
                </span>
              </span>
            ))}
          </div>
          <span className="text-xs text-white/70 min-w-0">
            {t("simple.prepSkillsText", { first: skills[0], second: skills[1] })}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => void apply()}
          className="text-xs font-semibold px-3 py-1.5 rounded-full border border-accent/50 bg-accent/10 text-accent hover:bg-accent/20 transition"
        >
          {t("simple.prepApply")}
        </button>
        <span className="text-[11px] text-white/50">{status || t("simple.prepAuto")}</span>
      </div>
    </div>
  );
}

/** One or two plain sentences on how this team wins. */
export function SimpleGamePlan({
  db,
  myChampionKey,
  myRole,
  allyKeys,
  enemyKeys,
}: {
  db: ChampionDb;
  myChampionKey: string | null;
  myRole: Role | null;
  allyKeys: string[];
  enemyKeys: string[];
}) {
  const { t } = useTranslation();
  const plan = useMemo(
    () =>
      enemyKeys.length + allyKeys.length === 0
        ? []
        : deriveWinConditions({ db, myChampionKey, myRole, allyKeys, enemyKeys }).slice(0, 2),
    [db, myChampionKey, myRole, allyKeys, enemyKeys]
  );
  if (plan.length === 0) return null;
  return (
    <div className="mt-auto pt-2 border-t border-white/5 space-y-1" data-testid="simple-game-plan">
      <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">{t("simple.planTitle")}</p>
      {plan.map((c) => (
        <p key={c.key} className="text-sm text-white/80 leading-snug">
          {t(`simple.plan.${c.key.split(".").pop()}`, { ...c.params, defaultValue: t(c.key, c.params) })}
        </p>
      ))}
    </div>
  );
}
