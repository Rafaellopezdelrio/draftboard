import { memo } from "react";
import type { ScoredSuggestion } from "../engine/suggestionEngine";
import { usePrefsStore } from "../state/prefsStore";

interface Props {
  suggestions: ScoredSuggestion[];
}

interface PropsExt extends Props {
  hasRole?: boolean;
  hasDraft?: boolean;
}

function SuggestionPanelInner({ suggestions, hasRole, hasDraft }: PropsExt) {
  const beginner = usePrefsStore((s) => s.prefs.beginnerMode);
  const noContext = !hasRole && !hasDraft;
  if (suggestions.length === 0) {
    return (
      <p className="text-white/50 text-sm">
        Selecciona algún campeón para ver sugerencias.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm uppercase tracking-wide text-white/50">
          Top picks
        </h3>
        {noContext && (
          <span
            className="text-[10px] text-meh"
            title="Genéricos del meta. Selecciona tu rol y empieza el draft para ver picks personalizados."
          >
            ⚠ genéricos
          </span>
        )}
      </div>
      {noContext && (
        <p className="text-xs text-white/50 italic mb-1">
          Selecciona tu rol arriba para ver picks adaptados a tu pool y al draft.
        </p>
      )}
      {suggestions.slice(0, 5).map((s) => {
        const colorClass =
          s.color === "good"
            ? "border-good/60 bg-good/10"
            : s.color === "meh"
              ? "border-meh/60 bg-meh/10"
              : "border-bad/60 bg-bad/10";
        return (
          <div
            key={s.champion.key}
            className={`flex items-center gap-3 p-2 rounded border ${colorClass}`}
            title={`Counter ${(s.breakdown.counter * 100).toFixed(0)}% • Synergy ${(s.breakdown.synergy * 100).toFixed(0)}% • Meta ${(s.breakdown.meta * 100).toFixed(0)}%`}
          >
            <img
              src={s.champion.iconUrl}
              alt={s.champion.name}
              className="w-12 h-12 rounded border border-border-subtle"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-white">{s.champion.name}</p>
                <span className="text-xs text-white/60">
                  {(s.score * 100).toFixed(0)}
                </span>
              </div>
              <p className="text-xs text-white/60">
                {s.reasons[0] ?? "pick decente"}
              </p>
              {beginner && (
                <ul className="text-[10px] text-white/50 mt-1 space-y-0.5">
                  <li>
                    Counter: {(s.breakdown.counter * 100).toFixed(0)}% — qué tan
                    bien gana vs los enemigos pickeados
                  </li>
                  <li>
                    Sinergia: {(s.breakdown.synergy * 100).toFixed(0)}% — cómo
                    encaja con tus aliados
                  </li>
                  <li>
                    Meta: {(s.breakdown.meta * 100).toFixed(0)}% — fuerza en el
                    parche actual
                  </li>
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const SuggestionPanel = memo(SuggestionPanelInner);
