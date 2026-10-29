import { useEffect, useRef } from "react";
import { usePrefsStore } from "./prefsStore";
import { useDraftStore } from "./draftStore";
import {
  applyRunesResult,
  applySummonerSpells,
  pushItemSet,
  type RunePageInput,
} from "../services/lcuService";
import { emitFetchFailure } from "../services/fetchNotify";
import { i18n } from "../i18n";
import { loadAggregatedRunes } from "../services/aggregateRepo";
import { fetchOpggBuild, pickBestBuild, pickMostPopular } from "../services/opggBuilds";
import { fetchLolvvvBuild } from "../services/lolvvvBuilds";
import { isLegalRunePage, opggRunesToPage, runePageName } from "../services/runePages";
import { pickCoherentSpells } from "../services/spellCoherence";
import type { Champion, ChampionDb, Role } from "../types/champion";

interface Args {
  db: ChampionDb | null;
}

/**
 * Listens to draft events from the LCU and triggers auto-actions
 * gated by user preferences.
 */
export function useAutoActions({ db }: Args) {
  const prefs = usePrefsStore((s) => s.prefs);
  const myRole = useDraftStore((s) => s.myRole);
  const intent = useDraftStore((s) => s.myChampionIntent);
  const locked = useDraftStore((s) => s.myChampionLocked);

  // Dedup key (`champKey:role`) for the rune auto-apply. Without it the same
  // page gets pushed twice: once by the hover effect and once by the lock
  // handler for the same champion (concurrent LCU writes), and again every
  // time a hover flickers (hover → unhover → re-hover). Reset when the local
  // selection clears so the NEXT champ select re-applies even for the same
  // champ. A ref (not module-global) keeps it per-hook-instance + test-clean.
  const lastRunesRef = useRef<string | null>(null);
  const runeQueueRef = useRef<RuneQueue>({ gen: 0, tail: Promise.resolve() });
  // A failed apply clears the dedup key so the lock can try again.
  const clearRuneKey = () => {
    lastRunesRef.current = null;
  };

  // On hover (intent), optionally pre-apply runes (disabled in safe mode).
  useEffect(() => {
    // Once locked, the lock handler owns rune application — the hover effect
    // must not also fire for the same champ (was the double-write race).
    if (locked) return;
    if (prefs.safeMode || !prefs.autoApplyOnHover || !intent || !myRole || !db) return;
    const key = `${intent}:${myRole}`;
    if (lastRunesRef.current === key) return;
    lastRunesRef.current = key;
    queueRuneApply(runeQueueRef.current, db, intent, myRole, clearRuneKey);
    // clearRuneKey only touches a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.safeMode, prefs.autoApplyOnHover, intent, locked, myRole, db]);

  // Clear the dedup key when the local selection is fully cleared (left champ
  // select / new draft) so re-picking the same champion re-applies its runes.
  useEffect(() => {
    if (!intent && !locked) {
      lastRunesRef.current = null;
      // Left champ select / dodged: cancel any rune write still in flight.
      runeQueueRef.current.gen++;
    }
  }, [intent, locked]);

  // On lock, optionally apply runes/spells/items (disabled in safe mode).
  useEffect(() => {
    if (!db) return;
    const handler = (e: Event) => {
      if (prefs.safeMode) return;
      const detail = (e as CustomEvent<{ championKey: string }>).detail;
      if (!detail?.championKey) return;
      // Read role LIVE from the store, not from this effect's closure: the
      // lock event is dispatched synchronously from lcuSync (outside React's
      // render cycle), so a fast role+lock frame could fire before this effect
      // re-subscribed with the new role → wrong-role runes/spells/items.
      const role = useDraftStore.getState().myRole;
      if (!role) return;
      if (prefs.autoApplyRunes) {
        const key = `${detail.championKey}:${role}`;
        if (lastRunesRef.current !== key) {
          lastRunesRef.current = key;
          queueRuneApply(runeQueueRef.current, db, detail.championKey, role, clearRuneKey);
        }
      }
      // Spells are gated by their own pref so the user can pick runes-only,
      // spells-only, or both. We read champ.id (data-dragon name) because
      // op.gg's build endpoint expects UPPER_SNAKE_CASE names, not Riot
      // numeric keys.
      if (prefs.autoApplySpells) {
        const champ = db.champions[detail.championKey];
        if (champ) applySpells(champ, role as Role);
      }
      if (prefs.autoApplyItemSet) {
        const champ = db.champions[detail.championKey];
        if (champ) applyItemSet(champ, role as Role);
      }
    };
    window.addEventListener("draft:champion-locked", handler);
    return () => window.removeEventListener("draft:champion-locked", handler);
  }, [
    prefs.safeMode,
    prefs.autoApplyRunes,
    prefs.autoApplySpells,
    prefs.autoApplyItemSet,
    db,
  ]);
}

/**
 * Build the item-set title that gets pushed to the LCU. Format is
 * intentionally rigid: "Draftboard - {ChampionName}" — the "Draftboard"
 * prefix is how the user identifies OUR set in the in-game shop
 * sidebar vs sets from other tools (Blitz, op.gg desktop, manual
 * uploads). Tests pin this format so a refactor can't silently rename it.
 *
 * Exported so the test file can assert on the format directly.
 */
export function buildItemSetTitle(championName: string): string {
  return `Draftboard - ${championName}`;
}

async function applySpells(champion: Champion, role: Role) {
  try {
    const build = await fetchOpggBuild(champion.id, role);
    // Pass op.gg's dominant pair (may be undefined) through the coherence
    // layer so jungle gets Smite, supports get Exhaust where appropriate,
    // etc. — same logic as the visible Build Panel uses.
    const coherent = pickCoherentSpells(
      champion,
      role,
      build?.summonerSpells?.[0]?.ids
    );
    await applySummonerSpells(coherent.ids[0], coherent.ids[1]);
  } catch {
    // silent — auto-apply must never throw or interrupt UX
  }
}

/**
 * Build and push a 3-block item set (Starter / Core / Final) to the LCU
 * so it appears in the in-game shop. Items come from the same op.gg
 * build the visible BuildPanel renders — we just structure them into
 * the LCU's expected blocks shape.
 */
async function applyItemSet(champion: Champion, role: Role) {
  try {
    const build = await fetchOpggBuild(champion.id, role);
    if (!build) return;
    const starter = pickBestBuild(build.starterItems);
    const boots = pickBestBuild(build.boots);
    const core = pickBestBuild(build.coreItems);
    const fourth = pickBestBuild(build.fourthItems);
    const fifth = pickBestBuild(build.fifthItems);
    const sixth = pickBestBuild(build.sixthItems);
    // Block names — kept SHORT (max 8 chars) because LoL's in-game
    // item shop sidebar has a narrow column that truncates anything
    // longer. Previously used "Starter/Boots/Core/Situational" — the
    // sidebar showed "...ter, ots, e, uational" with the actual labels
    // hidden. Short ES strings stay fully readable.
    const blocks: Array<{ type: string; items: Array<{ id: number; count?: number }> }> = [];
    if (starter && starter.ids.length > 0) {
      blocks.push({
        type: "Inicio",
        items: starter.ids.map((id) => ({ id, count: id === 2003 ? 3 : 1 })),
      });
    }
    if (boots && boots.ids.length > 0) {
      blocks.push({
        type: "Botas",
        items: boots.ids.map((id) => ({ id })),
      });
    }
    if (core && core.ids.length > 0) {
      blocks.push({
        type: "Core",
        items: core.ids.map((id) => ({ id })),
      });
    }
    const situational = [fourth, fifth, sixth]
      .filter(Boolean)
      .flatMap((b) => b!.ids);
    if (situational.length > 0) {
      blocks.push({
        type: "Finales",
        items: situational.map((id) => ({ id })),
      });
    }
    if (blocks.length === 0) return;
    // Title format is locked: "Draftboard - {Champion}". User-facing
    // identity (so the user recognises OUR set in the in-game shop
    // sidebar vs sets pushed by Blitz / op.gg desktop / etc). DO NOT
    // change this format without updating UID handling — same champion
    // overwriting is intentional, but a renamed set would orphan the
    // previous one in the user's saved sets list.
    await pushItemSet({
      championId: Number(champion.key),
      title: buildItemSetTitle(champion.name),
      blocks,
    });
  } catch {
    // silent
  }
}

/**
 * Pick the rune page to auto-apply: op.gg's most popular page first (the
 * same source the build panel and the spells/item-set auto-actions use),
 * then lolvvv's pro page, then the locally synced aggregate. The aggregate
 * used to be the ONLY source and is empty unless the user synced matches,
 * so auto-runes silently did nothing for almost everyone.
 */
export async function pickAutoRunePage(
  db: ChampionDb,
  championKey: string,
  role: Role
): Promise<RunePageInput | null> {
  const champ = db.champions[championKey];
  const label = `${champ?.name ?? championKey} ${role}`;
  if (champ) {
    const build = await fetchOpggBuild(champ.id, role).catch(() => null);
    const top = build ? pickMostPopular(build.runes) : null;
    const fromOpgg = top ? opggRunesToPage(top, label) : null;
    if (fromOpgg) return fromOpgg;

    const pro = await fetchLolvvvBuild(champ.id).catch(() => null);
    if (pro?.role === role && pro.runePage) {
      const { primaryStyleId, subStyleId, selectedPerkIds } = pro.runePage;
      return { name: runePageName(label), primaryStyleId, subStyleId, selectedPerkIds };
    }
  }
  const agg = await loadAggregatedRunes(db.patch, Number(championKey), role).catch(() => null);
  // The aggregate stores the 6 rune selections and the 3 shards apart; the
  // client needs all 9 in one list.
  if (!agg || agg.shards?.length !== 3) return null;
  if (!isLegalRunePage(agg.primaryStyle, agg.subStyle, agg.perks)) return null;
  return {
    name: runePageName(label),
    primaryStyleId: agg.primaryStyle,
    subStyleId: agg.subStyle,
    selectedPerkIds: [...agg.perks.slice(0, 6), ...agg.shards],
  };
}

/**
 * Rune applies wait on the network (op.gg, lolvvv) before writing to the
 * client, so two in flight — hover A then hover B, or a hover then a lock of
 * another champion — could land out of order and leave the wrong page.
 * Fetches run in parallel (a slow one must not hold up the next champion),
 * client writes run one at a time, and a request superseded by a newer one
 * never writes. Bump `gen` to cancel everything in flight.
 */
export interface RuneQueue {
  gen: number;
  tail: Promise<void>;
}

export function queueRuneApply(
  q: RuneQueue,
  db: ChampionDb,
  championKey: string,
  role: string,
  onFail: () => void
): Promise<void> {
  const gen = ++q.gen;
  const isLatest = () => gen === q.gen;
  const page = pickAutoRunePage(db, championKey, role as Role).catch(() => null);
  q.tail = q.tail.then(async () => {
    const ok = await apply(db, championKey, role, page, isLatest);
    if (!ok && isLatest()) onFail();
  });
  return q.tail;
}

/** Returns false when no page was applied (caller may retry on lock). */
async function apply(
  db: ChampionDb,
  championKey: string,
  role: string,
  pagePromise: Promise<RunePageInput | null>,
  isLatest: () => boolean
): Promise<boolean> {
  try {
    const page = await pagePromise;
    if (!isLatest()) return true; // superseded while fetching — not a failure
    const label = `${db.champions[championKey]?.name ?? championKey} ${role}`;
    if (!page) {
      notifyRunes("noPage", i18n.t("autoRunes.noPage", { label }));
      return false;
    }
    const result = await applyRunesResult(page);
    if (result.ok) return true;
    const reason = result.reason === "page-limit" ? "pageLimit" : "error";
    notifyRunes(reason, i18n.t(`autoRunes.${reason}`));
    return false;
  } catch {
    return false; // auto-apply must never throw or interrupt UX
  }
}

// One throttle bucket per reason (fetchNotify throttles 30s per source), so a
// "no page" toast on hover can't hide the actionable "no free slot" on lock.
function notifyRunes(reason: "noPage" | "pageLimit" | "error", message: string) {
  const source = i18n.t("autoRunes.title");
  emitFetchFailure(reason === "noPage" ? source : `${source} (${reason})`, new Error(message));
}
