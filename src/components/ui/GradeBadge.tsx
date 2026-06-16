// OP.GG-style letter grade badge based on a 0-100 score.

import { useTranslation } from "react-i18next";

interface Props {
  score: number; // 0-1
  size?: "sm" | "md" | "lg";
}

function scoreToGrade(score01: number): { grade: string; tier: "splus" | "s" | "a" | "b" | "c" | "d" } {
  const s = score01 * 100;
  if (s >= 75) return { grade: "S+", tier: "splus" };
  if (s >= 65) return { grade: "S", tier: "s" };
  if (s >= 55) return { grade: "A", tier: "a" };
  if (s >= 45) return { grade: "B", tier: "b" };
  if (s >= 35) return { grade: "C", tier: "c" };
  return { grade: "D", tier: "d" };
}

const STYLES = {
  splus: "bg-gradient-to-br from-accent-soft to-accent text-black ring-accent shadow-[0_0_12px_rgba(78,205,196,0.55)]",
  s: "bg-gradient-to-br from-accent to-accent-deep text-black ring-accent",
  a: "bg-gradient-to-br from-cyan-300 to-cyan-600 text-black ring-cyan-400",
  b: "bg-gradient-to-br from-emerald-400 to-emerald-700 text-black ring-emerald-400",
  c: "bg-bg-card text-white/70 ring-border-strong",
  d: "bg-bg-card text-white/40 ring-border-subtle",
} as const;

export function GradeBadge({ score, size = "md" }: Props) {
  const { t } = useTranslation();
  const { grade, tier } = scoreToGrade(score);
  const sz =
    size === "sm"
      ? "w-6 h-6 text-[10px]"
      : size === "lg"
        ? "w-10 h-10 text-base"
        : "w-8 h-8 text-xs";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md font-extrabold tracking-tight ring-1 ${sz} ${STYLES[tier]}`}
      title={t("grade.tooltip", { grade })}
    >
      {grade}
    </span>
  );
}
