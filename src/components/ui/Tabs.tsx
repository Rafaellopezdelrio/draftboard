// OP.GG-style underline tabs for in-modal navigation.

interface Tab<T extends string | number> {
  value: T;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface Props<T extends string | number> {
  tabs: Tab<T>[];
  active: T;
  onChange: (v: T) => void;
}

export function Tabs<T extends string | number>({ tabs, active, onChange }: Props<T>) {
  return (
    <div className="flex gap-0 border-b border-border-subtle">
      {tabs.map((t) => {
        const isActive = t.value === active;
        return (
          <button
            key={String(t.value)}
            onClick={() => onChange(t.value)}
            className={`relative px-3 py-2 text-xs font-medium transition flex items-center gap-1.5 ${
              isActive
                ? "text-accent"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span
                className={`text-[10px] tabular-nums px-1 py-0 rounded ${
                  isActive ? "bg-accent/20" : "bg-white/5"
                }`}
              >
                {t.count}
              </span>
            )}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent" />
            )}
          </button>
        );
      })}
    </div>
  );
}
