// Itero/OP.GG-style stat tile: bold tabular value + small uppercase label.

interface Props {
  value: string | number;
  label: string;
  color?: "default" | "good" | "meh" | "bad" | "accent";
  icon?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

export function StatCard({
  value,
  label,
  color = "default",
  icon,
  size = "md",
}: Props) {
  const colorClass = {
    default: "text-white",
    good: "text-good",
    meh: "text-meh",
    bad: "text-bad",
    accent: "gold-text",
  }[color];
  const valueSize =
    size === "sm" ? "text-base" : size === "lg" ? "text-3xl" : "text-xl";
  return (
    <div className="flex flex-col items-center text-center px-2 py-1.5">
      {icon && <div className="text-white/40 mb-1">{icon}</div>}
      <p
        className={`${valueSize} font-bold tabular-nums leading-none ${colorClass}`}
      >
        {value}
      </p>
      <p className="text-[9px] uppercase tracking-widest text-white/40 mt-1 font-semibold">
        {label}
      </p>
    </div>
  );
}
