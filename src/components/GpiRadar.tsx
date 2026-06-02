import type { GpiScore } from "../engine/gpiEngine";
import { InfoTooltip } from "./InfoTooltip";

interface Props {
  score: GpiScore;
}

const CATEGORIES: Array<keyof GpiScore["categories"]> = [
  "farming",
  "vision",
  "aggression",
  "survivability",
  "objectives",
  "versatility",
  "laning",
];

const LABELS: Record<keyof GpiScore["categories"], string> = {
  farming: "Farm",
  vision: "Visión",
  aggression: "Agresión",
  survivability: "Supervivencia",
  objectives: "Objetivos",
  versatility: "Versatilidad",
  laning: "Carril",
};

export function GpiRadar({ score }: Props) {
  const cx = 100;
  const cy = 100;
  const r = 80;
  const points = CATEGORIES.map((cat, i) => {
    const angle = (Math.PI * 2 * i) / CATEGORIES.length - Math.PI / 2;
    const v = score.categories[cat] / 100;
    const x = cx + Math.cos(angle) * r * v;
    const y = cy + Math.sin(angle) * r * v;
    return `${x},${y}`;
  }).join(" ");

  const axisLines = CATEGORIES.map((_, i) => {
    const angle = (Math.PI * 2 * i) / CATEGORIES.length - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#2a3142" />;
  });

  const labelEls = CATEGORIES.map((cat, i) => {
    const angle = (Math.PI * 2 * i) / CATEGORIES.length - Math.PI / 2;
    const x = cx + Math.cos(angle) * (r + 18);
    const y = cy + Math.sin(angle) * (r + 18);
    return (
      <text
        key={cat}
        x={x}
        y={y}
        fill="#9ca3af"
        fontSize="10"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {LABELS[cat]}
      </text>
    );
  });

  const totalColor =
    score.total >= 75
      ? "text-good"
      : score.total >= 55
        ? "text-meh"
        : "text-bad";

  return (
    <div className="flex items-center gap-4">
      <div className="text-center">
        <p className={`text-5xl font-bold ${totalColor}`}>{score.total}</p>
        <p className="text-xs text-white/40 uppercase">
          <InfoTooltip term="GPI" />
        </p>
      </div>
      <svg viewBox="0 0 200 200" className="w-44 h-44">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a3142" />
        <circle cx={cx} cy={cy} r={r * 0.66} fill="none" stroke="#2a3142" />
        <circle cx={cx} cy={cy} r={r * 0.33} fill="none" stroke="#2a3142" />
        {axisLines}
        <polygon
          points={points}
          fill="rgba(78,205,196,0.25)"
          stroke="#4ecdc4"
          strokeWidth="2"
        />
        {labelEls}
      </svg>
    </div>
  );
}
