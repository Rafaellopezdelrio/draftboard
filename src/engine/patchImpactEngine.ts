// Detects which of YOUR mains/spam champs were buffed or nerfed in latest patch.
// Uses Data Dragon to compare patch versions and looks for stat changes.

import type { ChampionDb } from "../types/champion";
import type { ChampionMasteryDto } from "../services/riotApi";

export interface PatchImpactItem {
  championId: number;
  championName: string;
  iconUrl: string;
  change: "buff" | "nerf" | "rework" | "unchanged";
  detail: string;
  importance: "high" | "medium" | "low";
}

interface AnalyzeArgs {
  db: ChampionDb;
  masteries: ChampionMasteryDto[];
  patchNotes?: PatchEntry[]; // optional pre-loaded
}

export interface PatchEntry {
  championId: string; // ddragon id
  type: "buff" | "nerf" | "rework";
  notes: string;
}

// Curated patch notes — would normally be auto-fetched from Riot's patch notes,
// but they don't expose them in a structured API. Kept manually per cycle.
// Replace in metaAggregator job or separate fetcher when wired.
const CURRENT_PATCH_NOTES: PatchEntry[] = [];

export function analyzePatchImpact({
  db,
  masteries,
  patchNotes = CURRENT_PATCH_NOTES,
}: AnalyzeArgs): PatchImpactItem[] {
  if (masteries.length === 0 || patchNotes.length === 0) return [];
  const out: PatchImpactItem[] = [];
  const myChampIds = new Set(masteries.slice(0, 10).map((m) => m.championId));
  for (const note of patchNotes) {
    const champ = Object.values(db.champions).find((c) => c.id === note.championId);
    if (!champ) continue;
    if (!myChampIds.has(Number(champ.key))) continue;
    out.push({
      championId: Number(champ.key),
      championName: champ.name,
      iconUrl: champ.iconUrl,
      change: note.type,
      detail: note.notes,
      importance: note.type === "rework" ? "high" : "medium",
    });
  }
  return out;
}

export function setPatchNotes(notes: PatchEntry[]) {
  CURRENT_PATCH_NOTES.length = 0;
  CURRENT_PATCH_NOTES.push(...notes);
}
