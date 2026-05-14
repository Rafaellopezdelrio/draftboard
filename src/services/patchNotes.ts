// Patch notes service — fetches Riot's official patch notes feed and detects
// which champions were buffed/nerfed/reworked.
//
// Riot publishes a JSON feed of patch articles at:
//   https://www.leagueoflegends.com/page-data/.../patch-notes/page-data.json
// but it's unstable. As a fallback we use a curated mini-DB the user can
// update each patch (or the AI can summarize patch text into structured form).

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
const httpFetch: typeof fetch = (input, init) =>
  isTauri()
    ? (tauriFetch as unknown as typeof fetch)(input, init)
    : fetch(input, init);

export interface PatchChange {
  championId: string; // Data Dragon id (e.g. "LeeSin")
  type: "buff" | "nerf" | "rework" | "adjust";
  details: string[]; // human-readable bullets
}

export interface PatchSummary {
  patch: string; // "16.10"
  url?: string;
  changes: PatchChange[];
  fetchedAt: number;
}

const STORAGE_KEY = "lol-draft-advisor:patch-notes:v1";

/**
 * Returns the latest patch summary, fetching from CDragon if cache is stale.
 * CommunityDragon mirrors patch metadata in a stable JSON format.
 */
export async function getLatestPatchSummary(
  patch: string
): Promise<PatchSummary | null> {
  // Cache for 24h
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as PatchSummary;
      if (
        cached.patch === patch &&
        Date.now() - cached.fetchedAt < 24 * 60 * 60 * 1000
      ) {
        return cached;
      }
    }
  } catch {
    // ignore
  }

  // Try fetching from a community-curated source.
  // Note: Riot does not expose a stable structured patch-notes API.
  // We attempt the lol.fandom.com (Leaguepedia) data via Cargo, which has
  // patch info per champion. As a baseline we return an empty changes list
  // until a real source is wired.
  const summary: PatchSummary = await fetchFromLeaguepedia(patch);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(summary));
  } catch {
    // ignore quota
  }
  return summary;
}

async function fetchFromLeaguepedia(patch: string): Promise<PatchSummary> {
  // Leaguepedia stores per-champion patch data in "ChampionStats" / "Patches"
  // tables but the schema is dense. For now we fetch the patch row to verify
  // it exists, and rely on user-submitted summaries via curated DB.
  try {
    const params = new URLSearchParams({
      action: "cargoquery",
      tables: "Patches",
      fields: "Version,ReleaseDate,Notes",
      where: `Version = "${patch}"`,
      limit: "1",
      format: "json",
    });
    const url = `https://lol.fandom.com/api.php?${params.toString()}`;
    const res = await httpFetch(url, {
      headers: { "User-Agent": "LolDraftAdvisor/0.1" },
    });
    if (res.ok) {
      const json = (await res.json()) as {
        cargoquery?: Array<{ title: { Notes?: string; Version?: string } }>;
      };
      const row = json.cargoquery?.[0]?.title;
      if (row) {
        return {
          patch,
          changes: parseChampionsFromNotes(row.Notes ?? ""),
          fetchedAt: Date.now(),
        };
      }
    }
  } catch {
    // ignore network issues
  }
  return { patch, changes: [], fetchedAt: Date.now() };
}

// Heuristic parser: extract "Champion: ..." lines from raw patch notes blob
function parseChampionsFromNotes(notes: string): PatchChange[] {
  if (!notes) return [];
  const out: PatchChange[] = [];
  const lines = notes.split(/\n+/);
  let current: PatchChange | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    // Champion header looks like "Lee Sin (Buff)" or "Aatrox: Adjusted"
    const headerMatch = trimmed.match(
      /^([A-Z][A-Za-z' ]+?)\s*[:(]\s*(buff|nerf|rework|adjust)/i
    );
    if (headerMatch) {
      if (current) out.push(current);
      const name = headerMatch[1].trim();
      const type = headerMatch[2].toLowerCase() as PatchChange["type"];
      current = { championId: name.replace(/\s+/g, ""), type, details: [] };
      continue;
    }
    if (current && trimmed.startsWith("-")) {
      current.details.push(trimmed.replace(/^-\s*/, ""));
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Resolve "championId" (display name normalized) to Data Dragon canonical id.
 * Falls back to fuzzy match.
 */
export function resolveChampionChange(
  change: PatchChange,
  championsById: Record<string, { id: string; name: string }>
): { id: string; name: string } | null {
  // Try exact id match first
  for (const c of Object.values(championsById)) {
    if (c.id.toLowerCase() === change.championId.toLowerCase()) return c;
    if (c.name.toLowerCase() === change.championId.toLowerCase()) return c;
    // Strip non-letters and compare
    const norm = change.championId.toLowerCase().replace(/[^a-z]/g, "");
    if (c.id.toLowerCase().replace(/[^a-z]/g, "") === norm) return c;
  }
  return null;
}
