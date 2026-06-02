// Scout synthesis — turns the raw per-player data we already fetch
// (enemyScout.ScoutResult) into a Porofessor-style threat read: one threat
// level, a few tags, and a single actionable note per enemy, plus a team
// summary. This is the "so what / now what" layer the scout panel was missing
// (it rendered rank/WR/mastery but never a verdict).
//
// Pure + db-agnostic (championName passed in) so it's trivially testable.

import type { ScoutResult } from "../services/enemyScout";

export type ThreatLevel = "danger" | "elevated" | "neutral" | "weak";

export interface PlayerThreat {
  level: ThreatLevel;
  /** 0–1 composite. 0.5 = average opponent. */
  score: number;
  /** Short flags for chips: "main", "one-trick", "en racha", "smurf?"… */
  tags: string[];
  /** Single most useful sentence — what to actually do about this player. */
  note: string;
}

const TIERS: Record<string, number> = {
  IRON: 0,
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  PLATINUM: 4,
  EMERALD: 5,
  DIAMOND: 6,
  MASTER: 7,
  GRANDMASTER: 8,
  CHALLENGER: 9,
};
const DIVISIONS: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 };

/** Map "GOLD II" (+lp) to a single comparable ladder number, or null when
 *  unranked/unparseable. Apex tiers have no division; LP carries the spread. */
export function rankValue(rank: string | null | undefined, lp = 0): number | null {
  if (!rank) return null;
  const [tierRaw, divRaw] = rank.trim().toUpperCase().split(/\s+/);
  const tier = TIERS[tierRaw];
  if (tier === undefined) return null;
  const div = divRaw ? (DIVISIONS[divRaw] ?? 0) : 0;
  return tier * 4 + div + lp / 100;
}

const SMURF_LEVEL = 40;
const ONE_TRICK_PTS = 200_000;
const COMFORT_CAP_PTS = 300_000;

export interface AssessArgs {
  scout: ScoutResult;
  /** Champion the enemy locked (for off-pool detection + nicer notes). */
  pickedChampionId?: number | null;
  /** Display name of the picked champion, when known. */
  championName?: string | null;
}

/** Composite threat read for one enemy. */
export function assessThreat({
  scout,
  pickedChampionId,
  championName,
}: AssessArgs): PlayerThreat {
  const total = scout.recentWins + scout.recentLosses;
  const wr = total > 0 ? scout.recentWins / total : null;
  const wrPct = wr !== null ? Math.round(wr * 100) : null;
  const pm = scout.pickedChampionMastery;
  const isMain = !!pm && scout.mainChampionId === pm.championId;
  const oneTrick = !!pm && pm.points > ONE_TRICK_PTS;
  const champ = championName ?? "su pick";

  let score = 0.5;
  const tags: string[] = [];

  // Recent form (needs a real sample so 1-game noise can't swing it).
  if (wr !== null && total >= 5) score += (wr - 0.5) * 0.6;

  // Comfort on the champ they actually locked.
  if (pm && pm.points > 0) {
    score += Math.min(pm.points / COMFORT_CAP_PTS, 1) * 0.2;
    if (isMain) tags.push("main");
    if (oneTrick) tags.push("one-trick");
  } else if (pickedChampionId != null && scout.topMasteries.length > 0) {
    // Locked something outside their mastery pool — likely uncomfortable.
    score -= 0.15;
    tags.push("fuera de pool");
  }

  if (scout.hotStreak) {
    score += 0.1;
    tags.push("en racha");
  }
  if (scout.coldStreak) {
    score -= 0.1;
    tags.push("coldstreak");
  }

  // Smurf heuristic: low account level paired with strong rank or win rate.
  const rv = rankValue(scout.rank, scout.lp ?? 0);
  const smurf =
    scout.summonerLevel != null &&
    scout.summonerLevel < SMURF_LEVEL &&
    ((rv != null && rv >= TIERS.DIAMOND * 4) || (wr != null && total >= 5 && wr >= 0.7));
  if (smurf) {
    score += 0.15;
    tags.push("smurf?");
  }

  score = Math.max(0, Math.min(1, score));
  const level: ThreatLevel =
    score >= 0.68 ? "danger" : score >= 0.56 ? "elevated" : score < 0.42 ? "weak" : "neutral";

  // Note: pick the single most decision-relevant signal, most severe first.
  let note: string;
  if (smurf) {
    note = `Posible smurf (lvl ${scout.summonerLevel}${wrPct !== null ? `, ${wrPct}% WR` : ""}). Asume que domina el matchup — juega seguro.`;
  } else if (oneTrick) {
    note = `OTP de ${champ} (${Math.round(pm!.points / 1000)}k). No pelees el 1v1 temprano; pide jungla.`;
  } else if (scout.hotStreak && wr !== null && wr >= 0.6) {
    note = `En racha (${wrPct}%). Confiado — castiga sus overextends.`;
  } else if (tags.includes("fuera de pool")) {
    note = `Fuera de su pool de campeones. Presiona temprano antes de que se acomode.`;
  } else if (scout.coldStreak || (wr !== null && total >= 5 && wr < 0.4)) {
    note = `Bajo de forma${wrPct !== null ? ` (${wrPct}%)` : ""}. Snowballea tu carril, puede tiltear.`;
  } else if (isMain) {
    note = `Juega su main (${champ}). Respeta sus picks de poder.`;
  } else {
    note = `Oponente estándar. Ejecuta tu plan de carril.`;
  }

  return { level, score, tags, note };
}

export interface EnemySummary {
  dangerCount: number;
  text: string;
}

/** One-line read of the enemy team for the panel header. */
export function summarizeEnemies(threats: PlayerThreat[]): EnemySummary {
  const dangerCount = threats.filter(
    (t) => t.level === "danger" || t.level === "elevated"
  ).length;
  const text =
    dangerCount === 0
      ? "Sin amenazas claras — ejecuta tu plan."
      : `${dangerCount} amenaza${dangerCount > 1 ? "s" : ""}: juega seguro y coordina vs ellos.`;
  return { dangerCount, text };
}
