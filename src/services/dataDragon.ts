import type { Champion, Role } from "../types/champion";
import { withRetry } from "./retry";
import { trackFetch } from "./breadcrumbs";
import { CHAMPION_ARCHETYPES } from "../data/championArchetypes";

const VERSIONS_URL = "https://ddragon.leagueoflegends.com/api/versions.json";

const TAG_TO_ROLE: Record<string, Role[]> = {
  Fighter: ["TOP", "JUNGLE"],
  Tank: ["TOP", "UTILITY"],
  Assassin: ["JUNGLE", "MIDDLE"],
  Mage: ["MIDDLE", "UTILITY"],
  Marksman: ["BOTTOM"],
  Support: ["UTILITY"],
};

interface DDragonChampionEntry {
  id: string;
  key: string;
  name: string;
  title: string;
  tags: string[];
  image: { full: string };
}

interface DDragonChampionListResponse {
  data: Record<string, DDragonChampionEntry>;
}

export async function fetchLatestPatch(): Promise<string> {
  return withRetry(
    async () => {
      const res = await fetch(VERSIONS_URL);
      if (!res.ok) throw new Error(`DDragon versions: HTTP ${res.status}`);
      const versions = (await res.json()) as string[];
      trackFetch(VERSIONS_URL, "ok");
      return versions[0];
    },
    {
      attempts: 3,
      baseDelayMs: 400,
      onRetry: (_e, n) => trackFetch(VERSIONS_URL, "fail", `attempt ${n}`),
    }
  );
}

export async function fetchChampions(
  patch: string,
  locale = "en_US"
): Promise<Record<string, Champion>> {
  const url = `https://ddragon.leagueoflegends.com/cdn/${patch}/data/${locale}/champion.json`;
  return withRetry(
    async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`DDragon champions: HTTP ${res.status}`);
      trackFetch(url, "ok");
      return parseChampionListResponse(await res.json(), patch);
    },
    {
      attempts: 3,
      baseDelayMs: 400,
      onRetry: (_e, n) => trackFetch(url, "fail", `attempt ${n}`),
    }
  );
}

/** Pure parser extracted so the retry wrapper above stays small. */
function parseChampionListResponse(
  rawJson: unknown,
  patch: string
): Record<string, Champion> {
  const json = rawJson as DDragonChampionListResponse;
  const result: Record<string, Champion> = {};
  for (const entry of Object.values(json.data)) {
    const inferredRoles = inferRoles(entry.tags);
    result[entry.key] = {
      id: entry.id,
      key: entry.key,
      name: entry.name,
      title: entry.title,
      iconUrl: `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${entry.image.full}`,
      splashUrl: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${entry.id}_0.jpg`,
      tags: entry.tags,
      roles: inferredRoles,
      // Layer 1: curated per-champion archetypes (same pattern as roles).
      // Tag inference only remains as a fallback for brand-new champions
      // that haven't been added to the curated map yet.
      archetypes: CHAMPION_ARCHETYPES[entry.id] ?? inferArchetypes(entry.tags),
    };
  }
  return result;
}

function inferRoles(tags: string[]): Role[] {
  const roles = new Set<Role>();
  for (const tag of tags) {
    for (const r of TAG_TO_ROLE[tag] ?? []) roles.add(r);
  }
  return roles.size ? Array.from(roles) : ["MIDDLE"];
}

export interface ChampionDetail {
  id: string;
  name: string;
  title: string;
  lore: string;
  tags: string[];
  passive: { name: string; description: string };
  spells: Array<{
    id: string;
    name: string;
    description: string;
    cooldown: number[];
    cost: number[];
    range: number[];
    image: { full: string };
  }>;
  info: { attack: number; defense: number; magic: number; difficulty: number };
}

interface DDragonChampionDetailResponse {
  data: Record<string, ChampionDetail>;
}

const DETAIL_CACHE = new Map<string, ChampionDetail>();

export async function fetchChampionDetail(
  patch: string,
  championId: string,
  locale = "es_ES"
): Promise<ChampionDetail | null> {
  const cacheKey = `${patch}:${championId}`;
  const hit = DETAIL_CACHE.get(cacheKey);
  if (hit) return hit;
  const url = `https://ddragon.leagueoflegends.com/cdn/${patch}/data/${locale}/champion/${championId}.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      // Fallback to en_US if Spanish not available for this champion
      const fallbackUrl = `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/champion/${championId}.json`;
      const fb = await fetch(fallbackUrl);
      if (!fb.ok) return null;
      const j = (await fb.json()) as DDragonChampionDetailResponse;
      const detail = j.data[championId];
      if (detail) DETAIL_CACHE.set(cacheKey, detail);
      return detail ?? null;
    }
    const j = (await res.json()) as DDragonChampionDetailResponse;
    const detail = j.data[championId];
    if (detail) DETAIL_CACHE.set(cacheKey, detail);
    return detail ?? null;
  } catch {
    return null;
  }
}

function inferArchetypes(tags: string[]): import("../types/champion").Archetype[] {
  const out: import("../types/champion").Archetype[] = [];
  if (tags.includes("Tank")) out.push("frontline", "engage");
  if (tags.includes("Fighter")) out.push("sustain-dps");
  if (tags.includes("Assassin")) out.push("burst", "pick");
  if (tags.includes("Mage")) out.push("burst", "poke", "wave-clear");
  if (tags.includes("Marksman")) out.push("sustain-dps");
  if (tags.includes("Support")) out.push("peel");
  return out;
}
