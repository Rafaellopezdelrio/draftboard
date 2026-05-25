// DDragon uses season-based patch numbers (16.10 = Season 16 = 2026)
// while Riot's news site uses year-based (26.10 = 2026 patch 10). Same
// patch, different label. UI shows the year-based form so it matches
// what users see on the LoL client splash, op.gg, Mobalytics, and Riot's
// own patch notes URL. Internal code (DDragon CDN URLs, cache keys,
// op.gg API params) still uses the raw DDragon "16.10.1" because that's
// the canonical patch identifier.
//
// Conversion rule (stable since Season 14 / 2024):
//   riotYear = ddragonMajor + 10

/**
 * Convert a DDragon-style patch ("16.10" or "16.10.1") to the user-facing
 * Riot year display ("26.10"). Pass through anything that doesn't match
 * the expected shape — never throw on bad input.
 */
export function displayPatch(ddragonPatch: string): string {
  const parts = ddragonPatch.split(".");
  if (parts.length < 2) return ddragonPatch;
  const major = parseInt(parts[0], 10);
  if (!Number.isFinite(major)) return ddragonPatch;
  // Only apply the offset for the modern era (Season 14+ = 2024+).
  // Older DDragon patches (e.g. "13.x") predate the shift and don't have
  // a clean Riot-news equivalent; we leave them as-is.
  if (major < 14) return `${parts[0]}.${parts[1]}`;
  return `${major + 10}.${parts[1]}`;
}
