import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ChampionDb, Role } from "../types/champion";
import { suggestTrade } from "../engine/tradeEngine";
import { ArrowLeftRight, ChevronRight } from "lucide-react";

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
  const { t } = useTranslation();
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
    <div className="p-3 rounded-lg ring-1 ring-meh/50 bg-gradient-to-br from-meh/10 to-bg-elev/30">
      <div className="flex items-center gap-1.5 mb-2">
        <ArrowLeftRight className="w-3.5 h-3.5 text-meh" />
        <p className="text-[10px] uppercase tracking-widest font-semibold text-meh">
          {t("trade.title")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <img
          src={current.iconUrl}
          alt={current.name}
          className="w-9 h-9 rounded grayscale opacity-60"
        />
        <ChevronRight className="w-4 h-4 text-meh/70" />
        <img
          src={trade.proposedIcon}
          alt={trade.proposedName}
          className="w-11 h-11 rounded ring-2 ring-meh shadow-lg"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-medium truncate">
            {t("trade.switchTo")}{" "}
            <span className="gold-text font-bold">{trade.proposedName}</span>
          </p>
          <p className="text-[11px] text-white/70 truncate">
            +{(trade.scoreDelta * 100).toFixed(0)}% {t("trade.better")} · {trade.reason}
          </p>
        </div>
      </div>
    </div>
  );
}
