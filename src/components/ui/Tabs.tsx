// OP.GG-style underline tabs for in-modal navigation. Accessible:
// follows the WAI-ARIA tabs pattern with roving tabindex + arrow keys.

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
  /** Optional id for screen reader narration ("Tier list tabs"). */
  ariaLabel?: string;
}

export function Tabs<T extends string | number>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: Props<T>) {
  const activeIndex = tabs.findIndex((t) => t.value === active);

  // Arrow-key navigation per WAI-ARIA tabs pattern:
  //   Left/Right cycle through tabs (wraps at ends)
  //   Home/End jump to first/last
  // Activating arrow keys also fires onChange — "automatic activation"
  // model, which matches user expectation for our short tab lists.
  const handleKey = (e: React.KeyboardEvent) => {
    if (tabs.length === 0) return;
    let next = -1;
    if (e.key === "ArrowRight") next = (activeIndex + 1) % tabs.length;
    else if (e.key === "ArrowLeft")
      next = (activeIndex - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(tabs[next].value);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKey}
      className="flex gap-0 border-b border-border-subtle"
    >
      {tabs.map((t, idx) => {
        const isActive = t.value === active;
        return (
          <button
            key={String(t.value)}
            role="tab"
            aria-selected={isActive}
            // Roving tabindex: only the active tab is in the tab order.
            // Arrow keys move focus between siblings without polluting
            // the global tab sequence with N stops.
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(t.value)}
            data-tab-index={idx}
            className={`relative px-3 py-2 text-xs font-medium transition flex items-center gap-1.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded-sm ${
              isActive ? "text-accent" : "text-white/50 hover:text-white/80"
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
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
