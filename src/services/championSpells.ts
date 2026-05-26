// DDragon champion data loader for spell icons + names. Used by the
// BuildPanel skill-order section to render real Q/W/E/R ability icons
// instead of plain "Q W E" letters.
//
// Cached per (patch, championId) tuple — champion detail JSONs are
// small (~10KB) so the memory cost is fine even with all champs loaded.

export interface ChampionSpell {
  /** Internal Riot ID — e.g. "AatroxQ". Used to construct icon URL. */
  id: string;
  /** Display name — "The Darkin Blade". */
  name: string;
  /** Filename inside DDragon spell folder. */
  image: string;
}

export interface ChampionSpellSet {
  passive: ChampionSpell;
  spells: ChampionSpell[]; // length 4: Q, W, E, R
}

interface DDragonChampionData {
  data: Record<
    string,
    {
      passive: { name: string; image: { full: string } };
      spells: Array<{ id: string; name: string; image: { full: string } }>;
    }
  >;
}

const cache = new Map<string, ChampionSpellSet>();
const inFlight = new Map<string, Promise<ChampionSpellSet | null>>();
const subscribers = new Set<() => void>();

function key(patch: string, championId: string): string {
  return `${patch}::${championId}`;
}

async function fetchChampion(
  patch: string,
  championId: string
): Promise<ChampionSpellSet | null> {
  try {
    const url = `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/champion/${championId}.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as DDragonChampionData;
    const entry = json.data?.[championId];
    if (!entry) return null;
    const set: ChampionSpellSet = {
      passive: {
        id: "passive",
        name: entry.passive.name,
        image: entry.passive.image.full,
      },
      spells: entry.spells.map((s) => ({
        id: s.id,
        name: s.name,
        image: s.image.full,
      })),
    };
    return set;
  } catch {
    return null;
  }
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

/**
 * Return the spell set for a champion at a given patch. Returns null
 * if not loaded yet (caller renders text fallback). Triggers a fetch
 * on first miss; subsequent calls hit the cache.
 */
export function getChampionSpells(
  patch: string,
  championId: string
): ChampionSpellSet | null {
  const k = key(patch, championId);
  const cached = cache.get(k);
  if (cached) return cached;
  if (inFlight.has(k)) return null;
  const p = fetchChampion(patch, championId).then((set) => {
    if (set) {
      cache.set(k, set);
      notifyLoaded();
    }
    inFlight.delete(k);
    return set;
  });
  inFlight.set(k, p);
  return null;
}

/** Subscribe to load events. Fires whenever ANY champion finishes loading. */
export function subscribeToChampionSpells(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/** Build the public icon URL for a champion spell image filename. */
export function spellIconUrl(patch: string, image: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${patch}/img/spell/${image}`;
}

/** Test-only reset. */
export function __testOnly_resetChampionSpells(): void {
  cache.clear();
  inFlight.clear();
  subscribers.clear();
}
