import type { ChampionMasteryDto } from "../services/riotApi";
import type { ChampionPersonalStat, MatchRow } from "../services/matchRepo";

export interface ChampionPoolInsight {
  type: "main" | "spam" | "rusty" | "tilt" | "practice";
  championId: number;
  message: string;
  severity: "info" | "good" | "warn" | "bad";
}

interface AnalyzeArgs {
  matches: MatchRow[];
  masteries: ChampionMasteryDto[];
  personalStats: ChampionPersonalStat[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function analyzeChampionPool({
  matches,
  masteries,
  personalStats,
}: AnalyzeArgs): ChampionPoolInsight[] {
  const out: ChampionPoolInsight[] = [];

  // Recent activity: champion most played in last 10 = "spam"
  const last10 = matches.slice(0, 10);
  const recentCounts = new Map<number, number>();
  for (const m of last10) {
    recentCounts.set(m.championId, (recentCounts.get(m.championId) ?? 0) + 1);
  }
  let topRecent: { id: number; n: number } | null = null;
  for (const [id, n] of recentCounts) {
    if (!topRecent || n > topRecent.n) topRecent = { id, n };
  }
  if (topRecent && topRecent.n >= 4) {
    out.push({
      type: "spam",
      championId: topRecent.id,
      message: `Has jugado ${topRecent.n}/${last10.length} con este campeón — es tu spam pick.`,
      severity: "info",
    });
  }

  // Mastery main detection: top mastery + WR>50% + games>=5 = "your main"
  for (const m of masteries.slice(0, 3)) {
    const stat = personalStats.find((p) => p.championId === m.championId);
    if (m.championPoints > 100000 && stat && stat.games >= 5 && stat.winRate >= 0.5) {
      out.push({
        type: "main",
        championId: m.championId,
        message: `Tu main: ${(stat.winRate * 100).toFixed(0)}% WR (${stat.games}g). Sigue subiendo.`,
        severity: "good",
      });
      break;
    }
  }

  // Tilt: champion with 4+ losses in a row in recent matches
  const consecutiveByChamp = new Map<number, { current: number; max: number }>();
  for (const m of matches.slice(0, 20)) {
    const e = consecutiveByChamp.get(m.championId) ?? { current: 0, max: 0 };
    if (!m.win) {
      e.current++;
      if (e.current > e.max) e.max = e.current;
    } else {
      e.current = 0;
    }
    consecutiveByChamp.set(m.championId, e);
  }
  for (const [id, e] of consecutiveByChamp) {
    if (e.max >= 4) {
      out.push({
        type: "tilt",
        championId: id,
        message: `${e.max} derrotas seguidas con este campeón. Considera cambiar o tomar un descanso.`,
        severity: "bad",
      });
      break; // only show one
    }
  }

  // Rusty: high mastery champion not played in 30+ days
  const lastPlayedByChamp = new Map<number, number>();
  for (const m of matches) {
    const prev = lastPlayedByChamp.get(m.championId) ?? 0;
    if (m.gameEndTimestampMs > prev) lastPlayedByChamp.set(m.championId, m.gameEndTimestampMs);
  }
  const now = Date.now();
  for (const m of masteries.slice(0, 5)) {
    if (m.championPoints < 50000) continue;
    const lastPlayed = lastPlayedByChamp.get(m.championId);
    const daysSince = lastPlayed ? (now - lastPlayed) / MS_PER_DAY : Infinity;
    if (daysSince > 30) {
      out.push({
        type: "rusty",
        championId: m.championId,
        message: `No lo juegas hace ${daysSince === Infinity ? "mucho" : `${Math.floor(daysSince)} días`}. Práctica antes de SoloQ.`,
        severity: "warn",
      });
      break; // only one rusty suggestion
    }
  }

  // Practice suggestion: champion with mastery >5 + few recent games + good WR
  for (const m of masteries.slice(0, 10)) {
    if (m.championLevel < 5) continue;
    const stat = personalStats.find((p) => p.championId === m.championId);
    if (!stat || stat.games < 3) {
      out.push({
        type: "practice",
        championId: m.championId,
        message: "Tienes maestría alta pero pocos games registrados. Buen pick para spam.",
        severity: "info",
      });
      break;
    }
  }

  return out;
}
