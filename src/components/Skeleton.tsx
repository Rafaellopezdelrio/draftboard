interface Props {
  className?: string;
  variant?: "rect" | "circle" | "text";
}

export function Skeleton({ className = "", variant = "rect" }: Props) {
  const base = "animate-pulse bg-white/5";
  const shape =
    variant === "circle"
      ? "rounded-full"
      : variant === "text"
        ? "rounded h-4"
        : "rounded";
  return <div className={`${base} ${shape} ${className}`} />;
}

export function SuggestionSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-32" variant="text" />
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-2 rounded border border-border-subtle bg-bg-card"
        >
          <Skeleton className="w-12 h-12" variant="circle" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-24" variant="text" />
            <Skeleton className="h-3 w-32" variant="text" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BuildSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-40" variant="text" />
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="w-8 h-8" />
        ))}
      </div>
      <Skeleton className="h-3 w-48" variant="text" />
    </div>
  );
}

export function ScoutCardSkeleton() {
  return (
    <div className="p-2 rounded border border-border-subtle bg-bg-card">
      <div className="flex items-center gap-2">
        <Skeleton className="w-9 h-9" variant="circle" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-24" variant="text" />
          <Skeleton className="h-3 w-16" variant="text" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-10" variant="text" />
          <Skeleton className="h-3 w-12" variant="text" />
        </div>
      </div>
    </div>
  );
}
