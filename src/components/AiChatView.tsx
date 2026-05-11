import { useEffect, useRef, useState } from "react";
import { usePrefsStore } from "../state/prefsStore";
import {
  chatWithCoach,
  type ChatContext,
  type ChatMessage,
} from "../services/aiChat";
import {
  personalStatsByChampion,
  recentMatches,
} from "../services/matchRepo";
import { lcuMasteries, lcuRank } from "../services/lcuPersonalData";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import type { ChampionDb } from "../types/champion";

interface Props {
  db: ChampionDb;
  onClose: () => void;
}

const SUGGESTED_PROMPTS = [
  "¿Por qué estoy estancado en este elo?",
  "¿Qué campeón me conviene mainear?",
  "Analiza mis últimas 10 partidas",
  "¿Cómo gano cuando juego contra Yasuo?",
  "Dame un plan de práctica para esta semana",
];

export function AiChatView({ db, onClose }: Props) {
  useEscape(onClose);
  const provider = usePrefsStore((s) => s.prefs.aiProvider);
  const apiKey = usePrefsStore((s) =>
    s.prefs.aiProvider === "groq"
      ? s.prefs.groqApiKey
      : s.prefs.aiProvider === "gemini"
        ? s.prefs.geminiApiKey
        : s.prefs.anthropicApiKey
  );
  const lang = usePrefsStore((s) => s.prefs.aiCoachLanguage);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [context, setContext] = useState<ChatContext | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const championNamesById: Record<number, string> = {};
      for (const c of Object.values(db.champions)) {
        championNamesById[Number(c.key)] = c.name;
      }
      const [matches, stats, masteries, rank] = await Promise.all([
        recentMatches(20),
        personalStatsByChampion(),
        lcuMasteries(),
        lcuRank(),
      ]);
      setContext({
        recentMatches: matches,
        masteries,
        personalStats: stats,
        currentRank: rank
          ? { tier: rank.tier, division: rank.division, lp: rank.leaguePoints }
          : null,
        championNamesById,
      });
    })();
  }, [db]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || !context || loading) return;
    if (!apiKey) {
      setErr(`Configura tu API key (${provider}) en Prefs primero.`);
      return;
    }
    setErr(null);
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const reply = await chatWithCoach(provider, apiKey, next, context, lang);
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="animate-[scaleIn_180ms_ease-out] bg-bg-elev border border-border-subtle rounded-lg w-[680px] h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between p-4 border-b border-border-subtle">
          <h2 className="text-lg font-semibold text-accent">
            🤖 Coach IA · habla con Claude
          </h2>
          <button
            onClick={() => setMessages([])}
            className="text-xs text-white/50 hover:text-white"
          >
            Nueva conversación
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-white/70">
                Pregúntame lo que quieras sobre tu juego. Tengo acceso a tus
                últimas 20 partidas, maestrías y rango.
              </p>
              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-wide text-white/40">
                  Ideas para empezar
                </p>
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    className="block w-full text-left text-sm p-2 bg-bg-card border border-border-subtle rounded hover:border-accent text-white/80"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`p-3 rounded ${m.role === "user" ? "bg-accent/15 border border-accent/30 ml-8" : "bg-bg-card border border-border-subtle mr-8"}`}
            >
              <p className="text-xs uppercase text-white/40 mb-1">
                {m.role === "user" ? "Tú" : "Coach"}
              </p>
              <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
                {m.content}
              </p>
            </div>
          ))}

          {loading && (
            <div className="p-3 rounded bg-bg-card border border-border-subtle mr-8">
              <p className="text-xs uppercase text-white/40 mb-1">Coach</p>
              <p className="text-sm text-white/60 italic">pensando...</p>
            </div>
          )}

          {err && (
            <div className="p-2 rounded bg-bad/10 border border-bad/40">
              <p className="text-sm text-bad">{err}</p>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border-subtle">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu pregunta..."
              className="flex-1 bg-bg px-3 py-2 rounded outline-none border border-border-subtle focus:border-accent text-white text-sm"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-4 py-2 bg-accent text-black font-medium rounded text-sm disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
          {!apiKey && (
            <p className="text-xs text-meh mt-1">
              Necesitas una API key ({provider}) en Prefs. Groq es gratis.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
