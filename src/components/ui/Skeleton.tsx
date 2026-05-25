// Pulse-animated placeholder blocks for loading states. Cheaper visual
// than a spinner — gives the user a layout-stable hint of "content
// arriving here soon" instead of jumping content when data lands.
//
// Use for: champion DB cold load, panel data fetches, tier-list refresh.

interface Props {
  /** Width in Tailwind units (e.g. "w-32") or arbitrary CSS via className. */
  className?: string;
  /** Render multiple stacked skeleton lines. */
  rows?: number;
  /** Spacing between rows when rows > 1. */
  gap?: "tight" | "normal";
}

export function Skeleton({ className = "h-4 w-full", rows = 1, gap = "normal" }: Props) {
  if (rows === 1) {
    return (
      <div
        className={`${className} animate-pulse rounded bg-white/10`}
        aria-hidden="true"
      />
    );
  }
  return (
    <div className={`space-y-${gap === "tight" ? "1" : "2"}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={`${className} animate-pulse rounded bg-white/10`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

/** Common pattern: avatar circle + 2-line text block. Used in player lists. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-2 animate-pulse">
      <div className="w-8 h-8 rounded-full bg-white/10" aria-hidden="true" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-3/4 bg-white/10 rounded" aria-hidden="true" />
        <div className="h-2 w-1/2 bg-white/10 rounded" aria-hidden="true" />
      </div>
    </div>
  );
}

/** Champion-card grid placeholder (used during DB cold load). */
export function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border-subtle p-3 space-y-2 animate-pulse">
      <div className="h-24 w-full bg-white/10 rounded" aria-hidden="true" />
      <div className="h-3 w-2/3 bg-white/10 rounded" aria-hidden="true" />
      <div className="h-2 w-1/3 bg-white/10 rounded" aria-hidden="true" />
    </div>
  );
}
