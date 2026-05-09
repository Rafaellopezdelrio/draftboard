import type { Champion, Role } from "../types/champion";

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
  const res = await fetch(VERSIONS_URL);
  if (!res.ok) throw new Error(`DDragon versions: HTTP ${res.status}`);
  const versions = (await res.json()) as string[];
  return versions[0];
}

export async function fetchChampions(
  patch: string,
  locale = "en_US"
): Promise<Record<string, Champion>> {
  const url = `https://ddragon.leagueoflegends.com/cdn/${patch}/data/${locale}/champion.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DDragon champions: HTTP ${res.status}`);
  const json = (await res.json()) as DDragonChampionListResponse;
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
      archetypes: inferArchetypes(entry.tags),
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
