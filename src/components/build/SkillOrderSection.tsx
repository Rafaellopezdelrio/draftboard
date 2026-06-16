// Skill order with real ability icons. Top row: Q/W/E/R icons sized
// larger with their first-leveled level number badge. Bottom row:
// the full 18-level priority pattern as small letter chips. Falls
// back to pure letters until DDragon champion data loads.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getChampionSpells,
  spellIconUrl,
  subscribeToChampionSpells,
} from "../../services/championSpells";

interface Props {
  /** 18-character order string from op.gg (e.g. "QWEQQRQWEQRQWQERWE"). */
  order: string;
  /** DDragon champion id used for the spell-data fetch. */
  championId: string;
  patch: string;
}

export function SkillOrderSection({ order, championId, patch }: Props) {
  const { t } = useTranslation();
  // Re-render when champion spell data finishes loading. The first
  // call to getChampionSpells kicks the fetch; subsequent calls are
  // cache hits.
  const [, force] = useState(0);
  useEffect(() => {
    return subscribeToChampionSpells(() => force((n) => n + 1));
  }, []);
  const spells = getChampionSpells(patch, championId);

  // First-level priority — what gets levelled at 1/2/3 and which is
  // maxed first. Shows the macro pattern at a glance.
  const firstThree = order.slice(0, 3).split("");
  const skillFirstLevel: Record<string, number> = {};
  for (let i = 0; i < order.length; i++) {
    const s = order[i];
    if (skillFirstLevel[s] === undefined) skillFirstLevel[s] = i + 1;
  }

  const skillIndex = (letter: string): number => {
    if (letter === "Q") return 0;
    if (letter === "W") return 1;
    if (letter === "E") return 2;
    if (letter === "R") return 3;
    return -1;
  };

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-widest text-white/45">
        {t("build.skillOrder.heading")}
      </p>

      {/* Top row: 4 ability icons (or letter fallback) with level badge. */}
      <div className="flex items-center gap-1.5">
        {["Q", "W", "E", "R"].map((letter) => {
          const idx = skillIndex(letter);
          const spell = idx >= 0 && spells?.spells[idx];
          const lvl = skillFirstLevel[letter];
          const isPriority = firstThree.includes(letter);
          return (
            <div
              key={letter}
              className={`relative ${isPriority ? "ring-2 ring-accent/60 rounded" : ""}`}
              title={spell ? `${letter}: ${spell.name}` : t("build.skillOrder.levelHint", { letter, lvl: lvl ?? "?" })}
            >
              {spell ? (
                <img
                  src={spellIconUrl(patch, spell.image)}
                  alt={spell.name}
                  className="w-9 h-9 rounded border border-border-subtle"
                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.opacity = "0.3")}
                />
              ) : (
                <span className="inline-flex items-center justify-center w-9 h-9 text-base font-bold rounded bg-bg-card border border-border-subtle text-accent">
                  {letter}
                </span>
              )}
              {lvl && (
                <span className="absolute -bottom-1 -right-1 text-[9px] font-bold bg-accent text-black rounded-full w-4 h-4 inline-flex items-center justify-center ring-1 ring-bg">
                  {lvl}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom row: full 18-level letter sequence. */}
      <div className="flex flex-wrap gap-0.5">
        {order.split("").slice(0, 18).map((s, i) => (
          <span
            key={i}
            className={`inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded ring-1 ${
              s === "R"
                ? "bg-accent/20 ring-accent/50 text-accent"
                : "bg-bg-card ring-border-subtle text-white/80"
            }`}
            title={t("build.skillOrder.levelAt", { n: i + 1, skill: s })}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
