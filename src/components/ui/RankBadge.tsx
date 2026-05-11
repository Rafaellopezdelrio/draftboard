interface Props {
  tier?: string;
  division?: string;
  lp?: number;
  size?: "sm" | "md";
}

const RANK_COLORS: Record<string, { ring: string; text: string; bg: string }> = {
  IRON: { ring: "ring-stone-500/60", text: "text-stone-300", bg: "bg-stone-700/30" },
  BRONZE: { ring: "ring-amber-700/60", text: "text-amber-300", bg: "bg-amber-900/30" },
  SILVER: { ring: "ring-slate-300/60", text: "text-slate-200", bg: "bg-slate-600/30" },
  GOLD: { ring: "ring-yellow-400/60", text: "text-yellow-300", bg: "bg-yellow-700/30" },
  PLATINUM: { ring: "ring-teal-300/60", text: "text-teal-200", bg: "bg-teal-700/30" },
  EMERALD: { ring: "ring-emerald-400/60", text: "text-emerald-300", bg: "bg-emerald-800/30" },
  DIAMOND: { ring: "ring-cyan-300/70", text: "text-cyan-200", bg: "bg-cyan-800/30" },
  MASTER: { ring: "ring-purple-400/70", text: "text-purple-300", bg: "bg-purple-800/30" },
  GRANDMASTER: { ring: "ring-rose-400/70", text: "text-rose-300", bg: "bg-rose-900/30" },
  CHALLENGER: { ring: "ring-amber-300", text: "gold-text", bg: "bg-amber-900/40" },
};

export function RankBadge({ tier, division, lp, size = "md" }: Props) {
  if (!tier) return <span className="text-xs text-white/40">Sin rango</span>;
  const c = RANK_COLORS[tier.toUpperCase()] ?? RANK_COLORS.IRON;
  const sz = size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded ring-1 font-medium ${sz} ${c.bg} ${c.ring} ${c.text}`}
      title={`${tier} ${division ?? ""} ${lp ?? 0}LP`}
    >
      <span>{tier.slice(0, 1)}</span>
      {division && <span className="opacity-70">{division}</span>}
      {lp !== undefined && <span className="opacity-80">·{lp}</span>}
    </span>
  );
}
