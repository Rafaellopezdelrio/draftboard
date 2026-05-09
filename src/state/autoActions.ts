import { useEffect } from "react";
import { usePrefsStore } from "./prefsStore";
import { useDraftStore } from "./draftStore";
import { applyRunes } from "../services/lcuService";
import { loadAggregatedRunes } from "../services/aggregateRepo";
import type { ChampionDb } from "../types/champion";

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

  // On hover (intent), optionally pre-apply runes
  useEffect(() => {
    if (!prefs.autoApplyOnHover || !intent || !myRole || !db) return;
    apply(db, intent, myRole);
  }, [prefs.autoApplyOnHover, intent, myRole, db]);

  // On lock, optionally apply runes
  useEffect(() => {
    if (!db) return;
    const handler = (e: Event) => {
      if (!prefs.autoApplyRunes) return;
      const detail = (e as CustomEvent<{ championKey: string }>).detail;
      if (!detail?.championKey || !myRole) return;
      apply(db, detail.championKey, myRole);
    };
    window.addEventListener("draft:champion-locked", handler);
    return () => window.removeEventListener("draft:champion-locked", handler);
  }, [prefs.autoApplyRunes, myRole, db]);
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
