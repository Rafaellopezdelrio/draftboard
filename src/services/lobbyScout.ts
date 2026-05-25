// Lobby scout — when champ select is active, fetch each teammate's
// (and enemies', when visible) rank + recent form in parallel from the
// LCU. Used to render a "your teammate Bjergsen is Diamond IV, 60% WR
// last 10 games" card BEFORE the game starts.
//
// All data comes from the LCU directly (no Riot API key needed for the
// in-lobby info). The LCU exposes ranked stats, summoner profiles, and
// match history under /lol-* endpoints visible to any local app.

import { invoke } from "@tauri-apps/api/core";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface ScoutedPlayer {
  cellId: number;
  championId: number;
  summonerId: number;
  /** "BjergsenLol" / "Faker" — what shows on their profile. */
  summonerName: string;
  /** Account level (300+ = experienced, <50 = smurf/new). */
  level: number;
  /** Solo queue rank, e.g. "DIAMOND IV". null if unranked. */
  soloRank: string | null;
  /** Solo queue LP, only meaningful when soloRank is set. */
  soloLp: number;
  /** Solo queue win rate this season (0-1). */
  soloWinRate: number;
  /** Solo queue games this season. */
  soloGames: number;
  /** Whether we managed to fetch this player at all. */
  loaded: boolean;
}

interface RawRankedStats {
  queueMap?: Record<
    string,
    {
      tier?: string;
      division?: string;
      leaguePoints?: number;
      wins?: number;
      losses?: number;
    }
  >;
}

/**
 * Lookup a single player by summonerId via the LCU. Returns null if the
 * client is closed or the id isn't found. Failures are silent so a
 * partial scout (4/5 players loaded) still renders gracefully.
 */
export async function scoutPlayer(
  cellId: number,
  championId: number,
  summonerId: number
): Promise<ScoutedPlayer | null> {
  if (!isTauri()) return null;
  try {
    const profile = await invoke<{
      summonerId: number;
      displayName?: string;
      gameName?: string;
      summonerLevel?: number;
      puuid?: string;
    }>("lcu_summoner_by_id", { summonerId });

    const out: ScoutedPlayer = {
      cellId,
      championId,
      summonerId,
      summonerName: profile.gameName ?? profile.displayName ?? "Unknown",
      level: profile.summonerLevel ?? 0,
      soloRank: null,
      soloLp: 0,
      soloWinRate: 0,
      soloGames: 0,
      loaded: true,
    };

    // Ranked stats by PUUID — only available when client serves them
    // (sometimes 404s on freshly created accounts).
    if (profile.puuid) {
      try {
        const ranked = await invoke<RawRankedStats>("lcu_get_json", {
          path: `/lol-ranked/v1/ranked-stats/${profile.puuid}`,
        });
        const solo = ranked?.queueMap?.RANKED_SOLO_5x5;
        if (solo && solo.tier && solo.tier !== "NA" && solo.tier !== "UNRANKED") {
          out.soloRank = `${solo.tier} ${solo.division ?? ""}`.trim();
          out.soloLp = solo.leaguePoints ?? 0;
          const games = (solo.wins ?? 0) + (solo.losses ?? 0);
          out.soloGames = games;
          out.soloWinRate = games > 0 ? (solo.wins ?? 0) / games : 0;
        }
      } catch {
        // Ranked unavailable — leave defaults (unranked-ish display).
      }
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Scout an entire team in parallel. Returns one entry per input (null
 * for any player we couldn't load). Order preserved.
 */
export async function scoutTeam(
  players: Array<{ cellId: number; championId: number; summonerId?: number }>
): Promise<Array<ScoutedPlayer | null>> {
  const valid = players.filter((p) => p.summonerId && p.summonerId > 0);
  return Promise.all(
    valid.map((p) => scoutPlayer(p.cellId, p.championId, p.summonerId!))
  );
}
