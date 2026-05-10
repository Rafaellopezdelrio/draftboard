// Auto-detected playstyle from match data. Used by suggestion engine
// and by AI coach to give personalized advice.

import type { MatchRow } from "../services/matchRepo";

export interface PlaystyleProfile {
  archetype: PlaystyleArchetype;
  traits: string[];
  metrics: {
    avgKda: number;
    avgCspm: number;
    avgKp: number;
    avgDeathsPerMin: number;
    aggressionScore: number; // 0-1
    scalingScore: number; // 0-1, late-game leaning
    objectiveScore: number; // 0-1, contributes to objectives
  };
}

export type PlaystyleArchetype =
  | "aggressive"
  | "scaling"
  | "safe"
  | "playmaker"
  | "carry"
  | "supportive"
  | "balanced";

export function buildPlaystyleProfile(
  matches: MatchRow[]
): PlaystyleProfile | null {
  if (matches.length < 5) return null;

  const total = matches.length;
  const wins = matches.filter((m) => m.win).length;
  const sumK = sum(matches.map((m) => m.kills));
  const sumD = sum(matches.map((m) => m.deaths));
  const sumA = sum(matches.map((m) => m.assists));
  const sumCS = sum(matches.map((m) => m.cs));
  const sumDur = sum(matches.map((m) => m.durationSec)) / 60;
  const avgKda = (sumK + sumA) / Math.max(1, sumD);
  const avgCspm = sumCS / sumDur;
  const avgDeathsPerMin = sumD / sumDur;
  const avgKp = (sumK + sumA) / Math.max(1, sumK + sumA + sumD * 2); // rough proxy

  // Aggression: high kills, high deaths
  const killsPerMin = sumK / sumDur;
  const aggressionScore = clamp01(killsPerMin / 0.4 + avgDeathsPerMin * 0.5);

  // Scaling: longer games + better win rate
  const avgDur = sumDur / total;
  const scalingScore = clamp01((avgDur - 25) / 15); // 25min=0, 40min=1

  // Objective: assists (proxy for teamfight presence)
  const objectiveScore = clamp01((sumA / sumDur) * 0.5);

  // Archetype detection
  const archetype = detectArchetype({
    kills: killsPerMin,
    deaths: avgDeathsPerMin,
    assists: sumA / sumDur,
    cspm: avgCspm,
    avgDur,
    winrate: wins / total,
  });

  const traits: string[] = [];
  if (killsPerMin > 0.3) traits.push("Alta presión de kills");
  if (avgDeathsPerMin > 0.3) traits.push("Mueres mucho — riesgo alto");
  if (avgDeathsPerMin < 0.15) traits.push("Muy seguro, casi no mueres");
  if (avgCspm > 7) traits.push("Excelente farm");
  if (avgCspm < 5 && matches[0].position !== "UTILITY") traits.push("Farm bajo");
  if (avgKda > 3) traits.push("KDA alto consistente");
  if (avgDur > 35) traits.push("Tendencia a partidas largas");
  if (avgDur < 25) traits.push("Cierra rápido");
  if (sumA / Math.max(1, sumK) > 2) traits.push("Asistencias > kills (peeler/playmaker)");
  if (sumK / Math.max(1, sumA) > 1.5) traits.push("Solo carry, kills > assists");

  return {
    archetype,
    traits,
    metrics: {
      avgKda,
      avgCspm,
      avgKp,
      avgDeathsPerMin,
      aggressionScore,
      scalingScore,
      objectiveScore,
    },
  };
}

function detectArchetype(s: {
  kills: number;
  deaths: number;
  assists: number;
  cspm: number;
  avgDur: number;
  winrate: number;
}): PlaystyleArchetype {
  if (s.kills > 0.35 && s.deaths > 0.25) return "aggressive";
  if (s.deaths < 0.15 && s.cspm > 6) return "safe";
  if (s.assists > 0.5 && s.kills < 0.25) return "supportive";
  if (s.assists > s.kills && s.cspm < 6) return "playmaker";
  if (s.avgDur > 33 && s.winrate > 0.55) return "scaling";
  if (s.kills > s.assists && s.cspm > 7) return "carry";
  return "balanced";
}

const ARCHETYPE_LABELS: Record<PlaystyleArchetype, { label: string; emoji: string; tip: string }> = {
  aggressive: {
    label: "Agresivo",
    emoji: "⚔️",
    tip: "Buscas peleas. Los counters defensivos te frenan. Practica decision-making sobre cuándo desengajarte.",
  },
  scaling: {
    label: "Scaling",
    emoji: "📈",
    tip: "Ganas partidas largas. Tus enemigos quieren cerrar rápido. Juega seguro pre-15min y deja que el tiempo trabaje.",
  },
  safe: {
    label: "Seguro",
    emoji: "🛡️",
    tip: "Mueres poco y farmeas bien. Tu gap es generar plays. Practica engage timings.",
  },
  playmaker: {
    label: "Playmaker",
    emoji: "🎯",
    tip: "Creas plays. Necesitas equipos que sigan tus engages. Pickea con visión.",
  },
  carry: {
    label: "Carry",
    emoji: "👑",
    tip: "Eres el que cierra. Necesitas farm + ítems. Evita teamfights forzados pre-2 ítems.",
  },
  supportive: {
    label: "Supportive",
    emoji: "🤝",
    tip: "Tu valor está en peel/utility. Pickea campeones que escalen con visión y crowd control.",
  },
  balanced: {
    label: "Balanceado",
    emoji: "⚖️",
    tip: "Sin tendencia clara. Identifica qué estilo te gana más LP y especialízate.",
  },
};

export function getArchetypeMeta(a: PlaystyleArchetype) {
  return ARCHETYPE_LABELS[a];
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
