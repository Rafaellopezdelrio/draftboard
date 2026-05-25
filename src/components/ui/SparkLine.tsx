// Inline-SVG line chart. Zero external deps so we don't bloat the
// bundle with Chart.js (~70KB) or recharts (~90KB) for a glorified
// 100-LOC line graph. Renders responsively via viewBox.
//
// Use for: winrate trends, KDA over last N matches, CS/min curve,
// rank LP movement. Anywhere we have a small numeric series.
//
// Design:
//   - Auto-scales Y to data range with 5% padding
//   - Highlights the last point with a dot for "current" emphasis
//   - Optional baseline (e.g. 50% winrate dashed line)
//   - Color via prop — caller decides good/bad based on slope

import { useMemo } from "react";

interface Props {
  /** Series in chronological order (oldest first). Empty array
   * renders an empty placeholder. */
  data: number[];
  /** Stroke color. Tailwind class or hex. Defaults to accent. */
  color?: string;
  /** Width in pixels (used as SVG width). Height scales 1/3 of width
   * unless overridden. */
  width?: number;
  height?: number;
  /** Optional horizontal reference line drawn dashed. Useful for
   * "winrate 50%" or "KDA target 2.0". */
  baseline?: number;
  /** Accessible label for the chart. Defaults to a generic value. */
  ariaLabel?: string;
}

/** Tiny SVG line chart. ~3KB raw / ~1KB gzipped — cheaper than ANY
 * chart library and good enough for our 5-30 point trend graphs. */
export function SparkLine({
  data,
  color = "#e6cf8a",
  width = 160,
  height,
  baseline,
  ariaLabel = "Tendencia",
}: Props) {
  const h = height ?? Math.round(width / 3);
  const path = useMemo(() => buildPath(data, width, h, baseline), [
    data,
    width,
    h,
    baseline,
  ]);

  if (data.length < 2) {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        style={{ width, height: h }}
        className="flex items-center justify-center text-[10px] text-white/30"
      >
        —
      </div>
    );
  }

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${width} ${h}`}
      width={width}
      height={h}
      preserveAspectRatio="none"
    >
      {/* Baseline reference (dashed) — only when set + in the data
       *  range so it actually shows. */}
      {path.baselineY !== undefined && (
        <line
          x1={0}
          x2={width}
          y1={path.baselineY}
          y2={path.baselineY}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      )}
      {/* The trend line itself. */}
      <polyline
        points={path.points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Last-point dot for "this is now" emphasis. */}
      <circle cx={path.lastX} cy={path.lastY} r={2.5} fill={color} />
    </svg>
  );
}

interface PathData {
  points: string;
  lastX: number;
  lastY: number;
  baselineY?: number;
}

function buildPath(
  data: number[],
  width: number,
  height: number,
  baseline?: number
): PathData {
  if (data.length === 0) return { points: "", lastX: 0, lastY: 0 };
  // Auto-scale Y. Add 5% padding above/below so the trend doesn't
  // kiss the SVG edges (clipped circles look ugly).
  let min = Math.min(...data);
  let max = Math.max(...data);
  if (baseline !== undefined) {
    min = Math.min(min, baseline);
    max = Math.max(max, baseline);
  }
  const range = max - min || 1;
  const padding = range * 0.05;
  const yMin = min - padding;
  const yMax = max + padding;
  const yRange = yMax - yMin;

  const xStep = data.length > 1 ? width / (data.length - 1) : 0;
  const toY = (v: number) => height - ((v - yMin) / yRange) * height;

  const points = data
    .map((v, i) => `${(i * xStep).toFixed(1)},${toY(v).toFixed(1)}`)
    .join(" ");

  const lastIdx = data.length - 1;
  return {
    points,
    lastX: lastIdx * xStep,
    lastY: toY(data[lastIdx]),
    baselineY: baseline !== undefined ? toY(baseline) : undefined,
  };
}
