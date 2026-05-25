// Maps Riot's Live Client API `gameMode` strings to user-friendly Spanish
// labels. Riot internally codes new modes with fruit/codename strings
// before they get a final name. We translate so the UI doesn't surface
// raw internal codenames like "KIWI" to the user.
//
// Source: Riot's published game-modes list + Live Client API observations.
// When Riot adds a new mode, falling back to the raw string is fine —
// it's better than showing "undefined".

export const GAME_MODE_NAMES: Record<string, string> = {
  CLASSIC: "Grieta",
  ARAM: "ARAM",
  URF: "URF",
  ARURF: "AR-URF",
  ONEFORALL: "Uno por Todos",
  NEXUSBLITZ: "Nexus Blitz",
  ULTBOOK: "Hechizos Definitivos",
  PRACTICETOOL: "Práctica",
  TUTORIAL: "Tutorial",
  TUTORIAL_MODULE_1: "Tutorial",
  TUTORIAL_MODULE_2: "Tutorial",
  TUTORIAL_MODULE_3: "Tutorial",
  ODIN: "Crystal Scar", // legacy Dominion
  ASCENSION: "Ascensión",
  // --- Riot internal fruit codenames (modes released under codename first) ---
  CHERRY: "Arena", // 2v2v2v2
  STRAWBERRY: "Swarm", // PvE co-op
  KIWI: "Brawl", // 5v5 quick mode (released late 2025 / early 2026)
};

/**
 * Return the user-facing Spanish label for a Live Client gameMode.
 * Falls back to the raw string (uppercased) when the mode is unknown —
 * better than "undefined" or an empty cell.
 */
export function displayGameMode(raw: string | null | undefined): string {
  if (!raw) return "Partida";
  const key = raw.trim().toUpperCase();
  return GAME_MODE_NAMES[key] ?? key;
}
