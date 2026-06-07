import { useState } from "react";
import { ChevronRight } from "lucide-react";

interface PanelProps {
  children: React.ReactNode;
  className?: string;
  padding?: "sm" | "md" | "none";
  /**
   * Collapsible mode. When `collapsible` + `title` are set, the Panel renders
   * its OWN clickable header (icon + title + summary + chevron) and folds
   * `children` away — used by the right-rail context panels so the rail is a
   * scannable accordion instead of a multi-screen scroll. In this mode the
   * panel should NOT also render a <PanelHeader> (that's what the chrome here
   * replaces). Non-collapsible Panels render exactly as before.
   */
  collapsible?: boolean;
  title?: string;
  icon?: React.ReactNode;
  /** Compact preview shown on the right of the header while collapsed
   * (e.g. "4/4", "Lee Sin") so the user knows what's inside without opening. */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  /** localStorage key — remembers this panel's open/closed state across
   * sessions. Omit to keep it ephemeral (resets to defaultOpen on reload). */
  storageKey?: string;
}

export function Panel({
  children,
  className = "",
  padding = "md",
  collapsible = false,
  title,
  icon,
  summary,
  defaultOpen = true,
  storageKey,
}: PanelProps) {
  const p = padding === "sm" ? "p-3" : padding === "none" ? "" : "p-4";

  // Hooks must run unconditionally — initialise from localStorage when a
  // storageKey is given so the choice survives reloads.
  const [open, setOpen] = useState<boolean>(() => {
    if (!collapsible) return true;
    if (storageKey && typeof localStorage !== "undefined") {
      const v = localStorage.getItem(`panel-open:${storageKey}`);
      if (v === "1") return true;
      if (v === "0") return false;
    }
    return defaultOpen;
  });

  if (collapsible && title) {
    const toggle = () => {
      setOpen((prev) => {
        const next = !prev;
        if (storageKey && typeof localStorage !== "undefined") {
          localStorage.setItem(`panel-open:${storageKey}`, next ? "1" : "0");
        }
        return next;
      });
    };
    // Header padding matches the body padding so the open panel reads as one
    // unit; when collapsed only the header is visible (a thin scannable row).
    const headPad = padding === "sm" ? "px-3 py-2.5" : padding === "none" ? "px-2 py-2" : "px-4 py-3";
    const bodyPad = padding === "sm" ? "px-3 pb-3" : padding === "none" ? "" : "px-4 pb-4";
    return (
      <div className={`bg-bg-elev/50 ring-1 ring-border-subtle rounded-lg ${className}`}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={`w-full flex items-center gap-1.5 ${headPad} text-left hover:bg-bg-hover/40 rounded-lg transition-colors`}
        >
          {icon && <span className="text-white/40">{icon}</span>}
          <h3 className="text-[11px] uppercase tracking-widest font-semibold text-white/50">
            {title}
          </h3>
          {!open && summary != null && (
            <span className="text-[10px] text-white/40 ml-1 truncate">{summary}</span>
          )}
          <ChevronRight
            className={`w-3.5 h-3.5 ml-auto text-white/30 transition-transform ${
              open ? "rotate-90 text-accent" : ""
            }`}
          />
        </button>
        {open && <div className={bodyPad}>{children}</div>}
      </div>
    );
  }

  return (
    <div
      className={`bg-bg-elev/50 ring-1 ring-border-subtle rounded-lg ${p} ${className}`}
    >
      {children}
    </div>
  );
}

interface PanelHeaderProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PanelHeader({ icon, title, subtitle, action }: PanelHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-white/40">{icon}</span>}
        <h3 className="text-[11px] uppercase tracking-widest font-semibold text-white/50">
          {title}
        </h3>
        {subtitle && (
          <span className="text-[10px] text-white/30 ml-1">{subtitle}</span>
        )}
      </div>
      {action}
    </div>
  );
}

interface DividerProps {
  label?: string;
}

export function Divider({ label }: DividerProps) {
  if (!label) return <div className="h-px bg-border-subtle my-2" />;
  return (
    <div className="flex items-center gap-2 my-2">
      <div className="h-px flex-1 bg-border-subtle" />
      <span className="text-[10px] uppercase tracking-widest text-white/30">
        {label}
      </span>
      <div className="h-px flex-1 bg-border-subtle" />
    </div>
  );
}
