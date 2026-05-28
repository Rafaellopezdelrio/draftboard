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
import { getTopMasteries, type ChampionMasteryDto } from "../services/riotApi";
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
      // ── Masteries: LCU first (no key needed), Riot API fallback ──
      const fromLcu = await lcuMasteries();
      if (cancelled) return;
      if (fromLcu.length > 0) {
        setMasteries(fromLcu);
      } else {
        const cfg = await loadSettings();
        if (cancelled) return;
        if (cfg?.puuid && cfg.apiKey) {
          getTopMasteries(cfg, cfg.puuid, 20)
            .then((m) => {
              if (!cancelled) setMasteries(m);
            })
            .catch(() => {});
        }
      }

      // ── Rank: feeds coach calibration + suggestion engine ──
      const rank = await lcuRank();
      if (cancelled) return;
      if (rank) {
        setCoachEloBucket(rank.tier);
        setRankTier(rank.tier);
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
