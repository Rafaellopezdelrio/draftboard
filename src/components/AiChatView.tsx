import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { Bot, Send, Sparkles, User as UserIcon, Trash2 } from "lucide-react";

const AI_CHAT_TITLE_ID = "ai-chat-view-title";
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

  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, true);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={AI_CHAT_TITLE_ID}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg w-[680px] h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent-soft to-accent flex items-center justify-center shadow-[0_0_12px_rgba(78,205,196,0.4)]">
              <Bot className="w-5 h-5 text-black" />
            </div>
            <div>
              <h2 id={AI_CHAT_TITLE_ID} className="text-lg font-bold text-white leading-tight">
                AI Coach
              </h2>
              <p className="text-[10px] uppercase tracking-widest text-accent/70">
                {provider} · {messages.length} mensajes
              </p>
            </div>
          </div>
          <button
            onClick={() => setMessages([])}
            disabled={messages.length === 0}
            className="text-[10px] uppercase tracking-wider px-2 py-1 rounded ring-1 ring-border-subtle bg-bg-card/60 text-white/55 hover:text-bad hover:ring-bad/50 transition disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
            title="Limpia el historial de la conversación actual"
          >
            <Trash2 className="w-3 h-3" />
            Limpiar
          </button>
        </div>

        <div
          ref={scrollRef}
          role="log"
          aria-label="Conversación con el coach AI"
          aria-live="polite"
          aria-atomic="false"
          className="flex-1 overflow-y-auto p-4 space-y-3"
        >
          {messages.length === 0 && (
            <div className="space-y-4 animate-[fadeIn_300ms_ease-out]">
              <div className="bg-gradient-to-br from-accent/10 via-accent/5 to-transparent border border-accent/30 rounded-lg p-4">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-white mb-1">
                      Pregúntame lo que quieras sobre tu juego
                    </p>
                    <p className="text-xs text-white/65 leading-snug">
                      Tengo acceso a tus últimas 20 partidas, maestrías y rango.
                      Puedo analizar patrones, sugerir picks, plan de mejora.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-semibold">
                  Ideas para empezar
                </p>
                <div className="grid gap-1.5">
                  {SUGGESTED_PROMPTS.map((p, i) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      style={{ animationDelay: `${i * 80}ms` }}
                      className="text-left text-sm px-3 py-2.5 bg-bg-card/60 border border-border-subtle rounded-md hover:border-accent/50 hover:bg-bg-card text-white/80 transition animate-[fadeIn_400ms_ease-out_backwards]"
                    >
                      <span className="text-accent/60 mr-1.5">›</span> {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            const isUser = m.role === "user";
            return (
              <div
                key={i}
                className={`flex gap-2 animate-[fadeIn_200ms_ease-out] ${isUser ? "flex-row-reverse" : ""}`}
              >
                {/* Avatar — mint for assistant, gray for user */}
                <div
                  className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center ${
                    isUser
                      ? "bg-bg-card ring-1 ring-border-subtle"
                      : "bg-gradient-to-br from-accent-soft to-accent shadow-[0_0_8px_rgba(78,205,196,0.3)]"
                  }`}
                >
                  {isUser ? (
                    <UserIcon className="w-3.5 h-3.5 text-white/70" />
                  ) : (
                    <Bot className="w-3.5 h-3.5 text-black" />
                  )}
                </div>
                {/* Bubble */}
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 ${
                    isUser
                      ? "bg-accent/15 border border-accent/30 rounded-tr-sm"
                      : "bg-bg-card border border-border-subtle rounded-tl-sm"
                  }`}
                >
                  <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
                    {m.content}
                  </p>
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex gap-2 animate-[fadeIn_200ms_ease-out]">
              <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center bg-gradient-to-br from-accent-soft to-accent">
                <Bot className="w-3.5 h-3.5 text-black" />
              </div>
              <div className="bg-bg-card border border-border-subtle rounded-lg rounded-tl-sm px-3 py-2.5">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: "0ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: "200ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: "400ms" }} />
                </div>
              </div>
            </div>
          )}

          {err && (
            <div className="p-2.5 rounded bg-bad/10 border border-bad/40">
              <p className="text-sm text-bad">⚠ {err}</p>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border-subtle bg-bg-elev/30">
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
              placeholder={loading ? "Esperando respuesta..." : "Escribe tu pregunta..."}
              className="flex-1 bg-bg-elev/60 px-3 py-2.5 rounded-md outline-none ring-1 ring-border-subtle focus:ring-accent text-white text-sm transition disabled:opacity-50"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-4 py-2.5 bg-accent text-black font-semibold rounded-md text-sm disabled:opacity-40 hover:bg-accent-deep transition inline-flex items-center gap-1.5 shadow-[0_0_8px_rgba(78,205,196,0.3)]"
              title="Enviar mensaje (Enter)"
            >
              <Send className="w-3.5 h-3.5" />
              Enviar
            </button>
          </form>
          {!apiKey && (
            <p className="text-[11px] text-meh mt-1.5 flex items-center gap-1">
              ⚠ Necesitas una API key ({provider}) en Prefs. Groq es gratis.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
