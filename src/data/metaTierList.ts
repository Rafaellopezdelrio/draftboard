import type { MetaTier, Role } from "../types/champion";

// Curated meta tier list, patch 16.x baseline.
// Will be replaced by live Riot API aggregation once Tauri is up.
// Source: aggregate of community tier lists. Update each major patch.
type TierRow = [name: string, role: Role, tier: MetaTier["tier"]];

const ROWS: TierRow[] = [
  // TOP
  ["Aatrox", "TOP", "S"],
  ["Darius", "TOP", "S"],
  ["Sett", "TOP", "S"],
  ["Garen", "TOP", "A"],
  ["Mordekaiser", "TOP", "A"],
  ["Camille", "TOP", "A"],
  ["Fiora", "TOP", "A"],
  ["Jax", "TOP", "A"],
  ["Renekton", "TOP", "B"],
  ["Gwen", "TOP", "B"],
  ["Yorick", "TOP", "B"],
  // JUNGLE
  ["Briar", "JUNGLE", "S"],
  ["Warwick", "JUNGLE", "S"],
  ["MasterYi", "JUNGLE", "S"],
  ["Nocturne", "JUNGLE", "A"],
  ["Graves", "JUNGLE", "A"],
  ["Lillia", "JUNGLE", "A"],
  ["XinZhao", "JUNGLE", "A"],
  ["Diana", "JUNGLE", "B"],
  ["Kayn", "JUNGLE", "B"],
  ["LeeSin", "JUNGLE", "B"],
  // MIDDLE
  ["Yasuo", "MIDDLE", "S"],
  ["Yone", "MIDDLE", "S"],
  ["Ahri", "MIDDLE", "S"],
  ["Katarina", "MIDDLE", "A"],
  ["Zed", "MIDDLE", "A"],
  ["Akali", "MIDDLE", "A"],
  ["Veigar", "MIDDLE", "A"],
  ["Lux", "MIDDLE", "B"],
  ["Syndra", "MIDDLE", "B"],
  ["Orianna", "MIDDLE", "B"],
  // BOTTOM
  ["Jinx", "BOTTOM", "S"],
  ["Caitlyn", "BOTTOM", "S"],
  ["Kaisa", "BOTTOM", "S"],
  ["MissFortune", "BOTTOM", "A"],
  ["Ezreal", "BOTTOM", "A"],
  ["Vayne", "BOTTOM", "A"],
  ["Ashe", "BOTTOM", "A"],
  ["Lucian", "BOTTOM", "B"],
  ["Sivir", "BOTTOM", "B"],
  ["Draven", "BOTTOM", "B"],
  // UTILITY
  ["Lulu", "UTILITY", "S"],
  ["Nautilus", "UTILITY", "S"],
  ["Thresh", "UTILITY", "S"],
  ["Leona", "UTILITY", "A"],
  ["Pyke", "UTILITY", "A"],
  ["Senna", "UTILITY", "A"],
  ["Soraka", "UTILITY", "A"],
  ["Janna", "UTILITY", "B"],
  ["Morgana", "UTILITY", "B"],
  ["Blitzcrank", "UTILITY", "B"],
];

// Resolve champion id (e.g. "MissFortune") to numeric key using the loaded db.
export function buildMetaList(
  championsById: Record<string, { id: string; key: string }>
): MetaTier[] {
  const idToKey = new Map<string, string>();
  for (const c of Object.values(championsById)) idToKey.set(c.id, c.key);

  const out: MetaTier[] = [];
  for (const [id, role, tier] of ROWS) {
    const key = idToKey.get(id);
    if (!key) continue;
    out.push({
      championKey: key,
      role,
      tier,
      winRate: tierToWinRate(tier),
      pickRate: 0,
      banRate: 0,
    });
  }
  return out;
}

function tierToWinRate(t: MetaTier["tier"]): number {
  switch (t) {
    case "S":
      return 0.54;
    case "A":
      return 0.52;
    case "B":
      return 0.5;
    case "C":
      return 0.48;
    case "D":
      return 0.46;
  }
}
