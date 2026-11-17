// DDragon items.json loader. Provides item name + plain description by ID
// so the BuildPanel can show "Eclipse" instead of "Item 6692" and surface
// rich tooltips when the user hovers an item.
//
// Cache keyed by patch + language: re-load when either changes (items can
// rename, get removed, and the UI can switch between Spanish and English).
// Single fetch per (patch, language) shared across the app.

import { i18n } from "../i18n";

interface DDragonItem {
  name: string;
  description: string;
  plaintext: string;
  gold?: { total: number; purchasable?: boolean };
  maps?: Record<string, boolean>;
  into?: string[];
  tags?: string[];
}

interface DDragonItemsResponse {
  data: Record<string, DDragonItem>;
}

export interface ItemMeta {
  id: number;
  name: string;
  /** Plain-text description, no HTML — safe to show in title tooltips. */
  plaintext: string;
  /** Raw HTML description (Riot's format). Strip when rendering. */
  description: string;
  goldTotal: number;
  /** Sold in the normal Summoner's Rift shop this patch. Mode copies of an
   * item (Arena and other modes use 6-digit ids) and removed items are not. */
  onRift: boolean;
  /** Final item: builds into nothing (legendaries, boots, starters…). */
  finished: boolean;
  tags: string[];
}

type DDragonLocale = "es_ES" | "en_US";

/** DDragon language for the UI language. */
export function ddragonLocale(lang: string | undefined = i18n.language): DDragonLocale {
  return lang?.startsWith("es") ? "es_ES" : "en_US";
}

let currentKey: string | null = null;
let cache: Record<number, ItemMeta> | null = null;
let loadPromise: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function notifyLoaded(): void {
  for (const cb of subscribers) {
    try {
      cb();
    } catch {
      /* never let a single subscriber crash the others */
    }
  }
}

function toMeta(id: number, item: DDragonItem): ItemMeta {
  return {
    id,
    name: item.name,
    plaintext: item.plaintext ?? "",
    description: item.description ?? "",
    goldTotal: item.gold?.total ?? 0,
    onRift: id < 10000 && item.gold?.purchasable === true && item.maps?.["11"] === true,
    finished: !item.into || item.into.length === 0,
    tags: item.tags ?? [],
  };
}

async function loadFor(patch: string, locale: DDragonLocale): Promise<void> {
  const key = `${patch}|${locale}`;
  if (currentKey === key && cache) return;
  if (loadPromise && currentKey === key) return loadPromise;
  currentKey = key;
  cache = null;
  loadPromise = (async () => {
    try {
      const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${patch}/data/${locale}/item.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DDragonItemsResponse;
      const map: Record<number, ItemMeta> = {};
      for (const [idStr, item] of Object.entries(json.data ?? {})) {
        const id = parseInt(idStr, 10);
        if (!Number.isFinite(id)) continue;
        map[id] = toMeta(id, item);
      }
      cache = map;
      notifyLoaded();
    } catch {
      cache = {};
      notifyLoaded();
    }
  })();
  return loadPromise;
}

/**
 * Look up an item's metadata, named in the UI language. Returns null when:
 *   - patch/language hasn't loaded yet (caller should show "Item {id}" fallback)
 *   - ID isn't in the manifest (removed/placeholder consumables)
 * Triggers a background load on first call.
 */
export function getItemMeta(patch: string, id: number): ItemMeta | null {
  const locale = ddragonLocale();
  if (currentKey !== `${patch}|${locale}` || !cache) {
    void loadFor(patch, locale);
    return null;
  }
  return cache[id] ?? null;
}

/**
 * Names of the finished items sold on Summoner's Rift this patch (boots,
 * starters and full items; no components, consumables or trinkets), in the
 * given language. Used to keep AI text to items that exist. Empty when the
 * item list could not be loaded.
 */
export async function riftItemNames(patch: string, lang?: string): Promise<string[]> {
  await loadFor(patch, ddragonLocale(lang));
  const names = new Set<string>();
  for (const m of Object.values(cache ?? {})) {
    if (!m.onRift || !m.finished) continue;
    if (m.tags.includes("Consumable") || m.tags.includes("Trinket")) continue;
    names.add(m.name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Subscribe to manifest-loaded events. Stays subscribed after the first
 * load, so a later patch or language change re-renders the caller too. */
export function subscribeToItemMeta(cb: () => void): () => void {
  subscribers.add(cb);
  if (cache) cb();
  return () => subscribers.delete(cb);
}

export function __testOnly_resetItemMeta(): void {
  currentKey = null;
  cache = null;
  loadPromise = null;
  subscribers.clear();
}
