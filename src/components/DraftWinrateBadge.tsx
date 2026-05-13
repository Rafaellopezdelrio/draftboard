import type { DraftPrediction } from "../engine/draftWinrateEngine";
import { CountUp } from "./ui/CountUp";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export function DraftWinrateBadge({ pred }: { pred: DraftPrediction }) {
  const wr = pred.winrate * 100;
  const isGood = wr >= 55;
  const isBad = wr < 45;
  const color = isGood ? "text-good" : isBad ? "text-bad" : "text-meh";
  const ring = isGood
    ? "ring-good/50"
    : isBad
      ? "ring-bad/50"
      : "ring-meh/50";
  const bg = isGood
    ? "from-good/15 to-good/5"
    : isBad
      ? "from-bad/15 to-bad/5"
      : "from-meh/15 to-meh/5";
  const Icon = isGood ? TrendingUp : isBad ? TrendingDown : Minus;

  return (
    <div
      className={`p-3 rounded-lg ring-1 bg-gradient-to-br ${bg} ${ring}`}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-md bg-white/5 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <p className={`text-3xl font-bold tabular-nums leading-none ${color}`}>
            <CountUp value={wr} suffix="%" />
          </p>
          <p className="text-[10px] uppercase tracking-widest text-white/50 mt-1 font-semibold">
            probabilidad de ganar
          </p>
        </div>
      </div>
      {pred.reasons.length > 0 && (
        <p className="text-xs text-white/60 mt-2 leading-relaxed">
          {pred.reasons.slice(0, 2).join(" · ")}
        </p>
      )}
    </div>
  );
}
