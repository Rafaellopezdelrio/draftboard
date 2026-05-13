import { useMemo } from "react";
import type { ChampionDb } from "../types/champion";
import { getMatchupTips } from "../data/matchupTips";
import { usePrefsStore } from "../state/prefsStore";
import { Panel, PanelHeader } from "./ui/Panel";
import { Lightbulb } from "lucide-react";

interface Props {
  db: ChampionDb;
  enemyKeys: string[];
}

export function MatchupTipsPanel({ db, enemyKeys }: Props) {
  const beginner = usePrefsStore((s) => s.prefs.beginnerMode);
  const idToName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of Object.values(db.champions)) m.set(c.key, c.id);
    return m;
  }, [db]);
  const tips = getMatchupTips(undefined, enemyKeys, idToName);
  if (tips.length === 0) return null;

  const visible = beginner ? tips : tips.slice(0, 3);

  return (
    <Panel padding="sm">
      <PanelHeader
        icon={<Lightbulb className="w-3 h-3" />}
        title="Tips de matchup"
      />
      <div className="space-y-1.5">
        {visible.map((t, i) => (
          <div
            key={i}
            className="p-2 rounded ring-1 ring-border-subtle bg-bg-card/60"
          >
            <p className="text-[10px] uppercase tracking-widest text-accent font-semibold">
              vs {t.versus}
            </p>
            <p className="text-xs text-white/85 mt-0.5 leading-relaxed">
              {t.tip}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}
