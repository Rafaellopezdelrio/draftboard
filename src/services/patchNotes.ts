// Patch notes service — fetches Riot's official patch notes feed via our
// CF Worker proxy (primary), with Leaguepedia as fallback.
//
// Worker endpoint `/riot/patch-notes?patch=X.Y` scrapes the official page
// and returns structured changes. Leaguepedia (`lol.fandom.com/api.php`)
// is a backup when Riot's page format changes; its data is sparser but
// at least exposes patch metadata.

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { getRiotProxyUrl } from "./riotApi";
import { withRetry, RateLimitError, throwIfRateLimited } from "./retry";
import { trackFetch } from "./breadcrumbs";

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

  // Primary: our worker scrapes Riot's official patch notes page.
  let summary = await fetchFromRiotProxy(patch);
  // Fallback: Leaguepedia Cargo. Works for older patches but rarely has
  // the same level of structured detail as Riot's own page.
  if (!summary || summary.changes.length === 0) {
    summary = await fetchFromLeaguepedia(patch);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(summary));
  } catch {
    // ignore quota
  }
  return summary;
}

/**
 * Primary source: our CF worker (which scrapes Riot's official patch
 * notes page). Returns null if the proxy is unreachable so the fallback
 * Leaguepedia path can run.
 */
async function fetchFromRiotProxy(patch: string): Promise<PatchSummary | null> {
  const proxyUrl = getRiotProxyUrl();
  if (!proxyUrl) return null;
  // Normalise DDragon's "X.Y.Z" build version to the "X.Y" form Riot
  // uses on their patch notes URL. Worker also accepts X.Y.Z now but
  // we strip client-side too so the cache key is consistent.
  const normalised = patch.split(".").slice(0, 2).join(".");
  const url = `${proxyUrl}/riot/patch-notes?patch=${encodeURIComponent(normalised)}`;
  try {
    // Worker scrapes Riot's patch notes page — transient 5xx from cold
    // starts / origin restarts are common. Retry 3x; 4xx (patch not
    // indexed yet) doesn't retry since waiting won't fix it.
    const data = await withRetry(
      async () => {
        const res = await httpFetch(url, { headers: { Accept: "application/json" } });
        throwIfRateLimited(res, url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        trackFetch(url, "ok");
        return (await res.json()) as {
          patch: string;
          url?: string;
          changes: Array<{
            championName: string;
            championId: string;
            type: PatchChange["type"];
            details: string[];
          }>;
        };
      },
      {
        attempts: 3,
        baseDelayMs: 500,
        // Allow 429 retries via RateLimitError + Retry-After. Other 4xx
        // are non-retriable (patch index missing, won't be there next try).
        shouldRetry: (err) => {
          if (err instanceof RateLimitError) return true;
          return !String((err as Error)?.message ?? "").match(/HTTP 4\d\d/);
        },
        onRetry: (e, n) =>
          trackFetch(url, "fail", `attempt ${n}: ${String(e).slice(0, 80)}`),
      }
    );
    return {
      patch: data.patch,
      url: data.url,
      changes: data.changes.map((c) => ({
        championId: c.championId,
        type: c.type,
        details: c.details,
      })),
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
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
