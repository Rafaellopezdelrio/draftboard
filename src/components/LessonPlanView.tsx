// 7-day improvement plan generator + history of past plans.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  recentLessonPlans,
  saveLessonPlan,
  markLessonPlanCompleted,
  type LessonPlan,
} from "../services/lessonPlanRepo";
import { aiLessonPlan } from "../services/aiCoach";
import { recentMatches } from "../services/matchRepo";
import {
  buildPlaystyleProfile,
  getArchetypeMeta,
} from "../engine/playstyleEngine";
import { detectWeakestArea } from "../engine/trendsEngine";
import { usePrefsStore } from "../state/prefsStore";
import { useEscape } from "../hooks/useKeyboardShortcuts";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useRef } from "react";
import { Skeleton } from "./ui/Skeleton";

const LESSONPLAN_TITLE_ID = "lessonplan-view-title";
import type { ChampionDb } from "../types/champion";
import { Tabs } from "./ui/Tabs";
import { Panel } from "./ui/Panel";
import { Sparkles, Calendar, Check, Target, BookOpen } from "lucide-react";
import { EmptyState } from "./ui/EmptyState";

interface Props {
  db: ChampionDb;
  onClose: () => void;
}

type Tab = "current" | "history";

export function LessonPlanView({ db, onClose }: Props) {
  const { t } = useTranslation();
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

  const [tab, setTab] = useState<Tab>("current");
  const [past, setPast] = useState<LessonPlan[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    recentLessonPlans(20).then(setPast);
  }, [text]);

  async function generate() {
    if (!apiKey) {
      setErr(t("lessonPlan.errKey", { provider }));
      return;
    }
    setErr(null);
    setLoading(true);
    setText("");
    try {
      const matches = await recentMatches(50);
      if (matches.length < 5) {
        throw new Error(t("lessonPlan.errMinGames"));
      }
      const profile = buildPlaystyleProfile(matches);
      const weakest = detectWeakestArea(matches);
      const archetypeLabel = profile
        ? getArchetypeMeta(profile.archetype).label
        : "Balanceado";
      const summary = matches.slice(0, 10).map((m) => {
        const c = db.champions[String(m.championId)];
        return {
          championName: c?.name ?? `#${m.championId}`,
          position: m.position,
          win: m.win,
          kda: `${m.kills}/${m.deaths}/${m.assists}`,
        };
      });
      const result = await aiLessonPlan({
        provider,
        apiKey,
        weakestArea: weakest?.detail ?? null,
        archetype: archetypeLabel,
        recentMatches: summary,
        language: lang,
      });
      // Persist BEFORE setText: generated plans were never saved (the repo's
      // saveLessonPlan was unused), so History stayed permanently empty and a
      // plan vanished on close. Saving first means the [text] effect below
      // re-runs recentLessonPlans and the new plan shows up immediately.
      await saveLessonPlan({
        createdTsMs: Date.now(),
        weakestArea: weakest?.detail ?? null,
        archetype: archetypeLabel,
        planText: result,
        completed: false,
      }).catch(() => {});
      setText(result);
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
      aria-labelledby={LESSONPLAN_TITLE_ID}
      className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg w-[680px] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-2 border-b border-border-subtle">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-5 h-5 text-accent" />
            <h2 id={LESSONPLAN_TITLE_ID} className="text-xl font-bold gold-text">{t("lessonPlan.title")}</h2>
          </div>
          <Tabs<Tab>
            tabs={[
              { value: "current", label: t("lessonPlan.tabNew"), icon: <Sparkles className="w-3 h-3" /> },
              { value: "history", label: t("lessonPlan.tabPast"), count: past.length, icon: <Target className="w-3 h-3" /> },
            ]}
            active={tab}
            onChange={setTab}
          />
        </div>

        <div className="overflow-y-auto p-4 flex-1">
          {tab === "current" && (
            <div className="space-y-3">
              {!text && !loading && (
                <Panel padding="sm">
                  <p className="text-sm text-white/80 mb-2">
                    {t("lessonPlan.basedOn")}
                  </p>
                  <ul className="text-xs text-white/65 space-y-1 ml-4 list-disc">
                    <li>{t("lessonPlan.basis1")}</li>
                    <li>{t("lessonPlan.basis2")}</li>
                    <li>{t("lessonPlan.basis3")}</li>
                  </ul>
                  <button
                    onClick={generate}
                    disabled={loading || !apiKey}
                    className="mt-3 w-full px-4 py-2 bg-accent text-black font-medium rounded-md text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    {t("lessonPlan.generate")}
                  </button>
                  {!apiKey && (
                    <p className="text-[11px] text-meh mt-2">
                      {t("lessonPlan.needKey", { provider })}
                    </p>
                  )}
                </Panel>
              )}
              {loading && (
                // 7-day plan skeleton: title bar + 7 day-blocks (each
                // with day header + 2-3 task lines). Mirrors the final
                // layout so the screen doesn't reflow when copy arrives.
                <div className="space-y-3" aria-busy="true" aria-live="polite">
                  <Skeleton className="h-4 w-48" />
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div
                      key={i}
                      className="p-3 rounded border border-border-subtle space-y-2"
                    >
                      <Skeleton className="h-3 w-24" />
                      <Skeleton rows={2} gap="tight" className="h-2 w-full" />
                    </div>
                  ))}
                </div>
              )}
              {err && (
                <Panel padding="sm">
                  <p className="text-sm text-bad">{err}</p>
                </Panel>
              )}
              {text && (
                <Panel padding="sm">
                  <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
                    {text}
                  </p>
                  <button
                    onClick={() => {
                      setText("");
                      setTab("history");
                    }}
                    className="mt-3 text-xs text-accent hover:underline"
                  >
                    {t("lessonPlan.viewSaved")}
                  </button>
                </Panel>
              )}
            </div>
          )}

          {tab === "history" && (
            <div className="space-y-2">
              {past.length === 0 && (
                <EmptyState
                  icon={BookOpen}
                  title={t("lessonPlan.emptyTitle")}
                  detail={t("lessonPlan.emptyDetail")}
                />
              )}
              {past.map((p) => (
                <Panel key={p.id} padding="sm">
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-xs text-white/55">
                      {new Date(p.createdTsMs).toLocaleDateString()} ·{" "}
                      <span className="text-accent">{p.archetype}</span>
                    </p>
                    {p.completed ? (
                      <span className="text-[10px] text-good inline-flex items-center gap-1 uppercase tracking-widest">
                        <Check className="w-3 h-3" /> {t("lessonPlan.completed")}
                      </span>
                    ) : (
                      <button
                        onClick={async () => {
                          if (!p.id) return;
                          await markLessonPlanCompleted(p.id);
                          setPast((old) =>
                            old.map((x) =>
                              x.id === p.id ? { ...x, completed: true } : x
                            )
                          );
                        }}
                        className="text-[10px] text-white/45 hover:text-good uppercase tracking-widest"
                      >
                        {t("lessonPlan.markCompleted")}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-white/80 whitespace-pre-wrap leading-relaxed line-clamp-6">
                    {p.planText}
                  </p>
                </Panel>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
