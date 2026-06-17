// Pre-game tip carousel. Cycles through 3-5 short champion-specific
// tips during champ select, drawn from the curated `championTips` map.
// Replaces dead space in the right rail with actionable advice that
// rotates every ~6 seconds so the user catches multiple tips while
// they're picking spells / staring at the queue.
//
// Tips come from 3 layers, best first: AI-generated per-champion tips (cached
// in SQLite via championTips — covers all ~170), then a small hand-curated map,
// then a generic per-role fallback. The AI fetch is cache-first + debounced, so
// it's free after the first generation and never blocks the carousel.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Lightbulb } from "lucide-react";
import { Panel } from "./ui/Panel";
import { usePrefsStore } from "../state/prefsStore";
import { getChampionTips } from "../services/championTips";
import type { Champion, Role } from "../types/champion";

interface Props {
  champion: Champion | null;
  role: Role | null;
  patch: string;
}

// Champions with a curated tip set. The tip TEXT lives in the locale files
// (tipCarousel.champTips.<key> / tipCarousel.roleTips.<ROLE>) so it localizes;
// here we only map a champion display name → its locale key segment. Add more
// as we see specific user demand.
const CHAMPION_TIP_KEYS: Record<string, string> = {
  "Lee Sin": "LeeSin",
  "Jinx": "Jinx",
  "Yasuo": "Yasuo",
  "Ahri": "Ahri",
  "Vayne": "Vayne",
};

function getTipsFor(
  champion: Champion | null,
  role: Role | null,
  t: TFunction
): string[] {
  if (!role && !champion) return [];
  const tips: string[] = [];
  const champKey = champion ? CHAMPION_TIP_KEYS[champion.name] : undefined;
  if (champKey) {
    tips.push(
      ...(t(`tipCarousel.champTips.${champKey}`, { returnObjects: true }) as string[])
    );
  }
  if (role) {
    tips.push(
      ...(t(`tipCarousel.roleTips.${role}`, { returnObjects: true }) as string[])
    );
  }
  return tips;
}

const ROTATE_MS = 6000;

export function TipCarousel({ champion, role, patch }: Props) {
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
  const champKey = champion?.key ?? null;
  const champName = champion?.name ?? null;
  const [aiTips, setAiTips] = useState<string[]>([]);
  const tips = [...aiTips, ...getTipsFor(champion, role, t)];
  const [idx, setIdx] = useState(0);

  // AI tips (cache-first) for the active champion+role. Debounced so a
  // reordering suggestion list can't fire a burst of generations; the cache
  // makes repeats instant. Best-effort — failure leaves the curated/role tips.
  useEffect(() => {
    setAiTips([]);
    if (!champKey || !champName || !role) return;
    let cancelled = false;
    const t = setTimeout(() => {
      getChampionTips({
        provider,
        apiKey: apiKey ?? "",
        championId: Number(champKey),
        championName: champName,
        role,
        patch,
        language: lang === "en" ? "en" : "es",
      }).then((res) => {
        if (!cancelled) setAiTips(res);
      });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [champKey, champName, role, patch, provider, apiKey, lang]);

  // Rotate every ROTATE_MS so the user sees multiple tips per pick phase.
  // Resets to 0 when the champion/role or the AI tips change.
  useEffect(() => {
    setIdx(0);
  }, [champKey, role, aiTips.length]);

  useEffect(() => {
    if (tips.length <= 1) return;
    const id = setInterval(() => {
      setIdx((n) => (n + 1) % tips.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
    // Re-trigger when champion/role changes so the interval restarts
    // with the NEW tips array. Previously only tips.length was in the
    // dep array — if length stayed equal across champions, the
    // interval's closure kept using the old tips reference + indexed
    // stale content for `current = tips[idx]`.
  }, [tips.length, champion?.key, role]);

  if (tips.length === 0) return null;
  const current = tips[idx];

  return (
    <Panel padding="sm">
      <div className="flex items-start gap-2">
        <Lightbulb className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-widest text-accent font-semibold">
              {t("tipCarousel.label")} · {champion?.name ?? role}
            </p>
            {tips.length > 1 && (
              <span className="text-[9px] text-white/35 tabular-nums">
                {idx + 1}/{tips.length}
              </span>
            )}
          </div>
          {/* key on the text ensures CSS transition triggers per tip
            * change — fade-in animation defined in App.css. */}
          <p
            key={`${champion?.name ?? "r"}-${idx}`}
            className="text-[11px] text-white/85 leading-snug animate-[fadeIn_300ms_ease-out]"
          >
            {current}
          </p>
        </div>
      </div>
      {/* Progress bar showing time until rotate */}
      {tips.length > 1 && (
        <div className="mt-2 h-0.5 bg-white/5 rounded overflow-hidden">
          <div
            key={`bar-${idx}`}
            className="h-full bg-accent/60"
            style={{
              animation: `slideUp 1ms linear forwards, fadeIn 0ms`,
              transition: `width ${ROTATE_MS}ms linear`,
              width: "100%",
            }}
          />
        </div>
      )}
    </Panel>
  );
}
