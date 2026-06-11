// On-demand draft explanation. A button that asks the AI to turn the engine's
// pick + the matchup data into coherent, human draft advice (why the pick, how
// to play the lane, the win condition). Lives in the champ-select column.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Loader2 } from "lucide-react";
import { usePrefsStore } from "../state/prefsStore";
import { i18n } from "../i18n";
import { explainDraft } from "../services/draftCoach";
import { useEnemyMains } from "../hooks/useEnemyMains";
import { detectMissingArchetypes } from "../engine/suggestionEngine";
import type { ChampionDb, CounterEntry, Role } from "../types/champion";
import type { ScoredSuggestion } from "../engine/suggestionEngine";
import type { ChampionMasteryDto } from "../services/riotApi";

interface Props {
  db: ChampionDb;
  myChampionKey: string | null;
  role: Role | null;
  allyKeys: string[];
  enemyKeys: string[];
  liveCounters: CounterEntry[];
  suggestions: ScoredSuggestion[];
  /** Enemy lobby cell ids → scout their comfort mains for the AI prompt. */
  enemySummonerIds?: number[];
  /** Banned champion keys — fed to the coach so it reasons with the real pool. */
  bannedKeys?: string[];
  /** Local masteries — tailors advice to the player's comfort on the pick. */
  masteries?: ChampionMasteryDto[];
}

export function DraftCoachPanel({
  db,
  myChampionKey,
  role,
  allyKeys,
  enemyKeys,
  liveCounters,
  suggestions,
  enemySummonerIds = [],
  bannedKeys = [],
  masteries = [],
}: Props) {
  const { t } = useTranslation();
  const provider = usePrefsStore((s) => s.prefs.aiProvider);
  const apiKey = usePrefsStore((s) =>
    s.prefs.aiProvider === "groq"
      ? s.prefs.groqApiKey
      : s.prefs.aiProvider === "gemini"
        ? s.prefs.geminiApiKey
        : s.prefs.anthropicApiKey
  );
  const lang = usePrefsStore((s) => s.prefs.aiCoachLanguage);
  const [advice, setAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const enemyMains = useEnemyMains(enemySummonerIds);

  if (!myChampionKey || !role) return null;
  const me = db.champions[myChampionKey];
  if (!me) return null;
  // Capture the narrowed role — TS loses prop narrowing inside the async closure.
  const safeRole: Role = role;

  const name = (k: string) => db.champions[k]?.name ?? k;
  // My matchup vs the lane opponent = the liveCounters entry keyed on MY champ
  // (op.gg data is same-lane, so this resolves the direct laner when present).
  const mine = liveCounters.find((c) => c.championKey === myChampionKey);
  const laneOpponent = mine ? name(mine.vsChampionKey) : null;
  const laneWr = mine ? mine.winRate : null;

  async function run() {
    // Groq routes through the shared proxy (no key needed); others need a key.
    if (provider !== "groq" && !apiKey?.trim()) {
      setErr(`Configura tu API key (${provider}) en Prefs.`);
      return;
    }
    setErr(null);
    setLoading(true);
    setAdvice(null);
    try {
      const out = await explainDraft(provider, apiKey ?? "", {
        myChampion: me.name,
        role: safeRole,
        allies: allyKeys.map(name),
        enemies: enemyKeys.map(name),
        laneOpponent,
        laneMatchupWinRate: laneWr,
        topSuggestions: suggestions.slice(0, 3).map((s) => ({
          name: s.champion.name,
          // Reasons are i18n keys — resolve to the coach's language for the
          // prompt (WR-style literals pass through unchanged).
          reasons: s.reasons.map((r) => i18n.t(r, { lng: lang === "en" ? "en" : "es" })),
        })),
        enemyMains: enemyMains.map((m) => ({
          championName: db.champions[String(m.championId)]?.name ?? `#${m.championId}`,
          summonerName: m.summonerName,
        })),
        bans: bannedKeys.map(name),
        myMastery: (() => {
          const m = masteries.find((x) => String(x.championId) === myChampionKey);
          return m ? { level: m.championLevel, points: m.championPoints } : null;
        })(),
        compMissing: [...detectMissingArchetypes(db, allyKeys)].map(String),
        language: lang === "en" ? "en" : "es",
      });
      setAdvice(out);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-card/40 p-3 space-y-2">
      <button
        onClick={run}
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-accent/15 ring-1 ring-accent/40 text-accent text-sm font-semibold hover:bg-accent/25 transition disabled:opacity-50"
        title={t("draftCoach.tooltip")}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        {loading ? "Pensando…" : "Explica el draft (IA)"}
      </button>

      {err && <p className="text-xs text-bad">⚠ {err}</p>}

      {advice && (
        <p className="text-sm text-white/85 whitespace-pre-wrap leading-relaxed animate-[fadeIn_200ms_ease-out]">
          {advice}
        </p>
      )}
    </div>
  );
}
