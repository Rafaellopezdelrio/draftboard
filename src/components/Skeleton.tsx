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
