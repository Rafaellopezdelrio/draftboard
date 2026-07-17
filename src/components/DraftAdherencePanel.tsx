// "Advice adherence" stat: your win rate when you followed the engine's top
// suggestion vs when you didn't. Sourced from the drafts→matches link
// (draftsRepo). Renders nothing until a few drafts have been linked to
// outcomes, so it stays invisible until there's a meaningful signal.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { draftAdviceStats, type AdviceStats } from "../services/draftsRepo";
import { Panel } from "./ui/Panel";

const MIN_GAMES = 3;

function wr(wins: number, games: number): number {
  return games > 0 ? Math.round((wins / games) * 100) : 0;
}

export function DraftAdherencePanel() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<AdviceStats | null>(null);

  useEffect(() => {
    draftAdviceStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats) return null;
  const total = stats.followedGames + stats.notFollowedGames;
  if (total < MIN_GAMES) return null;

  const followedWr = wr(stats.followedWins, stats.followedGames);
  const notWr = wr(stats.notFollowedWins, stats.notFollowedGames);

  return (
    <Panel padding="sm">
      <p className="text-[11px] uppercase tracking-widest text-white/40 mb-2">
        {t("trends.adherence.title")}
      </p>
      <div className="flex gap-6 text-sm">
        <div>
          <p className="text-white/55 text-xs">{t("trends.adherence.followed")}</p>
          <p className="text-good font-semibold">
            {followedWr}% WR{" "}
            <span className="text-white/40 text-xs font-normal">
              ({stats.followedGames}g)
            </span>
          </p>
        </div>
        <div>
          <p className="text-white/55 text-xs">{t("trends.adherence.notFollowed")}</p>
          <p className="text-white/80 font-semibold">
            {notWr}% WR{" "}
            <span className="text-white/40 text-xs font-normal">
              ({stats.notFollowedGames}g)
            </span>
          </p>
        </div>
      </div>
    </Panel>
  );
}
