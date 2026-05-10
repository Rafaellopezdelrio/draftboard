import { useEffect, useMemo, useState } from "react";
import { recentMatches, type MatchRow } from "../services/matchRepo";
import {
  computeTrends,
  detectWeakestArea,
} from "../engine/trendsEngine";
import type { ChampionDb, Role } from "../types/champion";
import { usePrefsStore } from "../state/prefsStore";
import { aiTrendsAnalysis } from "../services/aiCoach";

interface Props {
  db: ChampionDb;
  onClose: () => void;
}

const ROLE_OPTIONS: Array<{ value: Role | "ALL"; label: string }> = [
  { value: "ALL", label: "Todos los roles" },
  { value: "TOP", label: "Top" },
  { value: "JUNGLE", label: "Jungla" },
  { value: "MIDDLE", label: "Mid" },
  { value: "BOTTOM", label: "ADC" },
  { value: "UTILITY", label: "Support" },
];

const QUEUE_OPTIONS: Array<{ value: number | "ALL"; label: string }> = [
  { value: "ALL", label: "Todas las colas" },
  { value: 420, label: "Ranked SoloQ" },
  { value: 440, label: "Ranked Flex" },
  { value: 400, label: "Normal Draft" },
  { value: 430, label: "Normal Blind" },
  { value: 450, label: "ARAM" },
];

export function TrendsView({ db, onClose }: Props) {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [role, setRole] = useState<Role | "ALL">("ALL");
  const [queue, setQueue] = useState<number | "ALL">("ALL");
  const aiEnabled = usePrefsStore((s) => s.prefs.aiCoachEnabled);
  const apiKey = usePrefsStore((s) => s.prefs.anthropicApiKey);
  const aiLang = usePrefsStore((s) => s.prefs.aiCoachLanguage);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);

  useEffect(() => {
    recentMatches(200).then(setMatches);
  }, []);

  const filtered = useMemo(() => {
    return matches.filter(
      (m) =>
        (role === "ALL" || m.position === role) &&
        (queue === "ALL" || m.queueId === queue)
    );
  }, [matches, role, queue]);

  const trends = computeTrends(filtered);
  const weakest = detectWeakestArea(filtered);

  async function runAi() {
    setAiLoading(true);
    setAiErr(null);
    try {
      const summary = filtered.slice(0, 15).map((m) => {
        const c = db.champions[String(m.championId)];
        return {
          championName: c?.name ?? `#${m.championId}`,
          position: m.position,
          win: m.win,
          kda: `${m.kills}/${m.deaths}/${m.assists}`,
          cspm: m.cs / (m.durationSec / 60),
          visionScore: 0,
          durationMin: m.durationSec / 60,
          queueId: m.queueId,
        };
      });
      const text = await aiTrendsAnalysis({
        apiKey,
        matches: summary,
        language: aiLang,
      });
      setAiText(text);
    } catch (e) {
      setAiErr(String(e));
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-bg-elev border border-border-subtle rounded-lg p-4 w-[680px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold text-accent">Tendencias</h2>
          <span className="text-xs text-white/40">
            {filtered.length} partidas
          </span>
        </div>

        <div className="flex gap-2 mb-3">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role | "ALL")}
            className="bg-bg text-white text-sm px-2 py-1 rounded border border-border-subtle"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            value={queue}
            onChange={(e) =>
              setQueue(e.target.value === "ALL" ? "ALL" : Number(e.target.value))
            }
            className="bg-bg text-white text-sm px-2 py-1 rounded border border-border-subtle"
          >
            {QUEUE_OPTIONS.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
        </div>

        {weakest && (
          <div className="mb-3 p-3 rounded border border-bad/60 bg-bad/10">
            <p className="text-xs uppercase text-white/50 tracking-wide">
              Tu mayor problema {role !== "ALL" ? `en ${role}` : "esta semana"}
            </p>
            <p className="font-medium text-white mt-1">{weakest.category}</p>
            <p className="text-sm text-white/80">{weakest.detail}</p>
          </div>
        )}

        {aiEnabled && filtered.length >= 5 && (
          <div className="mb-3 p-3 rounded border border-accent/40 bg-accent/5">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm uppercase text-accent tracking-wide">
                AI Coach (tendencias)
              </h3>
              <button
                onClick={runAi}
                disabled={aiLoading || !apiKey}
                className="text-xs px-2 py-1 bg-accent text-black rounded disabled:opacity-50"
              >
                {aiLoading ? "Analizando..." : "Analizar últimas " + filtered.slice(0, 15).length}
              </button>
            </div>
            {aiErr && <p className="text-sm text-bad">{aiErr}</p>}
            {aiText && (
              <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
                {aiText}
              </p>
            )}
          </div>
        )}

        {trends.length === 0 ? (
          <p className="text-white/50 text-center py-4">
            Necesitas al menos 6 partidas con estos filtros para ver tendencias.
          </p>
        ) : (
          <div className="space-y-2 overflow-y-auto">
            {trends.map((t, i) => (
              <div
                key={i}
                className={`p-2 rounded border text-sm ${
                  t.severity === "good"
                    ? "border-good/60 bg-good/10 text-good"
                    : t.severity === "warn"
                      ? "border-meh/60 bg-meh/10 text-meh"
                      : t.severity === "bad"
                        ? "border-bad/60 bg-bad/10 text-bad"
                        : "border-border-subtle bg-bg-card text-white/80"
                }`}
              >
                {t.insight}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
