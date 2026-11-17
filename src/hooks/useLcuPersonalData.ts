// Personal data pull from the LCU (masteries + rank) with Riot-API
// fallback. Runs whenever the LCU connection state flips — so reopening
// the client mid-session picks up the latest mastery / rank without an
// app restart.
//
// Also tags Sentry events with an anonymised PUUID hash so we can group
// "this same person hit this same bug" across sessions without ever
// learning who they are. Raw PUUID never leaves the device.
//
// Extracted from App.tsx so the layout shell stays focused on layout.

import { useEffect, useState } from "react";
import { lcuMasteries, lcuRank } from "../services/lcuPersonalData";
import { loadSettings } from "../services/settingsRepo";
import {
  getTopMasteries,
  getLeagueEntriesByPuuid,
  getRiotProxyUrl,
  type ChampionMasteryDto,
} from "../services/riotApi";
import { setCoachEloBucket } from "../engine/coachEngine";

/** Solo-queue rank as shown to the player. */
export interface SoloRank {
  tier: string;
  division: string;
  lp: number;
}

/** null = not known (client closed, never seen); "unranked" = known to have
 * no solo-queue rank. */
export type RankState = SoloRank | "unranked" | null;

interface LcuPersonalData {
  masteries: ChampionMasteryDto[];
  rankTier: string | null;
  rank: RankState;
}

const LAST_RANK_KEY = "draftboard:last-solo-rank";

function saveLastRank(rank: SoloRank | "unranked"): void {
  try {
    localStorage.setItem(LAST_RANK_KEY, JSON.stringify(rank));
  } catch {
    // storage unavailable: nothing to remember
  }
}

function loadLastRank(): RankState {
  try {
    const raw = localStorage.getItem(LAST_RANK_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    if (v === "unranked") return v;
    if (v && typeof v === "object" && typeof (v as SoloRank).tier === "string") {
      const r = v as SoloRank;
      return { tier: r.tier, division: String(r.division ?? ""), lp: Number(r.lp) || 0 };
    }
  } catch {
    // unreadable: treat as unknown
  }
  return null;
}

/** Refetches on every `lcuConnected` transition and whenever `refreshKey`
 * changes (the caller flips it around the end of a game, so the LP shown is
 * the new one). Cheap — single LCU call + Riot fallback only when LCU misses. */
export function useLcuPersonalData(lcuConnected: boolean, refreshKey: string | null = null): LcuPersonalData {
  const [masteries, setMasteries] = useState<ChampionMasteryDto[]>([]);
  const [rank, setRank] = useState<RankState>(null);

  useEffect(() => {
    // Guard against stale writes: if lcuConnected flips again (or the
    // component unmounts) before these awaits resolve, an older run must
    // not clobber state set by a newer one. Flip `cancelled` in cleanup
    // and bail before every setState.
    let cancelled = false;
    (async () => {
      // Riot fallback is available when a personal key OR the shared proxy is
      // configured — most users run proxy-only (no personal key), so gating on
      // apiKey alone left them with NO masteries/rank when the client is closed.
      const cfg = await loadSettings();
      if (cancelled) return;
      const hasRiotAccess = !!cfg?.puuid && (!!cfg.apiKey || !!getRiotProxyUrl());

      // ── Masteries: LCU first (no key needed), Riot API fallback ──
      const fromLcu = await lcuMasteries();
      if (cancelled) return;
      if (fromLcu.length > 0) {
        setMasteries(fromLcu);
      } else if (hasRiotAccess) {
        getTopMasteries(cfg!, cfg!.puuid!, 20)
          .then((m) => {
            if (!cancelled) setMasteries(m);
          })
          .catch(() => {});
      }

      // ── Rank: feeds coach calibration + suggestion engine + benchmarks ──
      // LCU first, Riot API fallback (solo-queue tier) so the rank-dependent
      // features use the real bracket instead of defaults when LoL is closed.
      const fromClient = await lcuRank().catch(() => null);
      let next: RankState = null;
      if (fromClient)
        next = isRanked(fromClient.tier)
          ? { tier: fromClient.tier, division: fromClient.division, lp: fromClient.leaguePoints }
          : "unranked";
      if (cancelled) return;
      if (!next && hasRiotAccess) {
        try {
          const entries = await getLeagueEntriesByPuuid(cfg!, cfg!.puuid!);
          if (cancelled) return;
          const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");
          next = solo && isRanked(solo.tier) ? { tier: solo.tier, division: solo.rank, lp: solo.leaguePoints } : "unranked";
        } catch {
          // no rank available — fall through to the last one seen
        }
      }
      if (cancelled) return;
      // Client closed and no Riot access (e.g. a fresh install): show the last
      // rank seen instead of nothing.
      if (next) saveLastRank(next);
      else next = loadLastRank();
      if (next && next !== "unranked") setCoachEloBucket(next.tier);
      setRank(next);

      // ── Sentry anonymous user grouping ──
      // Tag events with hash(PUUID) so dashboard issues can group
      // "this user keeps hitting bug X" without storing identity.
      try {
        const { getCurrentSummoner } = await import("../services/lcuService");
        const me = await getCurrentSummoner();
        if (cancelled) return;
        if (me?.puuid) {
          const { setSentryAnonUser } = await import("../services/sentry");
          setSentryAnonUser(me.puuid);
        }
      } catch {
        // LCU offline — Sentry user stays unset.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lcuConnected, refreshKey]);

  return { masteries, rankTier: rank && rank !== "unranked" ? rank.tier : null, rank };
}

/** The client reports unranked players with an empty tier or "NONE". */
function isRanked(tier: string | undefined): tier is string {
  return !!tier && tier.toUpperCase() !== "NONE";
}
