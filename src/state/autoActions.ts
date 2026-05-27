import { useEffect } from "react";
import { usePrefsStore } from "./prefsStore";
import { useDraftStore } from "./draftStore";
import { applyRunes, applySummonerSpells, pushItemSet } from "../services/lcuService";
import { loadAggregatedRunes } from "../services/aggregateRepo";
import { fetchOpggBuild, pickBestBuild } from "../services/opggBuilds";
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

  // On hover (intent), optionally pre-apply runes (disabled in safe mode)
  useEffect(() => {
    if (prefs.safeMode || !prefs.autoApplyOnHover || !intent || !myRole || !db) return;
    apply(db, intent, myRole);
  }, [prefs.safeMode, prefs.autoApplyOnHover, intent, myRole, db]);

  // On lock, optionally apply runes (disabled in safe mode)
  useEffect(() => {
    if (!db) return;
    const handler = (e: Event) => {
      if (prefs.safeMode) return;
      const detail = (e as CustomEvent<{ championKey: string }>).detail;
      if (!detail?.championKey || !myRole) return;
      if (prefs.autoApplyRunes) apply(db, detail.championKey, myRole);
      // Spells are gated by their own pref so the user can pick runes-only,
      // spells-only, or both. We read champ.id (data-dragon name) because
      // op.gg's build endpoint expects UPPER_SNAKE_CASE names, not Riot
      // numeric keys.
      if (prefs.autoApplySpells) {
        const champ = db.champions[detail.championKey];
        if (champ) applySpells(champ, myRole as Role);
      }
      if (prefs.autoApplyItemSet) {
        const champ = db.champions[detail.championKey];
        if (champ) applyItemSet(champ, myRole as Role);
      }
    };
    window.addEventListener("draft:champion-locked", handler);
    return () => window.removeEventListener("draft:champion-locked", handler);
  }, [prefs.safeMode, prefs.autoApplyRunes, prefs.autoApplySpells, myRole, db]);
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

async function apply(db: ChampionDb, championKey: string, role: string) {
  try {
    const runes = await loadAggregatedRunes(db.patch, Number(championKey), role);
    if (!runes) return;
    const champ = db.champions[championKey];
    await applyRunes({
      name: `${champ?.name ?? championKey} ${role} (auto)`,
      primaryStyleId: runes.primaryStyle,
      subStyleId: runes.subStyle,
      selectedPerkIds: runes.perks,
    });
  } catch {
    // silent
  }
}
