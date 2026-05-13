// Sortable champion tier list. Reads from meta_aggregate (pro/soloq/blend).

import { useMemo, useState } from "react";
import type { ChampionDb, MetaTier, Role } from "../types/champion";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import { Tabs } from "./ui/Tabs";
import { TierBadge } from "./ui/TierBadge";
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

interface Props {
  db: ChampionDb;
  onClose: () => void;
  onSelectChampion?: (championKey: string) => void;
}

type SortKey = "tier" | "winRate" | "pickRate" | "banRate" | "name";
type SortDir = "asc" | "desc";

const ROLE_TABS: Array<{ value: Role | "ALL"; label: string }> = [
  { value: "ALL", label: "Todos" },
  { value: "TOP", label: "Top" },
  { value: "JUNGLE", label: "Jungla" },
  { value: "MIDDLE", label: "Mid" },
  { value: "BOTTOM", label: "ADC" },
  { value: "UTILITY", label: "Sup" },
];

const TIER_RANK: Record<MetaTier["tier"], number> = {
  S: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
};

export function TierListView({ db, onClose, onSelectChampion }: Props) {
  useEscape(onClose);
  const [role, setRole] = useState<Role | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("winRate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const filtered = db.meta.filter((m) => {
      if (role !== "ALL" && m.role !== role) return false;
      if (search) {
        const champ = db.champions[m.championKey];
        if (!champ) return false;
        return champ.name.toLowerCase().includes(search.toLowerCase());
      }
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (sortKey) {
        case "tier":
          av = TIER_RANK[a.tier];
          bv = TIER_RANK[b.tier];
          break;
        case "winRate":
          av = a.winRate;
          bv = b.winRate;
          break;
        case "pickRate":
          av = a.pickRate;
          bv = b.pickRate;
          break;
        case "banRate":
          av = a.banRate;
          bv = b.banRate;
          break;
        case "name":
          av = db.champions[a.championKey]?.name ?? "";
          bv = db.champions[b.championKey]?.name ?? "";
          break;
      }
      const cmp = typeof av === "number" ? av - (bv as number) : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [db, role, search, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const isEmpty = db.meta.length === 0;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg w-[820px] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-2 border-b border-border-subtle">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold gold-text">Tier List</h2>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar campeón..."
                className="bg-bg-elev/60 pl-8 pr-3 py-1.5 text-sm rounded-md ring-1 ring-border-subtle focus:ring-accent text-white outline-none w-52 transition"
              />
            </div>
          </div>
          <Tabs
            tabs={ROLE_TABS.map((r) => ({ value: r.value, label: r.label }))}
            active={role}
            onChange={setRole}
          />
        </div>

        {/* Empty state */}
        {isEmpty && (
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <div>
              <p className="text-white/70 text-sm mb-2">
                Sin datos del meta aún
              </p>
              <p className="text-xs text-white/50">
                Ve a <strong>⚙ Settings</strong> y pulsa{" "}
                <strong>"🏆 Sync meta PRO"</strong> para descargar agregados de
                LCK/LEC/LCS/LPL.
              </p>
            </div>
          </div>
        )}

        {/* Table */}
        {!isEmpty && (
          <div className="overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-bg-elev/95 backdrop-blur z-10">
                <tr className="text-[10px] uppercase tracking-widest text-white/45">
                  <th className="text-left px-4 py-2 font-semibold w-10">#</th>
                  <Th label="Campeón" sortKey="name" current={sortKey} dir={sortDir} onClick={toggleSort} align="left" />
                  <Th label="Rol" current={null} sortKey={null} align="left" />
                  <Th label="Tier" sortKey="tier" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <Th label="Winrate" sortKey="winRate" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <Th label="Pickrate" sortKey="pickRate" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <Th label="Banrate" sortKey="banRate" current={sortKey} dir={sortDir} onClick={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {rows.map((m, i) => {
                  const c = db.champions[m.championKey];
                  if (!c) return null;
                  const wrColor =
                    m.winRate >= 0.535
                      ? "text-good"
                      : m.winRate >= 0.49
                        ? "text-white/85"
                        : "text-bad";
                  return (
                    <tr
                      key={`${m.championKey}-${m.role}`}
                      className="border-b border-border-subtle/50 hover:bg-bg-card/40 transition cursor-pointer"
                      onClick={() => onSelectChampion?.(m.championKey)}
                    >
                      <td className="px-4 py-2 text-white/40 tabular-nums text-xs">
                        {i + 1}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <img
                            src={c.iconUrl}
                            alt={c.name}
                            className="w-8 h-8 rounded ring-1 ring-border-subtle"
                            loading="lazy"
                          />
                          <span className="text-white font-medium">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-[11px] uppercase text-white/55 tracking-wide">
                        {m.role}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <TierBadge tier={m.tier} />
                      </td>
                      <td className={`px-2 py-2 text-center tabular-nums font-medium ${wrColor}`}>
                        {(m.winRate * 100).toFixed(1)}%
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums text-white/70">
                        {(m.pickRate * 100).toFixed(1)}%
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums text-white/70">
                        {(m.banRate * 100).toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {!isEmpty && (
          <div className="px-4 py-2 border-t border-border-subtle text-[10px] uppercase tracking-widest text-white/40 flex items-center justify-between">
            <span>{rows.length} campeones · patch {db.patch}</span>
            <span>Ordenar: click en cabecera</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Th({
  label,
  sortKey,
  current,
  dir,
  onClick,
  align = "center",
}: {
  label: string;
  sortKey: SortKey | null;
  current: SortKey | null;
  dir?: SortDir;
  onClick?: (k: SortKey) => void;
  align?: "left" | "center";
}) {
  const isActive = sortKey && sortKey === current;
  return (
    <th
      className={`text-${align} px-2 py-2 font-semibold ${onClick && sortKey ? "cursor-pointer hover:text-accent select-none" : ""}`}
      onClick={() => sortKey && onClick?.(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 ${isActive ? "text-accent" : ""}`}>
        {label}
        {sortKey && (
          isActive ? (
            dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
          ) : (
            <ArrowUpDown className="w-3 h-3 opacity-30" />
          )
        )}
      </span>
    </th>
  );
}
