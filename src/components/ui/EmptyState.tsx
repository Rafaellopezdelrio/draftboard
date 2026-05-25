// Consistent "no data yet" placeholder for empty lists. Replaces the bare
// "—" or blank panel that confused users into thinking the view was
// broken. Every list view (history, pro players, trends, masteries)
// should drop one of these in when data is empty.

import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

interface Props {
  /** Lucide icon constructor. Defaults to a generic inbox glyph. */
  icon?: LucideIcon;
  /** Big header — what's missing. e.g. "Sin partidas todavía". */
  title: string;
  /** Sub-line — how to populate. e.g. "Juega una partida y aparecerá aquí." */
  detail?: string;
  /** Optional CTA button (label + click handler). */
  action?: { label: string; onClick: () => void };
  /** Compact variant for inline use inside small panels. */
  compact?: boolean;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  detail,
  action,
  compact = false,
}: Props) {
  return (
    <div
      // role=status + aria-live=polite so screen readers announce the
      // empty state when a list goes from populated -> empty (e.g. user
      // filters until nothing matches). Polite (not assertive) because
      // it's informational, not an error/warning.
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-4 px-2 gap-1.5" : "py-8 px-4 gap-3"
      }`}
    >
      <div
        className={`${compact ? "p-2" : "p-3"} rounded-full bg-white/5 ring-1 ring-white/10`}
      >
        <Icon
          className={`${compact ? "w-4 h-4" : "w-6 h-6"} text-white/40`}
          aria-hidden="true"
        />
      </div>
      <div className="space-y-0.5">
        <p
          className={`${compact ? "text-xs" : "text-sm"} font-medium text-white/85`}
        >
          {title}
        </p>
        {detail && (
          <p
            className={`${compact ? "text-[10px]" : "text-xs"} text-white/50 leading-snug max-w-xs`}
          >
            {detail}
          </p>
        )}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-1 px-3 py-1.5 text-xs uppercase tracking-widest font-semibold bg-accent text-black rounded hover:bg-accent-deep transition"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
