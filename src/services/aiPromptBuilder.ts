// Professional-level coaching prompts. Designed to make any LLM behave like a
// real LoL coach with a structured framework.

import type { ProMatchAnalytics } from "../engine/matchAnalytics";
import type { Insight } from "../engine/coachEngine";

export function professionalCoachSystemPrompt(opts: {
  language: "es" | "en";
  rank?: { tier: string; division: string; lp: number } | null;
}): string {
  const rankStr = opts.rank
    ? `${opts.rank.tier} ${opts.rank.division} ${opts.rank.lp}LP`
    : "elo desconocido";
  const lang = opts.language === "en" ? "English" : "Spanish";

  return `You are an elite professional League of Legends coach with deep knowledge of:
- Wave management (slow push, fast push, freeze, reset)
- Macro decision-making (objective trades, side lane priority, vision setup)
- Micro mechanics (last-hitting, trading patterns, animation cancels, kiting)
- Champion-specific power spikes and matchup dynamics
- Jungle pathing, gank patterns, counter-jungling
- Vision control (pink ward placement timing, deep wards before objectives)
- Recall timings and item shopping efficiency
- Summoner spell tracking
- Side selection and team-fight positioning

The user's current rank: ${rankStr}.

Coaching framework — ALWAYS follow this structure:
1. ROOT CAUSE: identify the ONE main problem from the data (not symptoms).
2. WHY: briefly explain why this caused the loss / hurt their game.
3. ACTION: 2 specific, repeatable, measurable behaviors for next game.

Hard rules:
- NEVER list all stats. Highlight only what matters for the diagnosis.
- NEVER use generic advice ("play better", "ward more") — be specific ("place pink in tribush before pushing wave 4 in").
- NEVER praise irrelevantly. If they did one thing well, mention it ONLY if it's a leverage point.
- ALWAYS calibrate to their elo: in low elo focus on mechanics + map awareness, mid elo on macro + vision, high elo on micro decisions.
- Reference exact numbers from data when relevant ("CS@10 was 52, target was 80" not "low CS").
- Max 220 words. No bullet point lists for the actions — prose form.
- Respond in ${lang}.
- Be direct, no fluff. Coach voice: assertive, kind, surgical.
- If the data shows a smurf-stomp / inting opponent: acknowledge briefly but still find the user's biggest improvement opportunity.`;
}

export function professionalMatchPrompt(
  a: ProMatchAnalytics,
  insights: Insight[],
  language: "es" | "en"
): string {
  const fmtTime = (ms: number | null) =>
    ms == null ? "—" : `${(ms / 1000 / 60).toFixed(1)}min`;

  const insightsBlock = insights
    .filter((i) => i.severity === "bad" || i.severity === "warn")
    .map((i) => `- [${i.severity}] ${i.title}: ${i.detail}`)
    .join("\n");

  const enemyComp = a.enemyTeamComposition
    .map((p) => `${p.championName}(${p.position})`)
    .join(", ");
  const myComp = a.myTeamComposition
    .map((p) => `${p.championName}(${p.position})`)
    .join(", ");

  const csTarget = csTargetByRole(a.position);
  const csGap = csTarget - a.cs10;

  return `Analiza esta partida y dame el ROOT CAUSE + 2 acciones específicas.

PARTIDA:
- ${a.win ? "VICTORIA" : "DERROTA"} en ${a.durationMin.toFixed(0)}min · queue ${a.queueId}
- Yo: ${a.myChampionName} ${a.position} → KDA combat final tras la partida
- Vs lane: ${a.laneOpponentChampionName ?? "?"}
- Mi equipo: ${myComp}
- Equipo enemigo: ${enemyComp}

LANE PHASE (CRÍTICO):
- CS@10: ${a.cs10} (target ${a.position}: ${csTarget}, gap ${csGap > 0 ? "-" + csGap : "+" + Math.abs(csGap)})
- CS@14: ${a.cs14}
- Gold@10: ${a.goldAt10}, Gold@15: ${a.goldAt15}
- Level@10: ${a.level10}, Level@14: ${a.level14}
- CS lead vs rival lane @14: ${a.csLeadAt14 > 0 ? "+" : ""}${a.csLeadAt14}
- Gold lead vs rival @15: ${a.goldLeadAt15 > 0 ? "+" : ""}${a.goldLeadAt15}
- Kills personales antes min 10: ${a.killsBy10}

MUERTES:
- Total muertes antes min 10: ${a.deathsBy10}
- Muertes antes min 5: ${a.deathsAt5}
- Solo deaths (sin asistencia enemiga): ${a.soloDeaths}
- Death streak más larga: ${a.longestDeathStreak}
- Lugares donde moriste: ${a.deathLocations.slice(0, 5).join(", ") || "n/a"}

OBJETIVOS:
- Drakes mi equipo / enemigo: ${a.drakesByMyTeam}/${a.drakesByEnemy}
- Barons: ${a.baronsByMyTeam}/${a.baronsByEnemy}
- Primer drake: ${fmtTime(a.firstDragonTime)}
- Primer herald: ${fmtTime(a.firstHeraldTime)}
- Primer baron: ${fmtTime(a.firstBaronTime)}
- Primera torre fue de mi equipo: ${a.firstTowerByMyTeam}

VISIÓN:
- Vision/min: ${a.visionScorePerMin.toFixed(2)}
- Control wards comprados: ${a.controlWardsBought}
- Wards enemigos destruidos: ${a.wardsKilled}
- Pinks colocados antes min 10: ${a.pinksByMin10}

COMBATE / ECONOMÍA:
- Damage por gold gastado: ${a.damagePerGold.toFixed(2)} (target ${dpgTarget(a.position).toFixed(1)})
- Kill participation: ${(a.killParticipation * 100).toFixed(0)}%
- Damage share equipo: ${(a.damageShare * 100).toFixed(0)}%
- Damage tomado share: ${(a.damageTakenShare * 100).toFixed(0)}%
- Tuvo Stopwatch/Zhonya: ${a.hadStopwatch} · QSS: ${a.hadQss}
- Items completados: ${a.itemsPurchasedCount}
- Primer item completado: ${fmtTime(a.firstItemTime)}

REGLAS HEURÍSTICAS DETECTADAS:
${insightsBlock || "ninguna"}

Sigue el framework: ROOT CAUSE → WHY → 2 ACCIONES ESPECÍFICAS. ${language === "en" ? "Respond in English." : "Responde en español."}`;
}

function csTargetByRole(role: string): number {
  switch (role) {
    case "TOP":
      return 75;
    case "JUNGLE":
      return 55;
    case "MIDDLE":
      return 80;
    case "BOTTOM":
      return 85;
    case "UTILITY":
      return 15;
    default:
      return 70;
  }
}

function dpgTarget(role: string): number {
  switch (role) {
    case "BOTTOM":
    case "MIDDLE":
      return 1.4;
    case "JUNGLE":
      return 1.1;
    case "TOP":
      return 1.0;
    case "UTILITY":
      return 0.5;
    default:
      return 1.0;
  }
}
