// Compact colored chip for a single stat value. Used in the build
// stats roll-up row so the user can compare archetypes (AD/AP/HP/etc)
// without doing math. Colors mirror good/bad/info/meh from the global
// Tailwind palette so the visual language stays consistent.

interface Props {
  label: string;
  value: number;
  color: "good" | "bad" | "meh" | "accent" | "info";
}

export function StatChip({ label, value, color }: Props) {
  const palette = {
    good: "bg-good/15 text-good ring-good/40",
    bad: "bg-bad/15 text-bad ring-bad/40",
    meh: "bg-meh/15 text-meh ring-meh/40",
    accent: "bg-accent/15 text-accent ring-accent/40",
    info: "bg-blue-500/15 text-blue-300 ring-blue-500/40",
  }[color];
  return (
    <span
      className={`inline-flex items-baseline gap-1 px-1.5 py-0.5 rounded ring-1 tabular-nums font-medium ${palette}`}
    >
      <span className="opacity-70 text-[9px] uppercase">{label}</span>
      <span>{value}</span>
    </span>
  );
}
