// The simple home screen (no champ select, no game): how the last game went,
// how the last ten went, and what the app will do once the player queues up.
// Reads only the locally stored match summaries.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChampionDb } from "../types/champion";
import { recentMatches, type MatchRow } from "../services/matchRepo";
import { MATCHES_SYNCED_EVENT } from "../services/personalDataSync";

interface Props {
  db: ChampionDb;
  rankTier: string | null;
  /** Changes when a game ends, so the stored matches are read again. */
  refreshKey: string | null;
  onOpenReview: () => void;
  onOpenChat: () => void;
  onShowDetails: () => void;
}

const CARD = "rounded-2xl bg-bg-elev/60 border border-border-subtle p-5 flex flex-col gap-3 min-w-0";
const STEP = "text-[11px] uppercase tracking-[0.14em] text-accent font-bold";
const RECENT = 10;

export type NextTip =
  | { key: "deaths"; params: { deaths: number } }
  | { key: "farm"; params: { perMin: string } }
  | { key: "vision"; params: Record<string, never> }
  | { key: "win" | "loss"; params: Record<string, never> };

/** One plain thing to work on, from the stored summary of a single game. */
export function nextTip(m: MatchRow): NextTip {
  const minutes = m.durationSec / 60;
  if (m.deaths >= 8 || m.deaths > m.kills + m.assists) return { key: "deaths", params: { deaths: m.deaths } };
  // Junglers and supports don't farm lane minions: the number would mislead.
  const farms = m.position !== "JUNGLE" && m.position !== "UTILITY";
  if (farms && minutes >= 15 && m.cs / minutes < 5)
    return { key: "farm", params: { perMin: (m.cs / minutes).toFixed(1) } };
  if (m.visionScore != null && minutes >= 15 && m.visionScore / minutes < 0.5)
    return { key: "vision", params: {} };
  return { key: m.win ? "win" : "loss", params: {} };
}

/** Champion with the most wins over the given games (needs at least two games). */
export function bestChampion(matches: MatchRow[]): { championId: number; wins: number; games: number } | null {
  const by = new Map<number, { wins: number; games: number }>();
  for (const m of matches) {
    const s = by.get(m.championId) ?? { wins: 0, games: 0 };
    s.games += 1;
    if (m.win) s.wins += 1;
    by.set(m.championId, s);
  }
  let best: { championId: number; wins: number; games: number } | null = null;
  for (const [championId, s] of by) {
    if (s.games < 2 || s.wins === 0) continue;
    if (!best || s.wins > best.wins || (s.wins === best.wins && s.games < best.games))
      best = { championId, ...s };
  }
  return best;
}

export function SimpleHomeView({ db, rankTier, refreshKey, onOpenReview, onOpenChat, onShowDetails }: Props) {
  const { t } = useTranslation();
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  // The first sync often finishes after this screen opens: read again then.
  const [syncTick, setSyncTick] = useState(0);
  useEffect(() => {
    const onSynced = () => setSyncTick((n) => n + 1);
    window.addEventListener(MATCHES_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(MATCHES_SYNCED_EVENT, onSynced);
  }, []);
  useEffect(() => {
    let stale = false;
    void recentMatches(RECENT)
      .then((m) => {
        if (!stale) setMatches(m);
      })
      .catch(() => {
        if (!stale) setMatches([]);
      });
    return () => {
      stale = true;
    };
  }, [refreshKey, syncTick]);

  const last = matches?.[0];
  const lastChamp = last ? db.champions[String(last.championId)] : undefined;
  const wins = matches?.filter((m) => m.win).length ?? 0;
  const best = matches ? bestChampion(matches) : null;
  const bestChamp = best ? db.champions[String(best.championId)] : undefined;
  const tip = last ? nextTip(last) : null;

  const ago = (endMs: number) => {
    const min = Math.max(1, Math.round((Date.now() - endMs) / 60_000));
    if (min < 60) return t("simpleHome.agoMin", { n: min });
    if (min < 60 * 24) return t("simpleHome.agoHours", { n: Math.round(min / 60) });
    return t("simpleHome.agoDays", { n: Math.round(min / (60 * 24)) });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4" data-testid="simple-home">
      <section className={`${CARD} border-accent/40`} aria-label={t("simpleHome.lastStep")}>
        <p className={STEP}>{t("simpleHome.lastStep")}</p>
        {!last ? (
          <p className="text-sm text-white/60">
            {matches === null ? t("simpleHome.loading") : t("simpleHome.noGames")}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-4">
              {lastChamp && <img src={lastChamp.iconUrl} alt="" className="w-20 h-20 rounded-xl shrink-0" />}
              <div className="min-w-0">
                <h2 className={`text-2xl font-bold ${last.win ? "text-white" : "text-white/85"}`}>
                  {t(last.win ? "simpleHome.wonWith" : "simpleHome.lostWith", {
                    name: lastChamp?.name ?? "—",
                  })}
                </h2>
                <p className="text-sm text-white/55">
                  {t("simpleHome.minutes", { n: Math.round(last.durationSec / 60) })} ·{" "}
                  {ago(last.gameEndTimestampMs)}
                </p>
              </div>
            </div>
            <div>
              <p className="text-3xl font-bold text-white tabular-nums">
                {last.kills} / {last.deaths} / {last.assists}
              </p>
              <p className="text-xs text-white/50">{t("simpleHome.kda")}</p>
            </div>
            {tip && (
              <div className="rounded-xl border border-meh/30 bg-meh/10 p-3">
                <p className="text-sm font-bold text-meh">{t("simpleHome.nextTitle")}</p>
                <p className="text-sm text-white/80 leading-snug">
                  {t(`simpleHome.tip.${tip.key}`, tip.params)}
                </p>
              </div>
            )}
          </>
        )}
        <div className="flex gap-2 flex-wrap mt-auto pt-2">
          {last && (
            <button
              type="button"
              onClick={onOpenReview}
              className="rounded-xl bg-accent text-black font-semibold text-sm px-4 py-2 hover:brightness-110 transition"
            >
              {t("simpleHome.review")}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenChat}
            className="rounded-xl border border-border-strong text-white/80 hover:text-white font-semibold text-sm px-4 py-2 transition"
          >
            {t("simpleHome.askCoach")}
          </button>
        </div>
      </section>

      <div className="flex flex-col gap-4 min-w-0">
        {matches && matches.length > 0 && (
          <section className={CARD} aria-label={t("simpleHome.recentStep")}>
            <p className={STEP}>{t("simpleHome.recentStep")}</p>
            <h2 className="text-xl font-bold text-white">
              {t("simpleHome.recentTitle", { count: matches.length })}
            </h2>
            <div className="flex gap-8">
              <div>
                <p className="text-3xl font-bold text-white tabular-nums">
                  {wins} – {matches.length - wins}
                </p>
                <p className="text-xs text-white/50">{t("simpleHome.winsLosses")}</p>
              </div>
              {rankTier && (
                <div>
                  <p className="text-3xl font-bold text-white capitalize">{rankTier.toLowerCase()}</p>
                  <p className="text-xs text-white/50">{t("simpleHome.rank")}</p>
                </div>
              )}
            </div>
            {best && bestChamp && (
              <p className="text-sm text-white/65">
                {t("simpleHome.best", { name: bestChamp.name, wins: best.wins, games: best.games })}
              </p>
            )}
          </section>
        )}

        <section className={`${CARD} flex-1`} aria-label={t("simpleHome.autoStep")}>
          <p className={STEP}>{t("simpleHome.autoStep")}</p>
          <h2 className="text-xl font-bold text-white">{t("simpleHome.autoTitle")}</h2>
          <p className="text-sm text-white/60">{t("simpleHome.autoIntro")}</p>
          <ol className="text-sm text-white/70 space-y-1 list-decimal list-inside">
            <li>{t("simpleHome.autoDraft")}</li>
            <li>{t("simpleHome.autoGame")}</li>
            <li>{t("simpleHome.autoAfter")}</li>
          </ol>
          <button
            type="button"
            onClick={onShowDetails}
            className="self-start mt-auto text-xs text-white/60 hover:text-white border border-dashed border-border-strong rounded-full px-4 py-1.5 transition"
          >
            {t("simple.moreDetails")}
          </button>
        </section>
      </div>
    </div>
  );
}
