import type { Archetype, ChampionDb } from "../types/champion";
import { detectMissingArchetypes } from "../engine/suggestionEngine";

interface Props {
  db: ChampionDb;
  allyKeys: string[];
}

const LABEL: Record<Archetype, string> = {
  engage: "Engage",
  peel: "Peel",
  frontline: "Frontline",
  poke: "Poke",
  burst: "Burst",
  "sustain-dps": "DPS sostenido",
  splitpush: "Splitpush",
  pick: "Pick",
  "wave-clear": "Wave clear",
};

export function CompAnalysis({ db, allyKeys }: Props) {
  const present = new Set<Archetype>();
  for (const k of allyKeys) {
    const c = db.champions[k];
    if (!c) continue;
    for (const a of c.archetypes) present.add(a);
  }
  const missing = detectMissingArchetypes(db, allyKeys);

  const goals: Archetype[] = ["engage", "frontline", "peel", "burst"];

  return (
    <div className="space-y-2">
      <h3 className="text-sm uppercase tracking-wide text-white/50">
        Composición
      </h3>
      <ul className="space-y-1 text-sm">
        {goals.map((a) => {
          const has = present.has(a);
          const isMissing = missing.has(a);
          return (
            <li
              key={a}
              className={`flex items-center gap-2 ${has ? "text-good" : isMissing ? "text-bad" : "text-white/60"}`}
            >
              <span>{has ? "✓" : isMissing ? "✗" : "·"}</span>
              <span>{LABEL[a]}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
