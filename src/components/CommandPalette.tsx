import { useEffect, useRef, useState } from "react";
import { useEscape } from "../hooks/useKeyboardShortcuts";

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
  group?: string;
}

interface Props {
  commands: Command[];
  onClose: () => void;
}

export function CommandPalette({ commands, onClose }: Props) {
  const [q, setQ] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  useEscape(onClose);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(q.toLowerCase())
  );

  // Reset active index when the filtered list changes (query typed) —
  // keeps the highlight at the first match instead of overflowing.
  useEffect(() => {
    setActiveIndex(0);
  }, [q]);

  // Keep the active item scrolled into view during arrow-key navigation.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-cmd-idx="${activeIndex}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) {
        cmd.action();
        onClose();
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cmd-palette-title"
      className="fixed inset-0 z-[60] bg-black/70 flex items-start justify-center pt-32"
      onClick={onClose}
    >
      <div
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg w-[520px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 id="cmd-palette-title" className="sr-only">
          Paleta de comandos
        </h2>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar acción... (Esc para cerrar)"
          aria-label="Buscar acción"
          aria-controls="cmd-palette-list"
          aria-activedescendant={
            filtered[activeIndex] ? `cmd-${filtered[activeIndex].id}` : undefined
          }
          className="w-full bg-transparent border-b border-border-subtle px-4 py-3 text-white outline-none"
        />
        <div
          id="cmd-palette-list"
          ref={listRef}
          role="listbox"
          aria-label="Comandos disponibles"
          className="max-h-80 overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-6">
              Sin resultados
            </p>
          ) : (
            filtered.map((c, idx) => (
              <button
                key={c.id}
                id={`cmd-${c.id}`}
                role="option"
                aria-selected={idx === activeIndex}
                data-cmd-idx={idx}
                onClick={() => {
                  c.action();
                  onClose();
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`w-full flex items-center justify-between px-4 py-2 text-left text-sm transition ${
                  idx === activeIndex
                    ? "bg-bg-card text-white"
                    : "hover:bg-bg-card text-white/90"
                }`}
              >
                <span>{c.label}</span>
                {c.shortcut && (
                  <span className="text-xs text-white/40">{c.shortcut}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
