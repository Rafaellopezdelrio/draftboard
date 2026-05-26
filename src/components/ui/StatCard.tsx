// Itero/OP.GG-style stat tile: bold tabular value + small uppercase label.
// When `value` is a number, animates from 0 with ease-out so the user gets
// a premium "stats loading in" effect. Strings render as-is (already-
// formatted percentages / KDA ratios / time stamps).

import { CountUp } from "./CountUp";

interface Props {
  value: string | number;
  label: string;
  color?: "default" | "good" | "meh" | "bad" | "accent";
  icon?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** Skip CountUp animation even when value is numeric. Use when the
   *  caller is feeding rapidly-changing live values that shouldn't
   *  animate on every tick. */
  noAnimate?: boolean;
}

export function StatCard({
  value,
  label,
  color = "default",
  icon,
  size = "md",
  noAnimate = false,
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

  const isNumeric = typeof value === "number" && Number.isFinite(value);

  return (
    <div className="flex flex-col items-center text-center px-2 py-1.5">
      {icon && <div className="text-white/40 mb-1">{icon}</div>}
      <p
        className={`${valueSize} font-bold tabular-nums leading-none ${colorClass}`}
      >
        {isNumeric && !noAnimate ? (
          <CountUp
            value={value as number}
            decimals={Number.isInteger(value as number) ? 0 : 1}
          />
        ) : (
          value
        )}
      </p>
      <p className="text-[9px] uppercase tracking-widest text-white/40 mt-1 font-semibold">
        {label}
      </p>
    </div>
  );
}
