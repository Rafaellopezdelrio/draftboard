import { useMemo } from "react";
import type { ChampionDb } from "../types/champion";
import { getMatchupTips } from "../data/matchupTips";
import { usePrefsStore } from "../state/prefsStore";

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

  // Show top 3 unless beginner mode (then show all)
  const visible = beginner ? tips : tips.slice(0, 3);

  return (
    <div className="space-y-2">
      <h3 className="text-sm uppercase tracking-wide text-white/50">
        Tips de matchup
      </h3>
      {visible.map((t, i) => (
        <div
          key={i}
          className="p-2 rounded bg-bg-card border border-border-subtle"
        >
          <p className="text-xs uppercase text-accent">vs {t.versus}</p>
          <p className="text-sm text-white/85">{t.tip}</p>
        </div>
      ))}
    </div>
  );
}
