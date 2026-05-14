import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export interface MenuItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface Props {
  label: string;
  icon: React.ReactNode;
  items: MenuItem[];
}

export function HeaderMenu({ label, icon, items }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition bg-bg-elev/60 text-white/75 ring-1 ring-border-subtle hover:ring-accent/60 hover:text-white"
      >
        {icon}
        <span className="font-medium">{label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 z-[60] min-w-[200px] bg-bg-card border border-border-strong rounded-lg shadow-2xl overflow-hidden animate-[scaleIn_120ms_ease-out] origin-top-right"
          style={{ backdropFilter: "blur(12px)" }}
        >
          <div className="absolute inset-0 bg-bg-card/95 -z-10" />
          {items.map((it, i) => (
            <button
              key={i}
              onClick={() => {
                it.onClick();
                setOpen(false);
              }}
              className="relative w-full inline-flex items-center gap-2.5 px-3 py-2.5 text-xs text-white/85 hover:bg-accent/10 hover:text-accent transition text-left first:pt-3 last:pb-3"
            >
              <span className="text-white/55">{it.icon}</span>
              <span className="font-medium">{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
