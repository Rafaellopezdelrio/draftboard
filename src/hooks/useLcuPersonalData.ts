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

interface LcuPersonalData {
  masteries: ChampionMasteryDto[];
  rankTier: string | null;
}

/** Refetches on every `lcuConnected` transition. Cheap — single LCU call
 * + cached Riot fallback only when LCU misses. */
export function useLcuPersonalData(lcuConnected: boolean): LcuPersonalData {
  const [masteries, setMasteries] = useState<ChampionMasteryDto[]>([]);
  const [rankTier, setRankTier] = useState<string | null>(null);

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
      let tier: string | null = (await lcuRank())?.tier ?? null;
      if (cancelled) return;
      if (!tier && hasRiotAccess) {
        try {
          const entries = await getLeagueEntriesByPuuid(cfg!, cfg!.puuid!);
          if (cancelled) return;
          tier = entries.find((e) => e.queueType === "RANKED_SOLO_5x5")?.tier ?? null;
        } catch {
          // no rank available — fall through to null
        }
      }
      if (cancelled) return;
      if (tier) {
        setCoachEloBucket(tier);
        setRankTier(tier);
      } else {
        setRankTier(null);
      }

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
  }, [lcuConnected]);

  return { masteries, rankTier };
}
