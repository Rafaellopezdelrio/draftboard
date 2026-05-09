import type { DraftPrediction } from "../engine/draftWinrateEngine";

export function DraftWinrateBadge({ pred }: { pred: DraftPrediction }) {
  const wr = pred.winrate * 100;
  const color =
    wr >= 55 ? "text-good" : wr >= 45 ? "text-meh" : "text-bad";
  const bg =
    wr >= 55
      ? "border-good/60 bg-good/10"
      : wr >= 45
        ? "border-meh/60 bg-meh/10"
        : "border-bad/60 bg-bad/10";

  return (
    <div className={`p-3 rounded border ${bg}`}>
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-bold ${color}`}>
          {wr.toFixed(0)}%
        </span>
        <span className="text-xs text-white/50 uppercase">
          probabilidad de ganar
        </span>
      </div>
      {pred.reasons.length > 0 && (
        <p className="text-xs text-white/60 mt-1">
          {pred.reasons.slice(0, 2).join(" · ")}
        </p>
      )}
    </div>
  );
}
