import { useEffect, useMemo, useRef, useState } from "react";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import { Search, Clock, ArrowRight } from "lucide-react";

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

const RECENT_KEY = "draftboard:cmd-palette:recent";
const RECENT_MAX = 5;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function saveRecent(commandId: string): void {
  try {
    const current = loadRecent();
    const next = [commandId, ...current.filter((id) => id !== commandId)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* localStorage refused — silent */
  }
}

export function CommandPalette({ commands, onClose }: Props) {
  const [q, setQ] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  useEscape(onClose);
  const listRef = useRef<HTMLDivElement | null>(null);

  // When user types: filter by substring. When empty: show recent first
  // (in user-order), then the rest grouped by their `group` tag. Lets
  // power users one-key + Enter to their most-used action.
  const filtered = useMemo(() => {
    if (q) {
      return commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
    }
    // Empty query → recent first, then unused.
    const recentMap = new Map(commands.map((c) => [c.id, c]));
    const recentCmds = recent
      .map((id) => recentMap.get(id))
      .filter((c): c is Command => Boolean(c));
    const usedIds = new Set(recent);
    const rest = commands.filter((c) => !usedIds.has(c.id));
    return [...recentCmds, ...rest];
  }, [q, commands, recent]);

  // Group commands when no query active. Group headers render between
  // sections so the user scans by category.
  const sections = useMemo(() => {
    if (q) return null;
    const recentMap = new Map(commands.map((c) => [c.id, c]));
    const recentCmds = recent
      .map((id) => recentMap.get(id))
      .filter((c): c is Command => Boolean(c));
    const usedIds = new Set(recent);
    const rest = commands.filter((c) => !usedIds.has(c.id));
    const byGroup = new Map<string, Command[]>();
    for (const c of rest) {
      const g = c.group ?? "Acciones";
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(c);
    }
    return { recent: recentCmds, groups: Array.from(byGroup.entries()) };
  }, [q, commands, recent]);

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
        saveRecent(cmd.id);
        setRecent(loadRecent());
        cmd.action();
        onClose();
      }
    }
  };

  // Helper to render an individual command row. Used by both flat and
  // grouped renders so styling stays consistent.
  const renderCmd = (c: Command, idx: number) => (
    <button
      key={c.id}
      id={`cmd-${c.id}`}
      role="option"
      aria-selected={idx === activeIndex}
      data-cmd-idx={idx}
      onClick={() => {
        saveRecent(c.id);
        setRecent(loadRecent());
        c.action();
        onClose();
      }}
      onMouseEnter={() => setActiveIndex(idx)}
      className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition ${
        idx === activeIndex
          ? "bg-accent/10 text-white ring-1 ring-inset ring-accent/40"
          : "hover:bg-bg-card text-white/85"
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <ArrowRight
          className={`w-3 h-3 shrink-0 ${idx === activeIndex ? "text-accent" : "text-white/30"}`}
        />
        <span className="truncate">{c.label}</span>
      </div>
      {c.shortcut && (
        <kbd className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 ring-border-subtle bg-bg-card/40 text-white/55 font-mono">
          {c.shortcut}
        </kbd>
      )}
    </button>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cmd-palette-title"
      className="fixed inset-0 z-[60] bg-black/70 flex items-start justify-center pt-32"
      onClick={onClose}
    >
      <div
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg w-[560px] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 id="cmd-palette-title" className="sr-only">
          Paleta de comandos
        </h2>
        <div className="relative border-b border-border-subtle">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-accent/70" />
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
            className="w-full bg-transparent pl-10 pr-4 py-3.5 text-white outline-none placeholder:text-white/35"
          />
          <kbd className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 ring-border-subtle bg-bg-card/40 text-white/45 font-mono">
            Esc
          </kbd>
        </div>
        <div
          id="cmd-palette-list"
          ref={listRef}
          role="listbox"
          aria-label="Comandos disponibles"
          className="max-h-[420px] overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-white/40">Sin resultados para "{q}"</p>
              <p className="text-[11px] text-white/30 mt-1">
                Prueba con menos caracteres o usa palabras clave.
              </p>
            </div>
          ) : sections ? (
            <>
              {sections.recent.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] uppercase tracking-widest text-accent/70 font-semibold bg-bg-elev/30 border-b border-border-subtle/50">
                    <Clock className="w-3 h-3" />
                    Recientes
                  </div>
                  {sections.recent.map((c, idx) => renderCmd(c, idx))}
                </div>
              )}
              {sections.groups.map(([group, cmds]) => {
                const offset = sections.recent.length +
                  sections.groups
                    .slice(0, sections.groups.findIndex(([g]) => g === group))
                    .reduce((acc, [, list]) => acc + list.length, 0);
                return (
                  <div key={group}>
                    <div className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-white/40 font-semibold bg-bg-elev/30 border-y border-border-subtle/50">
                      {group}
                    </div>
                    {cmds.map((c, i) => renderCmd(c, offset + i))}
                  </div>
                );
              })}
            </>
          ) : (
            filtered.map((c, idx) => renderCmd(c, idx))
          )}
        </div>
        <div className="px-4 py-2 border-t border-border-subtle bg-bg-elev/40 flex items-center justify-between text-[10px] text-white/45">
          <span>
            <kbd className="px-1 py-0.5 rounded ring-1 ring-border-subtle bg-bg-card/40 text-white/55 font-mono text-[9px] mr-1">↑↓</kbd>
            navegar
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded ring-1 ring-border-subtle bg-bg-card/40 text-white/55 font-mono text-[9px] mr-1">↵</kbd>
            ejecutar
          </span>
          <span>{filtered.length} comandos</span>
        </div>
      </div>
    </div>
  );
}
