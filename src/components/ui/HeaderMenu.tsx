import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

interface Position {
  top: number;
  left: number;
}

/**
 * Header dropdown menu.
 *
 * IMPORTANT: rendered via portal to document.body, NOT inline under the
 * trigger button. The parent <header> has `backdrop-filter: blur` which
 * creates a CSS stacking context, trapping any absolute children inside it.
 * Sibling content (hero cards, panels) paints ON TOP of the header's plane
 * regardless of z-index. The portal escapes that trap.
 */
export function HeaderMenu({ label, icon, items }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Position the menu beneath the trigger button (right-aligned).
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const MENU_WIDTH = 200;
    setPos({
      top: rect.bottom + 6, // small gap below button
      left: Math.max(8, rect.right - MENU_WIDTH), // right-aligned, but clamp to viewport
    });
  }, [open]);

  // Close on outside click + ESC
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition bg-bg-elev/60 text-white/75 ring-1 ring-border-subtle hover:ring-accent/60 hover:text-white"
      >
        {icon}
        <span className="font-medium">{label}</span>
        <ChevronDown
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed min-w-[200px] border border-border-strong rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.85)] overflow-hidden animate-[scaleIn_120ms_ease-out] origin-top-right"
            style={{
              top: pos.top,
              left: pos.left,
              zIndex: 9999, // far above any other content (modals use z-40-50)
              backgroundColor: "rgb(17, 21, 31)", // fully opaque
            }}
          >
            {items.map((it, i) => (
              <button
                key={i}
                onClick={() => {
                  it.onClick();
                  setOpen(false);
                }}
                className="w-full inline-flex items-center gap-2.5 px-3 py-2.5 text-xs text-white/85 hover:bg-accent/10 hover:text-accent transition text-left first:pt-3 last:pb-3"
              >
                <span className="text-white/55">{it.icon}</span>
                <span className="font-medium">{it.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
