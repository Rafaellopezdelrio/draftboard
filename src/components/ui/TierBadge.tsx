interface Props {
  tier: "S" | "A" | "B" | "C" | "D";
  size?: "sm" | "md";
}

const COLORS: Record<Props["tier"], { bg: string; ring: string; text: string }> = {
  S: { bg: "bg-tier-s/20", ring: "ring-tier-s/60", text: "text-tier-s" },
  A: { bg: "bg-tier-a/20", ring: "ring-tier-a/60", text: "text-tier-a" },
  B: { bg: "bg-tier-b/15", ring: "ring-tier-b/40", text: "text-tier-b" },
  C: { bg: "bg-tier-c/15", ring: "ring-tier-c/40", text: "text-tier-c" },
  D: { bg: "bg-tier-d/15", ring: "ring-tier-d/30", text: "text-tier-d" },
};

export function TierBadge({ tier, size = "md" }: Props) {
  const c = COLORS[tier];
  const sz = size === "sm" ? "w-5 h-5 text-[10px]" : "w-7 h-7 text-xs";
  return (
    <span
      className={`inline-flex items-center justify-center rounded font-bold ring-1 ${sz} ${c.bg} ${c.ring} ${c.text}`}
      title={`Tier ${tier}`}
    >
      {tier}
    </span>
  );
}
