// DDragon items.json loader. Provides item name + plain description by ID
// so the BuildPanel can show "Eclipse" instead of "Item 6692" and surface
// rich tooltips when the user hovers an item.
//
// Patch-keyed cache: re-load when patch changes (items can rename, get
// removed, etc). Single fetch per patch shared across the app.

interface DDragonItem {
  name: string;
  description: string;
  plaintext: string;
  gold?: { total: number };
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
}

let currentPatch: string | null = null;
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

async function loadForPatch(patch: string): Promise<void> {
  if (currentPatch === patch && cache) return;
  if (loadPromise && currentPatch === patch) return loadPromise;
  currentPatch = patch;
  cache = null;
  loadPromise = (async () => {
    try {
      const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/item.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DDragonItemsResponse;
      const map: Record<number, ItemMeta> = {};
      for (const [idStr, item] of Object.entries(json.data ?? {})) {
        const id = parseInt(idStr, 10);
        if (!Number.isFinite(id)) continue;
        map[id] = {
          id,
          name: item.name,
          plaintext: item.plaintext ?? "",
          description: item.description ?? "",
          goldTotal: item.gold?.total ?? 0,
        };
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
 * Look up an item's metadata. Returns null when:
 *   - patch hasn't loaded yet (caller should show "Item {id}" fallback)
 *   - ID isn't in the manifest (removed/placeholder consumables)
 * Triggers a background load for `patch` on first call.
 */
export function getItemMeta(patch: string, id: number): ItemMeta | null {
  if (currentPatch !== patch || !cache) {
    void loadForPatch(patch);
    return null;
  }
  return cache[id] ?? null;
}

/** Subscribe to manifest-loaded events for the current patch. */
export function subscribeToItemMeta(cb: () => void): () => void {
  if (cache) {
    cb();
    return () => {};
  }
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/** Test-only reset. */
export function __testOnly_resetItemMeta(): void {
  currentPatch = null;
  cache = null;
  loadPromise = null;
  subscribers.clear();
}
