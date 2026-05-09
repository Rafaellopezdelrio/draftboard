import { useMemo, useState } from "react";
import type { Champion } from "../types/champion";

interface Props {
  champions: Champion[];
  excludeKeys?: string[];
  onPick: (champ: Champion) => void;
  onClose: () => void;
}

export function ChampionPicker({
  champions,
  excludeKeys = [],
  onPick,
  onClose,
}: Props) {
  const [q, setQ] = useState("");
  const exclude = useMemo(() => new Set(excludeKeys), [excludeKeys]);
  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return champions
      .filter((c) => !exclude.has(c.key))
      .filter((c) => c.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [q, champions, exclude]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-bg-elev border border-border-subtle rounded-lg p-4 w-[640px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar campeón..."
          className="bg-bg px-3 py-2 rounded outline-none border border-border-subtle focus:border-accent text-white"
        />
        <div className="grid grid-cols-8 gap-2 overflow-y-auto mt-3 pr-1">
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
