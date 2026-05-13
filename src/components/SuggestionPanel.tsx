import { memo } from "react";
import type { ScoredSuggestion } from "../engine/suggestionEngine";
import { usePrefsStore } from "../state/prefsStore";
import { CountUp } from "./ui/CountUp";
import { GradeBadge } from "./ui/GradeBadge";
import { Crown, Sword, Heart, Trophy, AlertTriangle } from "lucide-react";

interface Props {
  suggestions: ScoredSuggestion[];
  hasRole?: boolean;
  hasDraft?: boolean;
}

function SuggestionPanelInner({ suggestions, hasRole, hasDraft }: Props) {
  const beginner = usePrefsStore((s) => s.prefs.beginnerMode);
  const noContext = !hasRole && !hasDraft;
  if (suggestions.length === 0) {
    return (
      <p className="text-white/50 text-sm">
        Selecciona algún campeón para ver sugerencias.
      </p>
    );
  }
  const [first, ...rest] = suggestions.slice(0, 5);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] uppercase tracking-widest text-white/40 font-semibold flex items-center gap-1.5">
          <Trophy className="w-3 h-3" />
          Top picks
        </h3>
        {noContext && (
          <span
            className="inline-flex items-center gap-1 text-[10px] text-meh"
            title="Genéricos del meta. Selecciona tu rol y empieza el draft para picks personalizados."
          >
            <AlertTriangle className="w-3 h-3" />
            genéricos
          </span>
        )}
      </div>
      {noContext && (
        <p className="text-xs text-white/50 italic mb-1">
          Selecciona tu rol arriba para ver picks adaptados a tu pool y al draft.
        </p>
      )}

      {/* Pick #1 — hero card with glow */}
      {first && <PickHero suggestion={first} beginner={beginner} />}

      {/* Picks #2-#5 compact */}
      <div className="space-y-1.5">
        {rest.map((s) => (
          <PickRow key={s.champion.key} suggestion={s} beginner={beginner} />
        ))}
      </div>
    </div>
  );
}

function PickHero({ suggestion: s, beginner }: { suggestion: ScoredSuggestion; beginner: boolean }) {
  const isOneTrick = s.reasons.includes("tu main");
  const colorRing =
    s.color === "good"
      ? "ring-good/60"
      : s.color === "meh"
        ? "ring-meh/60"
        : "ring-bad/60";
  return (
    <div
      className={`relative p-3 rounded-lg ring-1 ${colorRing} bg-gradient-to-br from-bg-card to-bg-elev ${
        isOneTrick ? "animate-[glowPulse_2.5s_ease-in-out_infinite]" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <img
            src={s.champion.iconUrl}
            alt={s.champion.name}
            className="w-16 h-16 rounded-md ring-2 ring-accent/40"
          />
          {isOneTrick && (
            <div className="absolute -top-1.5 -right-1.5 bg-gradient-to-br from-accent-soft to-accent text-black rounded-full p-1 shadow-lg">
              <Crown className="w-3 h-3" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <p className="text-lg font-bold gold-text truncate">{s.champion.name}</p>
            <span className="text-[10px] uppercase tracking-widest text-white/40">
              #1
            </span>
          </div>
          <p className="text-xs text-white/70 truncate">
            {s.reasons.slice(0, 2).join(" · ") || "pick sólido"}
          </p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <GradeBadge score={s.score} size="lg" />
          <p className="text-[10px] tabular-nums font-semibold text-white/60 leading-none">
            <CountUp value={s.score * 100} />
          </p>
        </div>
      </div>

      {beginner && <BreakdownBars s={s} />}
    </div>
  );
}

function PickRow({ suggestion: s, beginner }: { suggestion: ScoredSuggestion; beginner: boolean }) {
  const ring =
    s.color === "good"
      ? "ring-good/40"
      : s.color === "meh"
        ? "ring-meh/40"
        : "ring-bad/40";
  return (
    <div
      className={`flex items-center gap-2.5 p-2 rounded-md bg-bg-card/60 ring-1 ${ring} hover:bg-bg-hover transition`}
      title={`Counter ${(s.breakdown.counter * 100).toFixed(0)}% · Synergy ${(s.breakdown.synergy * 100).toFixed(0)}% · Meta ${(s.breakdown.meta * 100).toFixed(0)}%`}
    >
      <img
        src={s.champion.iconUrl}
        alt={s.champion.name}
        className="w-10 h-10 rounded"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{s.champion.name}</p>
        <p className="text-[11px] text-white/55 truncate">
          {s.reasons[0] ?? "pick decente"}
        </p>
      </div>
      <GradeBadge score={s.score} size="sm" />
      {beginner && <BreakdownBars s={s} compact />}
    </div>
  );
}

function BreakdownBars({ s, compact = false }: { s: ScoredSuggestion; compact?: boolean }) {
  const bars = [
    { label: "Counter", value: s.breakdown.counter, icon: <Sword className="w-3 h-3" /> },
    { label: "Sinergia", value: s.breakdown.synergy, icon: <Heart className="w-3 h-3" /> },
    { label: "Meta", value: s.breakdown.meta, icon: <Trophy className="w-3 h-3" /> },
  ];
  if (compact) return null;
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {bars.map((b) => (
        <div key={b.label}>
          <div className="flex items-center gap-1 text-[10px] text-white/50 mb-0.5">
            {b.icon}
            <span>{b.label}</span>
            <span className="ml-auto text-white/40">
              {(b.value * 100).toFixed(0)}
            </span>
          </div>
          <div className="h-1 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent-deep to-accent"
              style={{ width: `${Math.min(100, b.value * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export const SuggestionPanel = memo(SuggestionPanelInner);
