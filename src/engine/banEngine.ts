import type { ChampionDb, Role } from "../types/champion";
import type { PersonalMatchupStat } from "../services/matchRepo";

export interface BanSuggestion {
  championKey: string;
  championName: string;
  iconUrl: string;
  reason: string;
  severity: "high" | "medium" | "low";
  source: "personal" | "global" | "blend";
  personalGames?: number;
  personalWinRate?: number;
  globalWinRate?: number;
}

interface SuggestArgs {
  db: ChampionDb;
  role: Role | null;
  matchups: PersonalMatchupStat[]; // your worst matchups in this role
  bannedKeys: string[];
  pickedKeys: string[]; // already picked / locked, can't ban
  limit?: number;
}

export function suggestBans({
  db,
  role,
  matchups,
  bannedKeys,
  pickedKeys,
  limit = 5,
}: SuggestArgs): BanSuggestion[] {
  const taken = new Set([...bannedKeys, ...pickedKeys]);

  const suggestions: BanSuggestion[] = [];

  // 1. Personal nightmares — your worst matchups
  for (const m of matchups) {
    if (m.games < 2) continue;
    if (m.winRate >= 0.45) continue; // not bad enough
    const key = String(m.opponentChampionId);
    if (taken.has(key)) continue;
    const champ = db.champions[key];
    if (!champ) continue;
    const wrPct = (m.winRate * 100).toFixed(0);
    suggestions.push({
      championKey: key,
      championName: champ.name,
      iconUrl: champ.iconUrl,
      reason: `Pierdes ${wrPct}% vs él en ${role ?? m.position} (${m.games}g)`,
      severity:
        m.winRate < 0.3 ? "high" : m.winRate < 0.4 ? "medium" : "low",
      source: "personal",
      personalGames: m.games,
      personalWinRate: m.winRate,
    });
  }

  // 2. Global S-tier in role (high pick + high win)
  if (role) {
    const globalThreats = db.meta
      .filter(
        (m) =>
          m.role === role &&
          // Include S+ (dpm.lol top tier) AND S — only filtering "S" meant
          // dpm-default users got zero global threats because their top-tier
          // champs are tagged "S+", not "S".
          (m.tier === "S+" || m.tier === "S") &&
          m.winRate >= 0.52 &&
          !taken.has(m.championKey) &&
          !suggestions.some((s) => s.championKey === m.championKey)
      )
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 3);
    for (const g of globalThreats) {
      const champ = db.champions[g.championKey];
      if (!champ) continue;
      suggestions.push({
        championKey: g.championKey,
        championName: champ.name,
        iconUrl: champ.iconUrl,
        reason: `S-tier en ${role} (${(g.winRate * 100).toFixed(0)}% global)`,
        severity: "medium",
        source: "global",
        globalWinRate: g.winRate,
      });
    }
  }

  // Sort by severity then by winrate
  const sevOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => {
    const s = sevOrder[a.severity] - sevOrder[b.severity];
    if (s !== 0) return s;
    return (a.personalWinRate ?? 0.5) - (b.personalWinRate ?? 0.5);
  });

  return suggestions.slice(0, limit);
}
