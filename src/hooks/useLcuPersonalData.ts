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

interface LcuPersonalData {
  masteries: ChampionMasteryDto[];
  rankTier: string | null;
  rank: SoloRank | null;
}

/** Refetches on every `lcuConnected` transition and whenever `refreshKey`
 * changes (the caller flips it around the end of a game, so the LP shown is
 * the new one). Cheap — single LCU call + Riot fallback only when LCU misses. */
export function useLcuPersonalData(lcuConnected: boolean, refreshKey: string | null = null): LcuPersonalData {
  const [masteries, setMasteries] = useState<ChampionMasteryDto[]>([]);
  const [rank, setRank] = useState<SoloRank | null>(null);

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
      let next: SoloRank | null =
        fromClient && isRanked(fromClient.tier)
          ? { tier: fromClient.tier, division: fromClient.division, lp: fromClient.leaguePoints }
          : null;
      if (cancelled) return;
      if (!next && hasRiotAccess) {
        try {
          const entries = await getLeagueEntriesByPuuid(cfg!, cfg!.puuid!);
          if (cancelled) return;
          const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");
          if (solo && isRanked(solo.tier)) next = { tier: solo.tier, division: solo.rank, lp: solo.leaguePoints };
        } catch {
          // no rank available — fall through to null
        }
      }
      if (cancelled) return;
      if (next) setCoachEloBucket(next.tier);
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

  return { masteries, rankTier: rank?.tier ?? null, rank };
}

/** The client reports unranked players with an empty tier or "NONE". */
function isRanked(tier: string | undefined): tier is string {
  return !!tier && tier.toUpperCase() !== "NONE";
}
