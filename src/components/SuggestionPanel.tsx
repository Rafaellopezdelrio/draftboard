import { memo, useMemo } from "react";
import type { ScoredSuggestion } from "../engine/suggestionEngine";
import { usePrefsStore } from "../state/prefsStore";
import { CountUp } from "./ui/CountUp";
import { GradeBadge } from "./ui/GradeBadge";
import { Crown, Sword, Heart, Trophy, Star } from "lucide-react";

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

  // Split into "comfort" (you've actually played these) vs "meta only"
  // (recommended by tier list but you don't know them yet). Memoised so
  // re-renders triggered by unrelated prefs (e.g. beginnerMode toggle
  // elsewhere) don't re-filter+slice the suggestions array.
  const { comfortPicks, metaPicks } = useMemo(() => {
    const comfort = suggestions.filter((s) => s.breakdown.isComfort).slice(0, 3);
    const usedKeys = new Set(comfort.map((s) => s.champion.key));
    const meta = suggestions
      .filter((s) => !usedKeys.has(s.champion.key))
      .slice(0, comfort.length > 0 ? 3 : 5);
    return { comfortPicks: comfort, metaPicks: meta };
  }, [suggestions]);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] uppercase tracking-widest text-white/40 font-semibold flex items-center gap-1.5">
          <Trophy className="w-3 h-3" />
          Top picks
          {noContext && (
            <span className="ml-1 text-[9px] uppercase tracking-widest text-white/30 font-normal">
              · meta general
            </span>
          )}
        </h3>
      </div>
      {noContext && (
        <p className="text-[11px] text-white/40 leading-relaxed pb-1 border-b border-border-subtle/40">
          Selecciona tu rol arriba para picks personalizados según tu pool y el
          draft.
        </p>
      )}

      {/* Comfort section — picks the user actually knows */}
      {comfortPicks.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-accent font-semibold flex items-center gap-1.5">
            <Star className="w-3 h-3" />
            Tus picks · comfort + meta
          </p>
          <PickHero suggestion={comfortPicks[0]} beginner={beginner} />
          <div className="space-y-1.5">
            {comfortPicks.slice(1).map((s) => (
              <PickRow key={s.champion.key} suggestion={s} beginner={beginner} />
            ))}
          </div>
        </div>
      )}

      {/* Meta-only section — strong picks but not in your pool */}
      {metaPicks.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-white/35 font-semibold flex items-center gap-1.5">
            <Trophy className="w-3 h-3" />
            {comfortPicks.length > 0 ? "Meta puro" : "Top picks"}
          </p>
          {comfortPicks.length === 0 && metaPicks[0] && (
            <PickHero suggestion={metaPicks[0]} beginner={beginner} />
          )}
          <div className="space-y-1.5">
            {(comfortPicks.length === 0 ? metaPicks.slice(1) : metaPicks).map(
              (s) => (
                <PickRow key={s.champion.key} suggestion={s} beginner={beginner} />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PickHero({ suggestion: s, beginner }: { suggestion: ScoredSuggestion; beginner: boolean }) {
  const isOneTrick = s.reasons.includes("tu main");
  const isPerfect = s.breakdown.isPerfectPick;
  const isComfort = s.breakdown.isComfort;
  const colorRing = isPerfect
    ? "ring-accent"
    : s.color === "good"
      ? "ring-good/60"
      : s.color === "meh"
        ? "ring-meh/60"
        : "ring-bad/60";
  return (
    <div
      className={`relative p-3 rounded-lg ring-1 ${colorRing} bg-gradient-to-br from-bg-card to-bg-elev ${
        isOneTrick || isPerfect ? "animate-[glowPulse_2.5s_ease-in-out_infinite]" : ""
      }`}
    >
      {/* Top-right badges row */}
      <div className="absolute -top-2 right-3 flex gap-1">
        {isPerfect && (
          <span className="bg-gradient-to-r from-accent to-yellow-300 text-black text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full shadow-lg flex items-center gap-1">
            <Star className="w-2.5 h-2.5 fill-current" />
            Pick perfecto
          </span>
        )}
        {!isPerfect && isComfort && !isOneTrick && (
          <span className="bg-accent/20 text-accent text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full ring-1 ring-accent/40">
            Comfort
          </span>
        )}
      </div>

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
  const isPerfect = s.breakdown.isPerfectPick;
  const isComfort = s.breakdown.isComfort;
  const ring = isPerfect
    ? "ring-accent/60"
    : s.color === "good"
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
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-white truncate">{s.champion.name}</p>
          {isPerfect && (
            <Star className="w-3 h-3 text-accent fill-accent shrink-0" />
          )}
          {!isPerfect && isComfort && (
            <span className="text-[8px] uppercase tracking-wider text-accent/80 bg-accent/10 px-1 rounded shrink-0">
              comfort
            </span>
          )}
        </div>
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
  if (compact) return null;
  // `noDataFor*` flips when the engine returned the 0.5 default for that
  // axis. Counter is 0.5 when there are no enemies in the draft yet;
  // Synergy is 0.5 when there are no allies. We render those bars muted
  // with "—" instead of "50" so the user doesn't misread the placeholder
  // as a real low rating. Meta has no default fallback — always real.
  const noDataCounter = !s.breakdown.hasEnemyData;
  const noDataSynergy = !s.breakdown.hasAllyData;
  const bars: Array<{
    label: string;
    value: number;
    Icon: typeof Sword;
    noData: boolean;
    explain?: string;
  }> = [
    {
      label: "Counter (cómo contraataca a los enemigos)",
      value: s.breakdown.counter,
      Icon: Sword,
      noData: noDataCounter,
      explain: "Sin enemigos en el draft",
    },
    {
      label: "Sinergia (encaje con tu equipo)",
      value: s.breakdown.synergy,
      Icon: Heart,
      noData: noDataSynergy,
      explain: "Sin aliados en el draft",
    },
    {
      label: "Meta (tier del parche)",
      value: s.breakdown.meta,
      Icon: Trophy,
      noData: false,
    },
  ];
  return (
    <div className="mt-2.5 flex items-center gap-2.5 pt-2 border-t border-white/5">
      {bars.map(({ label, value, Icon, noData, explain }) => (
        <div
          key={label}
          title={noData ? `${label} — ${explain}` : label}
          className={`flex-1 flex items-center gap-1.5 min-w-0 ${
            noData ? "opacity-40" : ""
          }`}
        >
          <Icon className="w-3 h-3 text-white/40 shrink-0" />
          <div className="flex-1 h-[3px] rounded-full bg-white/[0.05] overflow-hidden min-w-[24px]">
            {!noData && (
              <div
                className="h-full bg-gradient-to-r from-accent/50 to-accent rounded-full"
                style={{ width: `${Math.min(100, value * 100)}%` }}
              />
            )}
          </div>
          <span className="text-[10px] tabular-nums font-semibold text-white/65 shrink-0 w-5 text-right">
            {noData ? "—" : (value * 100).toFixed(0)}
          </span>
        </div>
      ))}
    </div>
  );
}

export const SuggestionPanel = memo(SuggestionPanelInner);
