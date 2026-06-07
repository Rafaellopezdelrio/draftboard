import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ScoredSuggestion } from "../engine/suggestionEngine";
import { usePrefsStore } from "../state/prefsStore";
import { CountUp } from "./ui/CountUp";
import { GradeBadge } from "./ui/GradeBadge";
import { Crown, Sword, Heart, Trophy, Star } from "lucide-react";

/**
 * Mastery chevron — small badge overlaid on a champion icon showing
 * the player's mastery level (M5, M6, M7, or M10) for that champ.
 * Returns null below M3 to keep the UI clean — we only flag champs
 * the player has meaningful experience with.
 *
 * Colors mirror Riot's in-client mastery palette: M5 blue, M6 purple,
 * M7 gold, M10 prestige red.
 *
 * Declared at module top (before the components that reference it) so
 * Vite HMR can't strand consumers with a stale reference when this
 * file is edited mid-session. Function declarations DO hoist within an
 * ES module, but HMR partial updates have been observed to break that
 * guarantee — the bug surfaced as a ReferenceError in production
 * (Sentry DRAFTBOARD-3/DRAFTBOARD-4) until we moved the def up.
 */
function MasteryChevron({ level, large = false }: { level: number; large?: boolean }) {
  if (!level || level < 3) return null;
  const color =
    level >= 10
      ? "bg-red-500 ring-red-300"
      : level >= 7
        ? "bg-accent ring-accent/70 text-black"
        : level >= 6
          ? "bg-purple-500 ring-purple-300"
          : level >= 5
            ? "bg-blue-500 ring-blue-300"
            : "bg-white/30 ring-white/50";
  const size = large ? "w-5 h-5 text-[10px]" : "w-4 h-4 text-[9px]";
  return (
    <span
      className={`absolute -bottom-1 -left-1 ${size} font-bold rounded-full inline-flex items-center justify-center ring-2 shadow-md tabular-nums ${color}`}
      title={`Mastery ${level}`}
    >
      {level}
    </span>
  );
}

interface Props {
  suggestions: ScoredSuggestion[];
  hasRole?: boolean;
  hasDraft?: boolean;
}

function SuggestionPanelInner({ suggestions, hasRole, hasDraft }: Props) {
  const { t } = useTranslation();
  const beginner = usePrefsStore((s) => s.prefs.beginnerMode);
  const noContext = !hasRole && !hasDraft;

  // Split into "comfort" (you've actually played these) vs "meta only"
  // (recommended by tier list but you don't know them yet). Memoised so
  // re-renders triggered by unrelated prefs (e.g. beginnerMode toggle
  // elsewhere) don't re-filter+slice the suggestions array. MUST run before
  // the empty-suggestions early return below so the hook order is stable
  // across renders (rules-of-hooks); empty input just yields empty buckets.
  const { comfortPicks, metaPicks } = useMemo(() => {
    const comfort = suggestions.filter((s) => s.breakdown.isComfort).slice(0, 3);
    const usedKeys = new Set(comfort.map((s) => s.champion.key));
    const meta = suggestions
      .filter((s) => !usedKeys.has(s.champion.key))
      .slice(0, comfort.length > 0 ? 3 : 5);
    return { comfortPicks: comfort, metaPicks: meta };
  }, [suggestions]);

  if (suggestions.length === 0) {
    return (
      <p className="text-white/50 text-sm">
        {t("suggestions.empty")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] uppercase tracking-widest text-white/40 font-semibold flex items-center gap-1.5">
          <Trophy className="w-3 h-3" />
          {t("suggestions.topPicks")}
          {noContext && (
            <span className="ml-1 text-[9px] uppercase tracking-widest text-white/30 font-normal">
              · {t("suggestions.generalMeta")}
            </span>
          )}
        </h3>
      </div>
      {noContext && (
        <p className="text-[11px] text-white/40 leading-relaxed pb-1 border-b border-border-subtle/40">
          {t("suggestions.pickRolePrompt")}
        </p>
      )}

      {/* Comfort section — picks the user actually knows */}
      {comfortPicks.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-accent font-semibold flex items-center gap-1.5">
            <Star className="w-3 h-3" />
            {t("suggestions.yourPicks")}
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
          {/* Sub-header ONLY when there's a comfort section above to
              distinguish from — otherwise this IS the top-picks list and the
              panel's main header already labels it (no duplicate "Top picks"). */}
          {comfortPicks.length > 0 && (
            <p className="text-[10px] uppercase tracking-widest text-white/35 font-semibold flex items-center gap-1.5">
              <Trophy className="w-3 h-3" />
              {t("suggestions.pureMeta")}
            </p>
          )}
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
  const { t } = useTranslation();
  const isOneTrick = s.reasons.includes("suggestions.reason.main");
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
            {t("suggestions.perfectPick")}
          </span>
        )}
        {!isPerfect && isComfort && !isOneTrick && (
          <span className="bg-accent/20 text-accent text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full ring-1 ring-accent/40">
            {t("suggestions.comfort")}
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
          {/* Mastery chevron — bottom-right corner (Crown stays top-right
            * for one-tricks so both badges coexist cleanly). */}
          <MasteryChevron level={s.breakdown.masteryLevel} large />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <p className="text-lg font-bold gold-text truncate">{s.champion.name}</p>
            <span className="text-[10px] uppercase tracking-widest text-white/40">
              #1
            </span>
          </div>
          <p className="text-xs text-white/70 truncate">
            {s.reasons.slice(0, 2).map((r) => t(r)).join(" · ") ||
              t("suggestions.solidPick")}
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
  const { t } = useTranslation();
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
      <div className="relative shrink-0">
        <img
          src={s.champion.iconUrl}
          alt={s.champion.name}
          className="w-10 h-10 rounded"
        />
        {/* Mastery chevron — shows M5/M6/M7/M10 badge over the icon
          * so the user sees their experience level with the champ at a
          * glance. Only renders for M3+. Sized + colored by tier. */}
        <MasteryChevron level={s.breakdown.masteryLevel} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-white truncate">{s.champion.name}</p>
          {isPerfect && (
            <Star className="w-3 h-3 text-accent fill-accent shrink-0" />
          )}
          {!isPerfect && isComfort && (
            <span className="text-[8px] uppercase tracking-wider text-accent/80 bg-accent/10 px-1 rounded shrink-0">
              {t("suggestions.comfortLower")}
            </span>
          )}
        </div>
        <p className="text-[11px] text-white/55 truncate">
          {s.reasons[0] ? t(s.reasons[0]) : t("suggestions.decentPick")}
        </p>
      </div>
      <GradeBadge score={s.score} size="sm" />
      {beginner && <BreakdownBars s={s} compact />}
    </div>
  );
}

function BreakdownBars({ s, compact = false }: { s: ScoredSuggestion; compact?: boolean }) {
  const { t } = useTranslation();
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
      label: t("suggestions.barCounter"),
      value: s.breakdown.counter,
      Icon: Sword,
      noData: noDataCounter,
      explain: t("suggestions.barCounterNoData"),
    },
    {
      label: t("suggestions.barSynergy"),
      value: s.breakdown.synergy,
      Icon: Heart,
      noData: noDataSynergy,
      explain: t("suggestions.barSynergyNoData"),
    },
    {
      label: t("suggestions.barMeta"),
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
