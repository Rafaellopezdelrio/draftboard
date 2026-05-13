interface PanelProps {
  children: React.ReactNode;
  className?: string;
  padding?: "sm" | "md" | "none";
}

export function Panel({ children, className = "", padding = "md" }: PanelProps) {
  const p = padding === "sm" ? "p-3" : padding === "none" ? "" : "p-4";
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
