// Sortable champion tier list. Reads from meta_aggregate (pro/soloq/blend)
// OR live dpm.lol bracket data when the user selects "dpm" as their source.

import { Fragment, useMemo, useRef, useState } from "react";
import type { ChampionDb, MetaTier, Role } from "../types/champion";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import { useFocusTrap } from "../hooks/useFocusTrap";

const TIERLIST_TITLE_ID = "tierlist-view-title";
import { displayPatch } from "../data/patchDisplay";
import { Tabs } from "./ui/Tabs";
import { TierBadge } from "./ui/TierBadge";
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { usePrefsStore } from "../state/prefsStore";
import {
  DPM_TIER_LABELS,
  DPM_TIER_ORDER,
  DPM_PLATFORM_LABELS,
  type DpmTier,
  type DpmPlatform,
  type DpmTimeframe,
} from "../services/dpmTierlist";
import { loadChampionDb } from "../services/championDb";

interface Props {
  db: ChampionDb;
  onClose: () => void;
  onSelectChampion?: (championKey: string) => void;
  /**
   * Called after the dpm.lol rank selector triggers a refresh. The parent
   * should swap its `db` state with the new one so the tier list re-renders
   * with the new bracket's data.
   */
  onDbUpdate?: (db: ChampionDb) => void;
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

// S+ is dpm.lol-exclusive (tierScore >= 60). Other sources max out at S.
const TIER_RANK: Record<MetaTier["tier"], number> = {
  "S+": -1,
  S: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
};

export function TierListView({ db, onClose, onSelectChampion, onDbUpdate }: Props) {
  useEscape(onClose);
  const [role, setRole] = useState<Role | "ALL">("TOP");
  // Single-role view sorts by tier by default (mobalytics-style sections).
  // Multi-role view sorts by winrate.
  const [sortKey, setSortKey] = useState<SortKey>("tier");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const prefs = usePrefsStore((s) => s.prefs);
  const setPref = usePrefsStore((s) => s.set);
  const isDpm = prefs.metaSource === "dpm";

  // Any source/filter change (1) persists the new pref, (2) force-reloads the
  // championDb, and (3) hands the new db back up to the parent. Force is
  // required because the cached db carries the PREVIOUS source's data — we
  // share one cache slot across sources so without bypass the user would see
  // stale entries until STALE_AFTER_MS (1h) expired.
  //
  // Generalised to all sources (not just dpm) so switching dpm → opgg etc.
  // also triggers a refetch. The previous version only refreshed dpm
  // branches, which left users stuck on their last dpm bracket after
  // switching back to op.gg.
  type SourceVal = typeof prefs.metaSource;
  const applyFilter = async (
    patch: Partial<{ source: SourceVal; tier: DpmTier; platform: DpmPlatform; timeframe: DpmTimeframe }>
  ) => {
    setRefreshing(true);
    try {
      if (patch.source) await setPref("metaSource", patch.source);
      if (patch.tier) await setPref("dpmTier", patch.tier);
      if (patch.platform) await setPref("dpmPlatform", patch.platform);
      if (patch.timeframe) await setPref("dpmTimeframe", patch.timeframe);
      const fresh = await loadChampionDb(true);
      onDbUpdate?.(fresh);
    } finally {
      setRefreshing(false);
    }
  };
  // Kept as an alias for the dpm-only call sites (tier/platform/timeframe).
  const applyDpmFilter = applyFilter;
  const showSections = role !== "ALL" && sortKey === "tier";

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
      // Inside same tier, always sort by winRate desc (cleanest visual)
      if (sortKey === "tier") {
        const tCmp = TIER_RANK[a.tier] - TIER_RANK[b.tier];
        if (tCmp !== 0) return sortDir === "asc" ? tCmp : -tCmp;
        return b.winRate - a.winRate; // intra-tier always WR desc
      }
      let av: number | string;
      let bv: number | string;
      switch (sortKey) {
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
        default:
          av = 0;
          bv = 0;
      }
      const cmp = typeof av === "number" ? av - (bv as number) : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [db, role, search, sortKey, sortDir]);

  // Count per tier for section headers (mobalytics shows "S TIER · 12 champs")
  const tierCounts = useMemo(() => {
    const counts: Record<MetaTier["tier"], number> = { "S+": 0, S: 0, A: 0, B: 0, C: 0, D: 0 };
    for (const r of rows) counts[r.tier]++;
    return counts;
  }, [rows]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const isEmpty = db.meta.length === 0;

  // Diagnostic counter: total meta entries currently in db + top champion
  // for the active role. This refreshes whenever the parent swaps `db`
  // (i.e. after every applyDpmFilter). If you change rank/source and these
  // numbers don't move, the fetch isn't reaching here.
  const diagSummary = useMemo(() => {
    const inRole = role === "ALL" ? db.meta : db.meta.filter((m) => m.role === role);
    const top = inRole
      .filter((m) => m.tier === "S+" || m.tier === "S")
      .slice(0, 3)
      .map((m) => db.champions[m.championKey]?.name ?? m.championKey)
      .join(", ");
    return { total: db.meta.length, inRole: inRole.length, top };
  }, [db, role]);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, true);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={TIERLIST_TITLE_ID}
      className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg w-[820px] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-2 border-b border-border-subtle">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 id={TIERLIST_TITLE_ID} className="text-xl font-bold gold-text">
                Tier List
                {isDpm && (
                  <span className="ml-2 text-[10px] uppercase tracking-widest text-white/40 align-middle">
                    dpm.lol · {DPM_TIER_LABELS[prefs.dpmTier]} · {DPM_PLATFORM_LABELS[prefs.dpmPlatform]}
                  </span>
                )}
              </h2>
              {/* Live debug counter — should change on every filter switch */}
              <p className="text-[10px] text-white/45 mt-0.5">
                {diagSummary.total} entries · {diagSummary.inRole} in {role}
                {diagSummary.top && ` · top S: ${diagSummary.top}`}
              </p>
            </div>
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
          {/* Source + bracket selector — lets the user pick their own rank
              instead of always seeing the default plat+ aggregate. */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <label className="text-[10px] uppercase tracking-widest text-white/45">Fuente:</label>
            <select
              value={prefs.metaSource}
              disabled={refreshing}
              onChange={(e) => applyFilter({ source: e.target.value as SourceVal })}
              className="bg-bg-elev/60 text-xs rounded ring-1 ring-border-subtle px-2 py-1 text-white outline-none focus:ring-accent"
            >
              {/* Only opgg + dpm are exposed in the tier list selector for
                  testers. proplay/soloq/blend still exist in the codebase and
                  in Settings (so power users can sync + use them) but they
                  default to off and would just confuse newcomers if shown as
                  greyed options. We DO show them if the user has already
                  synced data — no point hiding a source that has real
                  entries to offer. */}
              <option value="opgg">
                op.gg (plat+ global)
                {db.metaSourceCounts && ` · ${db.metaSourceCounts.opgg}`}
              </option>
              <option value="dpm">
                dpm.lol (por rango)
                {db.metaSourceCounts && db.metaSourceCounts.dpm > 0 && ` · ${db.metaSourceCounts.dpm}`}
              </option>
              {db.metaSourceCounts && db.metaSourceCounts.proplay > 0 && (
                <option value="proplay">
                  Pro play · {db.metaSourceCounts.proplay}
                </option>
              )}
              {db.metaSourceCounts && db.metaSourceCounts.soloq > 0 && (
                <option value="soloq">
                  SoloQ Master+ · {db.metaSourceCounts.soloq}
                </option>
              )}
              {db.metaSourceCounts &&
                (db.metaSourceCounts.proplay > 0 || db.metaSourceCounts.soloq > 0) && (
                  <option value="blend">Pro + SoloQ blend</option>
                )}
            </select>
            {db.metaSourceUsed && db.metaSourceRequested && db.metaSourceUsed !== db.metaSourceRequested && (
              <span
                className="text-[10px] uppercase tracking-widest text-yellow-300/80"
                title={`Pediste "${db.metaSourceRequested}" pero no hay datos; mostrando "${db.metaSourceUsed}" como fallback.`}
              >
                ⚠ usando {db.metaSourceUsed}
              </span>
            )}
            {isDpm && (
              <>
                <select
                  value={prefs.dpmTier}
                  disabled={refreshing}
                  onChange={(e) => applyDpmFilter({ tier: e.target.value as DpmTier })}
                  className="bg-bg-elev/60 text-xs rounded ring-1 ring-border-subtle px-2 py-1 text-white outline-none focus:ring-accent"
                  title="Rango (Iron → Challenger)"
                >
                  {DPM_TIER_ORDER.map((t) => (
                    <option key={t} value={t}>{DPM_TIER_LABELS[t]}</option>
                  ))}
                </select>
                <select
                  value={prefs.dpmPlatform}
                  disabled={refreshing}
                  onChange={(e) => applyDpmFilter({ platform: e.target.value as DpmPlatform })}
                  className="bg-bg-elev/60 text-xs rounded ring-1 ring-border-subtle px-2 py-1 text-white outline-none focus:ring-accent"
                  title="Región"
                >
                  {(Object.keys(DPM_PLATFORM_LABELS) as DpmPlatform[]).map((p) => (
                    <option key={p} value={p}>{DPM_PLATFORM_LABELS[p]}</option>
                  ))}
                </select>
                <select
                  value={prefs.dpmTimeframe}
                  disabled={refreshing}
                  onChange={(e) => applyDpmFilter({ timeframe: e.target.value as DpmTimeframe })}
                  className="bg-bg-elev/60 text-xs rounded ring-1 ring-border-subtle px-2 py-1 text-white outline-none focus:ring-accent"
                  title="Ventana de tiempo"
                >
                  <option value="7days">7 días</option>
                  <option value="30days">30 días</option>
                </select>
                {refreshing && (
                  <span className="text-[10px] uppercase tracking-widest text-white/45">
                    Actualizando…
                  </span>
                )}
              </>
            )}
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
              <thead className="sticky top-0 bg-bg-elev z-10">
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
                  // Tier section header: insert before first row of each tier
                  // when sorted by tier in single-role view (mobalytics style).
                  const prevTier = i > 0 ? rows[i - 1].tier : null;
                  const showTierHeader = showSections && m.tier !== prevTier;
                  return (
                    <Fragment key={`${m.championKey}-${m.role}`}>
                      {showTierHeader && (
                        <tr className="bg-bg-elev/40">
                          <td colSpan={7} className="px-4 py-2.5 border-y border-border-subtle/60">
                            <div className="flex items-center gap-3">
                              <TierBadge tier={m.tier} size="md" />
                              <span className="text-[11px] uppercase tracking-widest font-bold text-white/70">
                                {m.tier} Tier
                              </span>
                              <span className="text-[10px] uppercase tracking-widest text-white/35">
                                · {tierCounts[m.tier]} {tierCounts[m.tier] === 1 ? "campeón" : "campeones"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                      <tr
                        className="border-b border-border-subtle/40 hover:bg-bg-card/40 transition cursor-pointer"
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
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {!isEmpty && (
          <div className="px-4 py-2 border-t border-border-subtle text-[10px] uppercase tracking-widest text-white/40 flex items-center justify-between">
            <span>{rows.length} campeones · patch {displayPatch(db.patch)}</span>
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
