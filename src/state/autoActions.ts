import { useEffect } from "react";
import { usePrefsStore } from "./prefsStore";
import { useDraftStore } from "./draftStore";
import { applyRunes, applySummonerSpells } from "../services/lcuService";
import { loadAggregatedRunes } from "../services/aggregateRepo";
import { fetchOpggBuild } from "../services/opggBuilds";
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
    };
    window.addEventListener("draft:champion-locked", handler);
    return () => window.removeEventListener("draft:champion-locked", handler);
  }, [prefs.safeMode, prefs.autoApplyRunes, prefs.autoApplySpells, myRole, db]);
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
