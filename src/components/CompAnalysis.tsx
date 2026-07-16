import { useTranslation } from "react-i18next";
import type { Archetype, ChampionDb } from "../types/champion";
import { detectMissingArchetypes } from "../engine/suggestionEngine";
import { profileTeam } from "../engine/winConditions";
import { Panel } from "./ui/Panel";
import { Users, Check, X, Minus } from "lucide-react";

interface Props {
  db: ChampionDb;
  allyKeys: string[];
  /** When provided, the enemy damage split renders too (itemization read). */
  enemyKeys?: string[];
}

/** Stacked AD/AP split bar + true-damage badge for one team. Percentages come
 * from profileTeam — the same profile the win-condition engine reasons over. */
function DamageBar({
  db,
  keys,
  label,
}: {
  db: ChampionDb;
  keys: string[];
  label: string;
}) {
  const { t } = useTranslation();
  if (keys.length === 0) return null;
  const prof = profileTeam(db, keys);
  const ad = Math.round(prof.adShare * 100);
  const ap = Math.round(prof.apShare * 100);
  if (ad + ap === 0) return null;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-white/45">
        <span>{label}</span>
        {prof.trueDmg > 0 && (
          <span
            className="text-white/70 normal-case tracking-normal"
            title={t("comp.dmg.trueTitle")}
          >
            ⚔ {t("comp.dmg.true", { count: prof.trueDmg })}
          </span>
        )}
      </div>
      <div
        className="flex h-2 rounded overflow-hidden ring-1 ring-white/10"
        title={`${t("comp.dmg.ad")} ${ad}% · ${t("comp.dmg.ap")} ${ap}%`}
      >
        <div className="bg-orange-400/80" style={{ width: `${ad}%` }} />
        <div className="bg-sky-400/80" style={{ width: `${ap}%` }} />
      </div>
      <div className="flex justify-between text-[9px] tabular-nums">
        <span className="text-orange-300/90">{t("comp.dmg.ad")} {ad}%</span>
        <span className="text-sky-300/90">{t("comp.dmg.ap")} {ap}%</span>
      </div>
    </div>
  );
}

export function CompAnalysis({ db, allyKeys, enemyKeys = [] }: Props) {
  const { t } = useTranslation();
  const present = new Set<Archetype>();
  for (const k of allyKeys) {
    const c = db.champions[k];
    if (!c) continue;
    for (const a of c.archetypes) present.add(a);
  }
  const missing = detectMissingArchetypes(db, allyKeys);

  const goals: Archetype[] = ["engage", "frontline", "peel", "burst"];
  const score = goals.filter((g) => present.has(g)).length;

  return (
    <Panel
      padding="sm"
      collapsible
      defaultOpen
      storageKey="comp"
      icon={<Users className="w-3 h-3" />}
      title={t("comp.title")}
      summary={`${score}/${goals.length}`}
    >
      <ul className="space-y-1 text-sm">
        {goals.map((a) => {
          const has = present.has(a);
          const isMissing = missing.has(a);
          const Icon = has ? Check : isMissing ? X : Minus;
          const color = has
            ? "text-good"
            : isMissing
              ? "text-bad"
              : "text-white/60";
          return (
            <li key={a} className={`flex items-center gap-2 text-xs ${color}`}>
              <Icon className="w-3.5 h-3.5" />
              <span>{t(`comp.archetype.${a}`)}</span>
            </li>
          );
        })}
      </ul>

      {/* Damage profile — AD/AP split (+true-damage count) per team, so you
          can balance your comp's damage and read the enemy's for itemization. */}
      {(allyKeys.length > 0 || enemyKeys.length > 0) && (
        <div className="mt-2 pt-2 border-t border-white/5 space-y-2">
          <DamageBar db={db} keys={allyKeys} label={t("draft.yourTeam")} />
          <DamageBar db={db} keys={enemyKeys} label={t("draft.enemies")} />
        </div>
      )}
    </Panel>
  );
}
