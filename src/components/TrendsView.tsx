import { useEffect, useState } from "react";
import { recentMatches, type MatchRow } from "../services/matchRepo";
import {
  computeTrends,
  detectWeakestArea,
  type Trend,
} from "../engine/trendsEngine";

interface Props {
  onClose: () => void;
}

export function TrendsView({ onClose }: Props) {
  const [matches, setMatches] = useState<MatchRow[]>([]);

  useEffect(() => {
    recentMatches(50).then(setMatches);
  }, []);

  const trends = computeTrends(matches);
  const weakest = detectWeakestArea(matches);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-bg-elev border border-border-subtle rounded-lg p-4 w-[640px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-accent mb-3">
          Tendencias
        </h2>

        {weakest && (
          <div className="mb-3 p-3 rounded border border-bad/60 bg-bad/10">
            <p className="text-xs uppercase text-white/50 tracking-wide">
              Tu mayor problema esta semana
            </p>
            <p className="font-medium text-white mt-1">{weakest.category}</p>
            <p className="text-sm text-white/80">{weakest.detail}</p>
          </div>
        )}

        {trends.length === 0 ? (
          <p className="text-white/50 text-center py-4">
            Necesitas al menos 6 partidas para detectar tendencias.
          </p>
        ) : (
          <div className="space-y-2">
            {trends.map((t, i) => (
              <TrendRow key={i} trend={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TrendRow({ trend }: { trend: Trend }) {
  const colors = {
    good: "border-good/60 bg-good/10 text-good",
    warn: "border-meh/60 bg-meh/10 text-meh",
    bad: "border-bad/60 bg-bad/10 text-bad",
    info: "border-border-subtle bg-bg-card text-white/80",
  };
  return (
    <div className={`p-2 rounded border text-sm ${colors[trend.severity]}`}>
      {trend.insight}
    </div>
  );
}
