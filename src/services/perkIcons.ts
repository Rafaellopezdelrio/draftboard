// CommunityDragon perks.json loader. The simple URL pattern
// `/plugins/rcp-be-lol-game-data/global/default/v1/perks/{id}.png`
// doesn't actually exist — perk PNGs are served from per-perk paths
// like `/perk-images/Styles/Precision/Conqueror/Conqueror.png`.
//
// We load the full perks manifest ONCE per session (~50KB JSON) and
// derive icon URLs from each entry's `iconPath` field. Map is cached
// in-module so subsequent lookups are O(1). Manifest is patch-stable
// (perks don't move paths mid-season) so we never need to invalidate.
//
// Fallback URL is the generic runes-style icon — when a perk ID isn't
// in the manifest (rare; usually a typo or removed perk), the user
// sees a generic rune symbol instead of a broken image.

const PERKS_JSON_URL =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perks.json";

const FALLBACK_URL =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/runesicon.png";

interface CDragonPerk {
  id: number;
  iconPath: string; // e.g. "/lol-game-data/assets/v1/perk-images/Styles/Precision/Conqueror/Conqueror.png"
  shortDesc?: string;
  longDesc?: string;
  name?: string;
}

let cache: Record<number, string> | null = null;
let loadPromise: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function rawIconPathToUrl(iconPath: string): string {
  // CDragon convention: drop the `/lol-game-data/assets` prefix and
  // lowercase the rest so it matches their served file structure.
  const stripped = iconPath.toLowerCase().replace(/^\/lol-game-data\/assets/, "");
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default${stripped}`;
}

function notifyLoaded(): void {
  for (const cb of subscribers) {
    try {
      cb();
    } catch {
      /* never let a single subscriber crash the others */
    }
  }
}

async function loadPerks(): Promise<void> {
  if (cache) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const res = await fetch(PERKS_JSON_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = (await res.json()) as CDragonPerk[];
      const map: Record<number, string> = {};
      for (const p of list) {
        if (typeof p.id === "number" && typeof p.iconPath === "string") {
          map[p.id] = rawIconPathToUrl(p.iconPath);
        }
      }
      cache = map;
      notifyLoaded();
    } catch {
      // Network down or CDragon offline — leave cache null so we keep
      // returning the fallback URL. Don't throw to caller; that would
      // make every RuneIcon render error.
      cache = {};
      notifyLoaded();
    }
  })();
  return loadPromise;
}

// Kick off the load on module import so the JSON is in-flight by the
// time the first RuneIcon mounts. No-op if already loading.
loadPerks();

/**
 * Return the URL for a perk icon by ID. Returns a fallback rune icon
 * when the manifest hasn't loaded yet OR the ID is unknown — caller
 * doesn't need to handle null. Call `subscribeToPerkIcons` to re-render
 * when the manifest finishes loading.
 */
export function getPerkIconUrl(id: number): string {
  if (cache && cache[id]) return cache[id];
  return FALLBACK_URL;
}

/**
 * Register a callback to fire once perks.json finishes loading. Used
 * by RuneIcon to force a re-render so the fallback URL gets replaced
 * with the real icon as soon as the manifest is available.
 */
export function subscribeToPerkIcons(cb: () => void): () => void {
  // If already loaded, fire immediately and skip subscription.
  if (cache) {
    cb();
    return () => {};
  }
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/** Test-only: reset module state so vitest cases don't bleed across files. */
export function __testOnly_resetPerkIcons(): void {
  cache = null;
  loadPromise = null;
  subscribers.clear();
}
