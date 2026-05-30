// Draft-outcome tracking. Records every champ select you complete (your
// picks/bans + the suggestion the engine gave + whether you followed it) and
// links it to the match that resulted, so we can answer the question that
// validates the whole product: "does following the suggestion correlate with
// winning?"
//
// The `drafts` table shipped in migration 001 but was never wired — this is
// the repo half. Writes come from useDraftLogger (on lock-in); the match link
// is set by personalDataSync after a match syncs.

import { getDb, isTauri } from "../db/client";

export interface DraftRecord {
  id?: number;
  tsMs: number;
  allyKeys: string[];
  enemyKeys: string[];
  bannedKeys: string[];
  pickedKey: string | null;
  suggestedKeys: string[];
  followedSuggestion: boolean;
  matchId: string | null;
}

/** Persist a completed draft (match_id starts NULL — linked later). Returns
 *  the new row id, or 0 outside Tauri. */
export async function saveDraft(
  d: Omit<DraftRecord, "id" | "matchId">
): Promise<number> {
  if (!isTauri()) return 0;
  const db = await getDb();
  const r = await db.execute(
    `INSERT INTO drafts
       (ts_ms, ally_keys, enemy_keys, banned_keys, picked_key, suggested_keys, followed_suggestion, match_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NULL)`,
    [
      d.tsMs,
      d.allyKeys.join(","),
      d.enemyKeys.join(","),
      d.bannedKeys.join(","),
      d.pickedKey,
      d.suggestedKeys.join(","),
      d.followedSuggestion ? 1 : 0,
    ]
  );
  return Number(r.lastInsertId ?? 0);
}

/**
 * Link the most recent UNLINKED draft to a freshly-synced match. We match on
 * the champion played + a 2h window ending at the match's end timestamp (the
 * draft happens ~20-40min before the game ends). Conservative: only one draft
 * is linked per match, the newest qualifying one.
 */
export async function linkDraftToMatch(
  matchId: string,
  championId: number,
  matchEndTsMs: number
): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  const windowMs = 2 * 60 * 60 * 1000;
  await db.execute(
    `UPDATE drafts SET match_id = $1
     WHERE id = (
       SELECT id FROM drafts
       WHERE match_id IS NULL
         AND picked_key = $2
         AND ts_ms <= $3 AND ts_ms >= $4
       ORDER BY ts_ms DESC
       LIMIT 1
     )`,
    [matchId, String(championId), matchEndTsMs, matchEndTsMs - windowMs]
  );
}

export interface AdviceStats {
  followedGames: number;
  followedWins: number;
  notFollowedGames: number;
  notFollowedWins: number;
}

/** Win rate when you followed the top suggestion vs when you didn't, over the
 *  drafts that have been linked to a match outcome. */
export async function draftAdviceStats(): Promise<AdviceStats> {
  const empty: AdviceStats = {
    followedGames: 0,
    followedWins: 0,
    notFollowedGames: 0,
    notFollowedWins: 0,
  };
  if (!isTauri()) return empty;
  const db = await getDb();
  const rows = await db.select<Array<{ followed: number; win: number; n: number }>>(
    `SELECT d.followed_suggestion AS followed, m.win AS win, COUNT(*) AS n
     FROM drafts d
     JOIN matches m ON d.match_id = m.match_id
     GROUP BY d.followed_suggestion, m.win`
  );
  const s = { ...empty };
  for (const r of rows) {
    if (r.followed === 1) {
      s.followedGames += r.n;
      if (r.win === 1) s.followedWins += r.n;
    } else {
      s.notFollowedGames += r.n;
      if (r.win === 1) s.notFollowedWins += r.n;
    }
  }
  return s;
}

export async function recentDrafts(limit = 50): Promise<DraftRecord[]> {
  if (!isTauri()) return [];
  const db = await getDb();
  const rows = await db.select<
    Array<{
      id: number;
      ts_ms: number;
      ally_keys: string;
      enemy_keys: string;
      banned_keys: string;
      picked_key: string | null;
      suggested_keys: string;
      followed_suggestion: number;
      match_id: string | null;
    }>
  >(`SELECT * FROM drafts ORDER BY ts_ms DESC LIMIT $1`, [limit]);
  const split = (s: string) => (s ? s.split(",").filter(Boolean) : []);
  return rows.map((r) => ({
    id: r.id,
    tsMs: r.ts_ms,
    allyKeys: split(r.ally_keys),
    enemyKeys: split(r.enemy_keys),
    bannedKeys: split(r.banned_keys),
    pickedKey: r.picked_key,
    suggestedKeys: split(r.suggested_keys),
    followedSuggestion: r.followed_suggestion === 1,
    matchId: r.match_id,
  }));
}
