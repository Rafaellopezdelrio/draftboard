import { useMemo, useState } from "react";
import type { Champion, Role } from "../types/champion";
import { useEscape } from "../hooks/useKeyboardShortcuts";

interface Props {
  champions: Champion[];
  excludeKeys?: string[];
  onPick: (champ: Champion) => void;
  onClose: () => void;
}

const ROLES: Array<{ value: Role | "ALL"; label: string }> = [
  { value: "ALL", label: "Todos" },
  { value: "TOP", label: "Top" },
  { value: "JUNGLE", label: "Jungla" },
  { value: "MIDDLE", label: "Mid" },
  { value: "BOTTOM", label: "ADC" },
  { value: "UTILITY", label: "Sup" },
];

export function ChampionPicker({
  champions,
  excludeKeys = [],
  onPick,
  onClose,
}: Props) {
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL");

  useEscape(onClose);

  const exclude = useMemo(() => new Set(excludeKeys), [excludeKeys]);
  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return champions
      .filter((c) => !exclude.has(c.key))
      .filter((c) => roleFilter === "ALL" || c.roles.includes(roleFilter))
      .filter((c) => c.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [q, champions, exclude, roleFilter]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg p-4 w-[680px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-2 mb-3">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar campeón..."
            className="flex-1 bg-bg px-3 py-2 rounded outline-none border border-border-subtle focus:border-accent text-white"
          />
        </div>
        <div className="flex gap-1 mb-3">
          {ROLES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRoleFilter(r.value)}
              className={`px-3 py-1.5 text-xs rounded border ${
                roleFilter === r.value
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border-subtle text-white/70 hover:border-white/30"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-8 gap-2 overflow-y-auto pr-1">
          {filtered.map((c) => (
            <button
              key={c.key}
              onClick={() => onPick(c)}
              className="group flex flex-col items-center gap-1 p-1 rounded hover:bg-bg-card transition"
              title={c.name}
            >
              <img
                src={c.iconUrl}
                alt={c.name}
                loading="lazy"
                className="w-12 h-12 rounded border border-border-subtle group-hover:border-accent"
              />
              <span className="text-[10px] text-white/70 truncate w-full text-center">
                {c.name}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-8 text-center text-white/40 py-8">
              Sin resultados
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
