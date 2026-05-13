import type { Archetype, ChampionDb } from "../types/champion";
import { detectMissingArchetypes } from "../engine/suggestionEngine";
import { Panel, PanelHeader } from "./ui/Panel";
import { Users, Check, X, Minus } from "lucide-react";

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
  const score = goals.filter((g) => present.has(g)).length;

  return (
    <Panel padding="sm">
      <PanelHeader
        icon={<Users className="w-3 h-3" />}
        title="Composición"
        action={
          <span className="text-[10px] tabular-nums text-white/40">
            {score}/{goals.length}
          </span>
        }
      />
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
              <span>{LABEL[a]}</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
