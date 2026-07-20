import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}

export function CountUp({
  value,
  duration = 600,
  decimals = 0,
  suffix = "",
  className,
}: Props) {
  const [current, setCurrent] = useState(0);
  const startRef = useRef(0);

  useEffect(() => {
    const startTime = performance.now();
    const startValue = startRef.current;
    const delta = value - startValue;
    let raf = 0;
    const tick = (t: number) => {
      const elapsed = t - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const v = startValue + delta * eased;
      setCurrent(v);
      // Track what's on screen EVERY frame — if `value` changes mid-animation,
      // the next run must start from the displayed number, not from the last
      // COMPLETED animation's end (which made the count visibly jump backwards
      // before re-counting).
      startRef.current = v;
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span className={className}>
      {current.toFixed(decimals)}
      {suffix}
    </span>
  );
}
