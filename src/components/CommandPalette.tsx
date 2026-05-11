import { useState } from "react";
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
  useEscape(onClose);

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 flex items-start justify-center pt-32"
      onClick={onClose}
    >
      <div
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg w-[520px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar acción... (Esc para cerrar)"
          className="w-full bg-transparent border-b border-border-subtle px-4 py-3 text-white outline-none"
        />
        <div className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-6">
              Sin resultados
            </p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  c.action();
                  onClose();
                }}
                className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-bg-card text-sm"
              >
                <span className="text-white">{c.label}</span>
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
