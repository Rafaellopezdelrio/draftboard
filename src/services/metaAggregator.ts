import { getDb, isTauri } from "../db/client";
import { buildBatchInserts } from "../db/batchInsert";
import {
  getMasterLeague,
  getMatchFull,
  getMatchTimeline,
  getRecentMatchIds,
  getPuuidBySummonerId,
  type RiotConfig,
  type Region,
  type MatchFull,
  type MatchTimeline,
} from "./riotApi";

// Regions to pull from when "multi-region" mode is enabled. Combines KR, EUW, NA
// for a balanced global meta sample (KR=tactical, EUW=micro, NA=mixed).
export const MULTI_REGIONS: Region[] = ["kr", "euw1", "na1"];

export interface AggregateProgress {
  phase: string;
  done: number;
  total: number;
}

// Aggregation parameters — bigger sample = better signal, slower sync.
// Tuned for ~10-15 min full sync respecting Riot rate limits (100req/2min).
// Bigger sample → tier list more closely matches op.gg / u.gg.
// 150 × 10 = 1500 matches × 10 participants each = up to 15k champion-role
// data points per sync (with dedup ~3-5k after Riot's overlap cleaning).
const SAMPLE_SUMMONERS = 150;
const MATCHES_PER_SUMMONER = 10;

/**
 * Multi-region aggregation: runs aggregateFromMaster across KR + EUW + NA
 * sequentially (rate-limit friendly) and merges results under a single patch
 * label "global-<patch>".
 */
export async function aggregateMultiRegion(
  baseCfg: RiotConfig,
  patch: string,
  onProgress: (p: AggregateProgress) => void
): Promise<void> {
  for (let i = 0; i < MULTI_REGIONS.length; i++) {
    const region = MULTI_REGIONS[i];
    onProgress({
      phase: `Región ${region.toUpperCase()} (${i + 1}/${MULTI_REGIONS.length})`,
      done: 0,
      total: 1,
    });
    try {
      const cfg: RiotConfig = { ...baseCfg, region };
      await aggregateFromMaster(cfg, `${patch}-${region}`, (p) =>
        onProgress({
          phase: `${region.toUpperCase()}: ${p.phase}`,
          done: p.done,
          total: p.total,
        })
      );
    } catch (e) {
      // Continue with next region if one fails (likely rate limit)
      onProgress({
        phase: `Región ${region} falló: ${String(e).slice(0, 60)}`,
        done: 0,
        total: 1,
      });
    }
  }
  onProgress({ phase: "Multi-región completado", done: 1, total: 1 });
}

/**
 * Downloads a sample of Master+ ranked solo matches and aggregates them into:
 * - meta_aggregate (tier per champion+role)
 * - counter_aggregate (matchup winrates)
 * - build_aggregate (final 6-item builds)
 * - rune_aggregate (rune pages)
 * - skill_order_aggregate (first 3 + max order)
 *
 * Designed to be re-run every 12-24h. Uses ON CONFLICT to upsert.
 */
export async function aggregateFromMaster(
  cfg: RiotConfig,
  patch: string,
  onProgress: (p: AggregateProgress) => void
): Promise<void> {
  if (!isTauri()) return;
  const db = await getDb();
  const now = Date.now();

  onProgress({ phase: "Listando Master league", done: 0, total: 1 });
  const league = await getMasterLeague(cfg);
  const sample = league.entries.slice(0, SAMPLE_SUMMONERS);

  // Resolve PUUIDs
  onProgress({ phase: "Resolviendo cuentas", done: 0, total: sample.length });
  const puuids: string[] = [];
  for (let i = 0; i < sample.length; i++) {
    try {
      const puuid = await getPuuidBySummonerId(cfg, sample[i].summonerId);
      puuids.push(puuid);
    } catch {
      // skip
    }
    onProgress({ phase: "Resolviendo cuentas", done: i + 1, total: sample.length });
  }

  // Collect unique match IDs
  const matchIds = new Set<string>();
  onProgress({ phase: "Listando partidas", done: 0, total: puuids.length });
  for (let i = 0; i < puuids.length; i++) {
    try {
      const ids = await getRecentMatchIds(cfg, puuids[i], MATCHES_PER_SUMMONER);
      ids.forEach((id) => matchIds.add(id));
    } catch {
      // skip
    }
    onProgress({ phase: "Listando partidas", done: i + 1, total: puuids.length });
  }

  // Fetch full match + timeline
  const ids = Array.from(matchIds);
  const matches: { full: MatchFull; tl: MatchTimeline }[] = [];
  onProgress({ phase: "Descargando partidas", done: 0, total: ids.length });
  for (let i = 0; i < ids.length; i++) {
    try {
      const [full, tl] = await Promise.all([
        getMatchFull(cfg, ids[i]),
        getMatchTimeline(cfg, ids[i]),
      ]);
      // Only ranked solo (queueId 420)
      if (full.queueId === 420) matches.push({ full, tl });
    } catch {
      // skip
    }
    onProgress({ phase: "Descargando partidas", done: i + 1, total: ids.length });
  }

  // Aggregate
  onProgress({ phase: "Agregando", done: 0, total: matches.length });
  const meta = new Map<string, { games: number; wins: number }>();
  const counters = new Map<string, { games: number; wins: number }>();
  const builds = new Map<string, { games: number; wins: number }>();
  const runes = new Map<
    string,
    { games: number; wins: number; perks: string; shards: string; primary: number; sub: number; champ: number; pos: string }
  >();
  const skills = new Map<
    string,
    { games: number; wins: number; first3: string; maxOrder: string; champ: number; pos: string }
  >();

  for (const { full, tl } of matches) {
    const team100 = full.participants.filter((p) => p.teamId === 100);
    const team200 = full.participants.filter((p) => p.teamId === 200);

    for (const p of full.participants) {
      const key = `${p.championId}|${p.position}`;
      const m = meta.get(key) ?? { games: 0, wins: 0 };
      m.games++;
      if (p.win) m.wins++;
      meta.set(key, m);

      // Counters: same role on enemy team
      const enemyTeam = p.teamId === 100 ? team200 : team100;
      for (const e of enemyTeam) {
        if (e.position !== p.position) continue;
        const ck = `${p.championId}|${e.championId}|${p.position}`;
        const c = counters.get(ck) ?? { games: 0, wins: 0 };
        c.games++;
        if (p.win) c.wins++;
        counters.set(ck, c);
      }

      // Builds: full final items, sorted, joined
      const items = [...p.items].filter((x) => x > 0).sort().join(",");
      if (items.length > 0) {
        const bk = `${p.championId}|${p.position}|${items}`;
        const b = builds.get(bk) ?? { games: 0, wins: 0 };
        b.games++;
        if (p.win) b.wins++;
        builds.set(bk, b);
      }

      // Runes
      const perksObj = p.perks as
        | {
            statPerks?: { offense: number; flex: number; defense: number };
            styles?: Array<{
              style: number;
              description: string;
              selections: Array<{ perk: number }>;
            }>;
          }
        | undefined;
      if (perksObj?.styles) {
        const primary = perksObj.styles.find((s) => s.description === "primaryStyle");
        const sub = perksObj.styles.find((s) => s.description === "subStyle");
        if (primary && sub) {
          const perks = [
            ...primary.selections.map((s) => s.perk),
            ...sub.selections.map((s) => s.perk),
          ].join(",");
          const shards = perksObj.statPerks
            ? `${perksObj.statPerks.offense},${perksObj.statPerks.flex},${perksObj.statPerks.defense}`
            : "";
          const rk = `${p.championId}|${p.position}|${primary.style}|${sub.style}|${perks}`;
          const r = runes.get(rk) ?? {
            games: 0,
            wins: 0,
            perks,
            shards,
            primary: primary.style,
            sub: sub.style,
            champ: p.championId,
            pos: p.position,
          };
          r.games++;
          if (p.win) r.wins++;
          runes.set(rk, r);
        }
      }
    }

    // Skill orders from timeline
    const skillsByPid = new Map<number, number[]>();
    for (const f of tl.frames) {
      for (const ev of f.events) {
        if (ev.type !== "SKILL_LEVEL_UP") continue;
        const e = ev as Extract<typeof ev, { type: "SKILL_LEVEL_UP" }>;
        const arr = skillsByPid.get(e.participantId) ?? [];
        arr.push(e.skillSlot);
        skillsByPid.set(e.participantId, arr);
      }
    }
    for (const p of full.participants) {
      const order = skillsByPid.get(p.participantId);
      if (!order || order.length < 3) continue;
      const first3 = order.slice(0, 3).join("");
      const maxOrder = computeMaxOrder(order);
      const sk = `${p.championId}|${p.position}|${first3}|${maxOrder}`;
      const s = skills.get(sk) ?? {
        games: 0,
        wins: 0,
        first3,
        maxOrder,
        champ: p.championId,
        pos: p.position,
      };
      s.games++;
      if (p.win) s.wins++;
      skills.set(sk, s);
    }
  }

  // Total games drives pick-rate (games for a champ ÷ total games sampled).
  const totalGamesAll = matches.length;

  onProgress({ phase: "Guardando", done: 0, total: 1 });

  // Per table: clear the current patch, then re-insert as a few multi-row
  // statements (see db/batchInsert). tauri-plugin-sql can't reliably hold a
  // BEGIN/COMMIT across execute() calls (pooled connections), so batching is
  // how we get both speed (≈N/chunk round trips instead of N) and a much
  // smaller partial-write window if a sync is interrupted.
  const runInserts = async (table: string, columns: string[], rows: unknown[][]) => {
    await db.execute(`DELETE FROM ${table} WHERE patch = $1`, [patch]);
    for (const chunk of buildBatchInserts(table, columns, rows)) {
      await db.execute(chunk.sql, chunk.params);
    }
  };

  const metaRows: unknown[][] = [];
  for (const [k, v] of meta) {
    const [championId, position] = k.split("|");
    const wr = v.games > 0 ? v.wins / v.games : 0;
    const pickRate = v.games / Math.max(1, totalGamesAll);
    metaRows.push([Number(championId), position, v.games, v.wins, wr, pickRate, 0, patch, now]);
  }
  await runInserts(
    "meta_aggregate",
    ["champion_id", "position", "games", "wins", "win_rate", "pick_rate", "ban_rate", "patch", "updated_ts_ms"],
    metaRows
  );

  const counterRows: unknown[][] = [];
  for (const [k, v] of counters) {
    if (v.games < 3) continue;
    const [a, b, pos] = k.split("|");
    counterRows.push([Number(a), Number(b), pos, v.games, v.wins, v.wins / v.games, patch, now]);
  }
  await runInserts(
    "counter_aggregate",
    ["champion_id", "vs_champion_id", "position", "games", "wins", "win_rate", "patch", "updated_ts_ms"],
    counterRows
  );

  const buildRows: unknown[][] = [];
  for (const [k, v] of builds) {
    if (v.games < 2) continue;
    const [champ, pos, items] = k.split("|");
    buildRows.push([Number(champ), pos, items, v.games, v.wins, patch, now]);
  }
  await runInserts(
    "build_aggregate",
    ["champion_id", "position", "item_ids", "games", "wins", "patch", "updated_ts_ms"],
    buildRows
  );

  const runeRows: unknown[][] = [];
  for (const v of runes.values()) {
    if (v.games < 2) continue;
    runeRows.push([v.champ, v.pos, v.primary, v.sub, v.perks, v.shards, v.games, v.wins, patch, now]);
  }
  await runInserts(
    "rune_aggregate",
    ["champion_id", "position", "primary_style", "sub_style", "perks", "shards", "games", "wins", "patch", "updated_ts_ms"],
    runeRows
  );

  const skillRows: unknown[][] = [];
  for (const v of skills.values()) {
    if (v.games < 2) continue;
    skillRows.push([v.champ, v.pos, v.first3, v.maxOrder, v.games, v.wins, patch, now]);
  }
  await runInserts(
    "skill_order_aggregate",
    ["champion_id", "position", "first_three", "max_order", "games", "wins", "patch", "updated_ts_ms"],
    skillRows
  );

  await db.execute(
    `INSERT INTO aggregation_meta (key, value) VALUES ('last_run', $1)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(now)]
  );

  onProgress({ phase: "Listo", done: 1, total: 1 });
}

function computeMaxOrder(skillOrder: number[]): string {
  // Count first level-up of each skill 1-4 in level-up sequence
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const s of skillOrder) counts[s] = (counts[s] ?? 0) + 1;
  // Drop ult, sort by count desc
  const ranked = [1, 2, 3]
    .map((s) => ({ s, c: counts[s] ?? 0 }))
    .sort((a, b) => b.c - a.c)
    .map((x) => x.s);
  return ranked.join("");
}
