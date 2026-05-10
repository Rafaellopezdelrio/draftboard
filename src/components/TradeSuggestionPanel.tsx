import { useMemo } from "react";
import type { ChampionDb, Role } from "../types/champion";
import { suggestTrade } from "../engine/tradeEngine";

interface Props {
  db: ChampionDb;
  myRole: Role | null;
  myCurrentPick: string | null;
  allyKeys: string[];
  enemyKeys: string[];
  bannedKeys: string[];
}

export function TradeSuggestionPanel({
  db,
  myRole,
  myCurrentPick,
  allyKeys,
  enemyKeys,
  bannedKeys,
}: Props) {
  const trade = useMemo(
    () =>
      suggestTrade({
        db,
        currentPickKey: myCurrentPick,
        myRole,
        allyKeys,
        enemyKeys,
        bannedKeys,
      }),
    [db, myCurrentPick, myRole, allyKeys, enemyKeys, bannedKeys]
  );

  if (!trade) return null;
  const current = db.champions[trade.currentChampionKey];
  if (!current) return null;

  return (
    <div className="p-3 rounded border border-meh/60 bg-meh/10">
      <p className="text-xs uppercase text-meh tracking-wide mb-2">
        💡 Sugerencia de trade
      </p>
      <div className="flex items-center gap-2">
        <img
          src={current.iconUrl}
          alt={current.name}
          className="w-9 h-9 rounded grayscale opacity-70"
        />
        <span className="text-white/60">→</span>
        <img
          src={trade.proposedIcon}
          alt={trade.proposedName}
          className="w-10 h-10 rounded ring-2 ring-meh"
        />
        <div className="flex-1">
          <p className="text-sm text-white">
            Cambia a <strong>{trade.proposedName}</strong>
          </p>
          <p className="text-xs text-white/70">
            +{(trade.scoreDelta * 100).toFixed(0)}% mejor · {trade.reason}
          </p>
        </div>
      </div>
    </div>
  );
}
