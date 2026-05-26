// Win Conditions panel. Surfaces a 3-4 bullet "game plan" derived from
// the team comps at champ select. Goal: user leaves champ select with
// concrete macro priorities, not just a pick recommendation.
//
// Rendered in the right-rail column alongside scouts and matchup tips.
// Auto-hides when there's no enemy comp visible yet (no recommendations
// to surface). Lightweight — engine is pure heuristic, no API call.

import { memo, useMemo } from "react";
import { Target, Flame, Hourglass, Sparkles } from "lucide-react";
import { Panel, PanelHeader } from "./ui/Panel";
import { deriveWinConditions, type WinCondition } from "../engine/winConditions";
import type { ChampionDb, Role } from "../types/champion";

interface Props {
  db: ChampionDb;
  myChampionKey: string | null;
  myRole: Role | null;
  allyKeys: string[];
  enemyKeys: string[];
}

function phaseIcon(phase: WinCondition["phase"]) {
  const iconCls = "w-3 h-3 shrink-0";
  switch (phase) {
    case "early":
      return <Flame className={`${iconCls} text-orange-300`} />;
    case "mid":
      return <Target className={`${iconCls} text-accent`} />;
    case "late":
      return <Hourglass className={`${iconCls} text-purple-300`} />;
    case "any":
      return <Sparkles className={`${iconCls} text-white/50`} />;
  }
}

function phaseLabel(phase: WinCondition["phase"]) {
  return {
    early: "Early",
    mid: "Mid",
    late: "Late",
    any: "Any",
  }[phase];
}

function WinConditionsPanelInner({
  db,
  myChampionKey,
  myRole,
  allyKeys,
  enemyKeys,
}: Props) {
  const conditions = useMemo(
    () =>
      deriveWinConditions({
        db,
        myChampionKey,
        myRole,
        allyKeys,
        enemyKeys,
      }),
    [db, myChampionKey, myRole, allyKeys, enemyKeys]
  );

  // Need at least one enemy AND one ally pick to derive anything useful.
  // If both sides are empty, the engine returns its mixed-default — we
  // skip the panel entirely so the user doesn't see generic advice
  // during early ban phase.
  const hasContext =
    enemyKeys.filter(Boolean).length > 0 || allyKeys.filter(Boolean).length > 0;
  if (!hasContext) return null;

  return (
    <Panel padding="sm">
      <PanelHeader
        icon={<Target className="w-3 h-3" />}
        title="Game plan"
        subtitle="prioridad táctica"
      />
      <ul className="space-y-1.5">
        {conditions.map((c, i) => (
          <li
            key={i}
            className={`flex items-start gap-2 p-1.5 rounded text-[11px] leading-snug ${
              c.priority === 1
                ? "bg-accent/10 border border-accent/30"
                : "bg-bg-card/40 border border-border-subtle/40"
            }`}
            title={`Fase ${phaseLabel(c.phase)} · prioridad ${c.priority}`}
          >
            {phaseIcon(c.phase)}
            <div className="flex-1 min-w-0">
              <p className={c.priority === 1 ? "text-white font-medium" : "text-white/80"}>
                {c.text}
              </p>
              <span className="text-[9px] uppercase tracking-wider text-white/35">
                {phaseLabel(c.phase)} · #{c.priority}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export const WinConditionsPanel = memo(WinConditionsPanelInner);
