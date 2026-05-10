import { useEffect, useMemo, useState } from "react";
import { recentMatches, type MatchRow } from "../services/matchRepo";
import type { ChampionDb, Role } from "../types/champion";
import { queueLabel } from "../data/queueNames";
import { useEscape } from "../hooks/useKeyboardShortcuts";

interface Props {
  db: ChampionDb;
  onClose: () => void;
}

type QueueFilter = "ALL" | "RANKED" | "NORMAL" | "ARAM" | number;

const QUEUE_TABS: Array<{ value: QueueFilter; label: string; ids?: number[] }> = [
  { value: "RANKED", label: "Ranked", ids: [420, 440] },
  { value: 420, label: "SoloQ", ids: [420] },
  { value: 440, label: "Flex", ids: [440] },
  { value: "NORMAL", label: "Normal", ids: [400, 430, 490] },
  { value: 450, label: "ARAM", ids: [450] },
  { value: "ALL", label: "Todas" },
];

const ROLE_TABS: Array<{ value: Role | "ALL"; label: string }> = [
  { value: "ALL", label: "Todos los roles" },
  { value: "TOP", label: "Top" },
  { value: "JUNGLE", label: "Jungla" },
  { value: "MIDDLE", label: "Mid" },
  { value: "BOTTOM", label: "ADC" },
  { value: "UTILITY", label: "Sup" },
];

export function HistoryView({ db, onClose }: Props) {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [queueTab, setQueueTab] = useState<QueueFilter>("RANKED");
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL");
  const [championFilter, setChampionFilter] = useState<string>("");
  useEscape(onClose);

  useEffect(() => {
    recentMatches(200).then(setMatches);
  }, []);

  const filtered = useMemo(() => {
    return matches.filter((m) => {
      // Queue filter
      const tab = QUEUE_TABS.find((t) => t.value === queueTab);
      if (tab?.ids && !tab.ids.includes(m.queueId)) return false;
      // Role filter
      if (roleFilter !== "ALL" && m.position !== roleFilter) return false;
      // Champion filter (fuzzy)
      if (championFilter) {
        const champ = db.champions[String(m.championId)];
        if (!champ) return false;
        if (!champ.name.toLowerCase().includes(championFilter.toLowerCase()))
          return false;
      }
      return true;
    });
  }, [matches, queueTab, roleFilter, championFilter, db]);

  const wins = filtered.filter((m) => m.win).length;
  const winRate = filtered.length > 0 ? (wins / filtered.length) * 100 : 0;
  const avgKda = filtered.length > 0
    ? filtered.reduce(
        (acc, m) => acc + (m.kills + m.assists) / Math.max(1, m.deaths),
        0
      ) / filtered.length
    : 0;
  const avgCs = filtered.length > 0
    ? filtered.reduce((acc, m) => acc + m.cs / (m.durationSec / 60), 0) /
      filtered.length
    : 0;
  const streakInfo = computeStreak(filtered);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="animate-[scaleIn_180ms_ease-out] bg-bg-elev border border-border-subtle rounded-lg w-[820px] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border-subtle">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-semibold text-accent">Historial</h2>
            <input
              value={championFilter}
              onChange={(e) => setChampionFilter(e.target.value)}
              placeholder="Filtrar por campeón..."
              className="bg-bg px-3 py-1 text-sm rounded border border-border-subtle focus:border-accent text-white outline-none w-44"
            />
          </div>

          {/* Queue tabs */}
          <div className="flex gap-1 mb-2">
            {QUEUE_TABS.map((t) => (
              <button
                key={String(t.value)}
                onClick={() => setQueueTab(t.value)}
                className={`px-3 py-1 text-xs rounded border ${
                  queueTab === t.value
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border-subtle text-white/70 hover:border-white/30"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Role filter */}
          <div className="flex gap-1">
            {ROLE_TABS.map((r) => (
              <button
                key={r.value}
                onClick={() => setRoleFilter(r.value)}
                className={`px-3 py-1 text-xs rounded border ${
                  roleFilter === r.value
                    ? "border-accent/60 bg-accent/10 text-accent"
                    : "border-border-subtle text-white/60 hover:border-white/30"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats summary */}
        <div className="px-4 py-2 grid grid-cols-4 gap-2 text-center bg-bg-card/50 border-b border-border-subtle">
          <Stat label="Partidas" value={String(filtered.length)} />
          <Stat
            label="Winrate"
            value={`${winRate.toFixed(0)}%`}
            color={winRate >= 55 ? "good" : winRate >= 45 ? "neutral" : "bad"}
          />
          <Stat label="KDA medio" value={avgKda.toFixed(2)} />
          <Stat label="CS/min" value={avgCs.toFixed(1)} />
        </div>

        {streakInfo && (
          <div
            className={`px-4 py-2 text-xs ${streakInfo.win ? "text-good bg-good/5" : "text-bad bg-bad/5"} border-b border-border-subtle`}
          >
            {streakInfo.win ? "🔥 Racha victorias" : "❄️ Racha derrotas"}:{" "}
            {streakInfo.count} consecutivas
          </div>
        )}

        {/* Matches list */}
        <div className="overflow-y-auto p-3 space-y-1">
          {filtered.length === 0 && matches.length > 0 && (
            <p className="text-white/50 text-center py-8 text-sm">
              Sin partidas con estos filtros.
            </p>
          )}
          {matches.length === 0 && (
            <p className="text-white/50 text-center py-8 text-sm">
              Sin partidas aún. Abre el cliente de LoL o configura tu Riot ID en
              ⚙️.
            </p>
          )}
          {filtered.map((m) => (
            <MatchRowCard key={m.matchId} db={db} m={m} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color = "neutral",
}: {
  label: string;
  value: string;
  color?: "good" | "neutral" | "bad";
}) {
  const c =
    color === "good"
      ? "text-good"
      : color === "bad"
        ? "text-bad"
        : "text-white";
  return (
    <div>
      <p className={`text-base font-semibold ${c}`}>{value}</p>
      <p className="text-[10px] uppercase text-white/50 tracking-wide">
        {label}
      </p>
    </div>
  );
}

function MatchRowCard({ db, m }: { db: ChampionDb; m: MatchRow }) {
  const champ = db.champions[String(m.championId)];
  const opp = m.opponentChampionId
    ? db.champions[String(m.opponentChampionId)]
    : null;
  const kda = ((m.kills + m.assists) / Math.max(1, m.deaths)).toFixed(2);
  const cspm = (m.cs / (m.durationSec / 60)).toFixed(1);
  const date = new Date(m.gameEndTimestampMs);
  const ago = formatTimeAgo(date);

  return (
    <div
      className={`flex items-center gap-3 p-2 rounded border ${m.win ? "border-good/40 bg-good/5" : "border-bad/40 bg-bad/5"}`}
    >
      <div
        className={`w-1 h-12 rounded ${m.win ? "bg-good" : "bg-bad"}`}
        aria-hidden
      />
      {champ && (
        <img src={champ.iconUrl} alt={champ.name} className="w-12 h-12 rounded" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">
          {champ?.name ?? `#${m.championId}`}
          {opp && (
            <span className="text-white/50 text-xs">  vs {opp.name}</span>
          )}
        </p>
        <p className="text-xs text-white/50">
          {m.position || "—"} · {queueLabel(m.queueId)} ·{" "}
          {Math.round(m.durationSec / 60)}min · {ago}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm text-white/80">
          {m.kills}/{m.deaths}/{m.assists}{" "}
          <span className="text-white/50 text-xs">({kda})</span>
        </p>
        <p className="text-xs text-white/50">{cspm} CS/min · {m.cs} CS</p>
      </div>
      <p
        className={`text-xs font-bold ml-2 ${m.win ? "text-good" : "text-bad"}`}
      >
        {m.win ? "W" : "L"}
      </p>
    </div>
  );
}

function computeStreak(matches: MatchRow[]): { win: boolean; count: number } | null {
  if (matches.length === 0) return null;
  const first = matches[0];
  let count = 0;
  for (const m of matches) {
    if (m.win === first.win) count++;
    else break;
  }
  if (count < 2) return null;
  return { win: first.win, count };
}

function formatTimeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const s = ms / 1000;
  if (s < 60) return "ahora";
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}min`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h`;
  const days = h / 24;
  if (days < 7) return `${Math.floor(days)}d`;
  return d.toLocaleDateString();
}
