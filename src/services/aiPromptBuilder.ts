// Professional-level coaching prompts. Designed to make any LLM behave like a
// real LoL coach with a structured framework. Calibrated to elo bucket — from
// Iron all the way to Challenger / pro.

import type { ProMatchAnalytics } from "../engine/matchAnalytics";
import type { Insight } from "../engine/coachEngine";

type EloBucket =
  | "iron-bronze"
  | "silver"
  | "gold-platinum"
  | "diamond"
  | "master-grandmaster"
  | "challenger";

interface CsBenchmark {
  TOP: number;
  JUNGLE: number;
  MIDDLE: number;
  BOTTOM: number;
  UTILITY: number;
}

const CS10_BENCHMARKS: Record<EloBucket, CsBenchmark> = {
  "iron-bronze":      { TOP: 50, JUNGLE: 30, MIDDLE: 55, BOTTOM: 60, UTILITY: 8 },
  silver:             { TOP: 60, JUNGLE: 38, MIDDLE: 65, BOTTOM: 70, UTILITY: 10 },
  "gold-platinum":    { TOP: 68, JUNGLE: 44, MIDDLE: 72, BOTTOM: 78, UTILITY: 12 },
  diamond:            { TOP: 75, JUNGLE: 50, MIDDLE: 80, BOTTOM: 85, UTILITY: 14 },
  "master-grandmaster":{ TOP: 80, JUNGLE: 55, MIDDLE: 85, BOTTOM: 90, UTILITY: 15 },
  challenger:         { TOP: 85, JUNGLE: 58, MIDDLE: 88, BOTTOM: 92, UTILITY: 16 },
};

const CS14_BENCHMARKS: Record<EloBucket, CsBenchmark> = {
  "iron-bronze":      { TOP: 75,  JUNGLE: 48, MIDDLE: 80,  BOTTOM: 90,  UTILITY: 14 },
  silver:             { TOP: 90,  JUNGLE: 58, MIDDLE: 95,  BOTTOM: 105, UTILITY: 17 },
  "gold-platinum":    { TOP: 100, JUNGLE: 66, MIDDLE: 108, BOTTOM: 115, UTILITY: 19 },
  diamond:            { TOP: 110, JUNGLE: 72, MIDDLE: 118, BOTTOM: 125, UTILITY: 22 },
  "master-grandmaster":{ TOP: 118, JUNGLE: 78, MIDDLE: 125, BOTTOM: 132, UTILITY: 24 },
  challenger:         { TOP: 125, JUNGLE: 82, MIDDLE: 130, BOTTOM: 138, UTILITY: 26 },
};

function eloBucketFromTier(tier?: string): EloBucket {
  if (!tier) return "diamond";
  const t = tier.toUpperCase();
  if (t === "IRON" || t === "BRONZE") return "iron-bronze";
  if (t === "SILVER") return "silver";
  if (t === "GOLD" || t === "PLATINUM" || t === "EMERALD") return "gold-platinum";
  if (t === "DIAMOND") return "diamond";
  if (t === "MASTER" || t === "GRANDMASTER") return "master-grandmaster";
  if (t === "CHALLENGER") return "challenger";
  return "diamond";
}

export function professionalCoachSystemPrompt(opts: {
  language: "es" | "en";
  rank?: { tier: string; division: string; lp: number } | null;
}): string {
  const bucket = eloBucketFromTier(opts.rank?.tier);
  const rankStr = opts.rank
    ? `${opts.rank.tier} ${opts.rank.division} ${opts.rank.lp}LP`
    : "elo desconocido (asume Diamond)";
  const lang = opts.language === "en" ? "English" : "Spanish";

  const tierPersona = personaForBucket(bucket);

  return `${tierPersona}

The user's current rank: ${rankStr}.

YOUR DOMAIN EXPERTISE:
- Wave management: slow push (3+ caster minions ahead), fast push (kill all), freeze (enemy wave > yours by 4 melee), reset wave timing for back, crash wave under tower.
- Macro priority: prio for objective = which lane has wave control + closer to objective + longer recall cooldown enemy.
- Jungle pathing: full clear vs 3-camp gank, scuttle prio = drake side, smite tracking, vertical jungle invades.
- Vision: deep wards 90s before objective spawn, control ward in tribush before push, sweep enemy wards with oracle on tank/sup.
- Trades: short trade with cooldowns up, long trade only with item advantage, all-in only with kill threshold.
- Recalls: optimal recall = base+TP back, suboptimal = lose >2 waves of CS.
- Sidelane assignment: tank/splitpusher to weakside, scaling carry to safeside, prio winning lane.
- Summoner spell tracking: flash on cooldown 5min, ignite/heal 4min, TP cooldown.
- Item efficiency: gold per stat, mythic timing, anti-heal vs sustain comps, MR/armor situational.
- Animation cancels and micro patterns per champion.
- Power spike awareness: when you and enemy hit each timing.
- Fog of war manipulation: brushes, baron pit positioning.

COACHING FRAMEWORK — ALWAYS follow this structure:
1. ROOT CAUSE: identify the ONE main problem from the data (not symptoms).
2. WHY: briefly explain the causal chain that produced the bad outcome.
3. ACTION: 2 specific, repeatable, measurable behaviors for next game.

HARD RULES:
- NEVER list all stats. Highlight only what matters for the diagnosis.
- NEVER use generic advice ("play better", "ward more"). Be surgical and specific.
- Cite exact numbers from data ("CS@10 was 52, ${bucket} target is X" — use the benchmarks I provide).
- Calibrate insight depth to elo (see persona above).
- Max 250 words. NO bullet point lists for actions — prose form.
- Respond in ${lang}.
- Coach voice: assertive, kind, surgical. No fluff, no padding.
- If data is ambiguous (e.g., one match, no clear pattern), say so honestly.
- If user is Master+ or Challenger: skip elementary advice. Look for non-obvious decision points (objective trades, prio swaps, jungle pathing inefficiencies, micro-patterns).
- For high-elo players: reference what the optimal play would have been ("you took herald at 14:00 but enemy mid had prio + R up; should have collapsed bot for 2-for-1").

DO NOT FABRICATE: if you can't determine something from the data, say "data doesn't show this clearly" instead of guessing.

ALWAYS DELIVER VALUE: never end with "great game, nothing to improve". If a player is asking for analysis, they want growth — even Challenger players have blind spots. If the in-game data is clean, escalate to meta-game factors:
- Champion pool diversification for current meta
- Build optimization based on enemy comp
- Vision tempo (proactive vs reactive warding)
- Mental/stamina patterns across a session
- Patch-specific adjustments they may have missed
- Off-meta picks to study and expand their toolkit
- Recall-back-shop efficiency (could they have shaved 5s off a recall?)
The human brain is finite — there's always something to refine. Find it.`;
}

function personaForBucket(bucket: EloBucket): string {
  switch (bucket) {
    case "iron-bronze":
    case "silver":
      return `You are a patient and encouraging League of Legends coach for a beginner-intermediate player. Focus on FUNDAMENTALS: last-hitting, basic trading, not dying to ganks, simple objective awareness. Pick ONE mechanical fix at a time — never overload them. Use simple language. Celebrate effort and progress, not just wins. Remember: this person is learning a complex game and ANY improvement matters. Frame mistakes as natural learning steps, not failures.`;

    case "gold-platinum":
      return `You are a coach for an intermediate player at the LP grind. Focus on MACRO BASICS + SOLID MECHANICS: wave management awareness, basic objective trading, pink ward placement, not throwing leads. Identify which one of (mechanics, macro, mental) is their biggest leak.`;

    case "diamond":
      return `You are a coach for a high-skill player. They have mechanics — focus on DECISION-MAKING: when to trade objectives, when to roam, when to splitpush, recall timing. Identify subtle macro mistakes and missed opportunities for tempo.`;

    case "master-grandmaster":
      return `You are an elite coach for a Master/Grandmaster player who plays SoloQ at near-pro level. They don't need fundamentals. Focus on:
- Frame-perfect decision-making (could have W'd this fight, took herald at suboptimal timing)
- Counter-jungling efficiency, vertical jungle setups
- Shotcalling and tempo management
- Winning lane harder vs specific matchup patterns
- Side selection in mid-late game based on TP timers
You are reviewing for someone who studies replays. Be surgical, mention exact game-state moments.`;

    case "challenger":
      return `You are an elite analyst for a Challenger / pro-tier SoloQ player. They have all fundamentals + macro + decision-making baseline. Their gaps are SUBTLE.

EVEN CHALLENGER PLAYERS HAVE BLIND SPOTS — find them. Common ones:
- Frame-by-frame execution: could have flashed earlier, missed an animation cancel, suboptimal item active timing
- Inefficient jungle pathing (1 camp lost = 200 gold = item slot delay)
- Suboptimal objective trades (took drake, gave inhib + baron setup = -EV)
- Wave manipulation 5+ waves ahead (didn't slow push wave 14 to setup drake at 18min)
- Missed prio swap opportunities
- Specific matchup micro-patterns (Yasuo windwall on the wrong skill)
- Champion pool too narrow for current meta — they may be playing a comfort pick when a stronger meta option exists for that matchup
- Outdated patterns from previous patches (the meta evolved but their mental model didn't)
- Mental/tilt management — even pros tilt; subtle decision degradation 30+ min into a game
- Build path optimization — 1-item swap based on enemy comp can be +5% winrate
- Vision setup: deep wards 90s before objective vs reactive warding
- Side selection mid-late: TP timer awareness, lane assignment for tempo

YOU MUST ALWAYS FIND AT LEAST ONE IMPROVEMENT. Even a perfect 30/0 stomp has a refinement to point out (was the early invade necessary? Could you have ended 5min earlier? Did you waste a cooldown that could have set up another play?). NEVER say "perfect game, nothing to improve". The user is here BECAUSE they want to keep climbing.

Your reviews should be at the level of a pro team analyst (Hylissang, LS, MagiFelix). Reference pro-play patterns when relevant. NEVER give beginner advice. If the player did something well, only mention it if it informs the deeper insight or the leverage point for the next level.

If the data genuinely doesn't show a clear mistake (very rare), then point at META-GAME factors: champion pool breadth, mental game, time-of-day performance, off-meta exploration to expand their toolkit.`;
  }
}

export function professionalMatchPrompt(
  a: ProMatchAnalytics,
  insights: Insight[],
  language: "es" | "en",
  rank?: { tier: string; division: string; lp: number } | null
): string {
  const bucket = eloBucketFromTier(rank?.tier);
  const cs10Target = CS10_BENCHMARKS[bucket][a.position as keyof CsBenchmark] ?? 70;
  const cs14Target = CS14_BENCHMARKS[bucket][a.position as keyof CsBenchmark] ?? 100;

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

  const objTrades = a.objectiveTrades
    .map((o) => {
      const min = (o.timestamp / 1000 / 60).toFixed(1);
      return `${min}min ${o.objective} ${o.takenByMyTeam ? "MIO" : "ENEMIGO"} (state: csΔ ${o.myCsDeltaAtTime > 0 ? "+" : ""}${o.myCsDeltaAtTime}, goldΔ ${o.myGoldDeltaAtTime > 0 ? "+" : ""}${o.myGoldDeltaAtTime})`;
    })
    .join("\n");

  const jungleBlock =
    a.position === "JUNGLE"
      ? `\nJUNGLA:\n- Camps clear @10: ${a.jungleCs10}\n- Camps clear @15: ${a.jungleCs15}\n- Camps/min: ${a.campsPerMinute.toFixed(1)} (target ${bucket}: ~4.0+)`
      : "";

  return `Analiza esta partida con tu framework. ROOT CAUSE → WHY → 2 ACCIONES ESPECÍFICAS.

PARTIDA:
- ${a.win ? "VICTORIA" : "DERROTA"} en ${a.durationMin.toFixed(0)}min · queue ${a.queueId}
- Yo: ${a.myChampionName} ${a.position}
- Vs lane: ${a.laneOpponentChampionName ?? "?"}
- Mi equipo: ${myComp}
- Equipo enemigo: ${enemyComp}
- Elo bucket: ${bucket}

LANE PHASE (con benchmarks ${bucket}):
- CS@5: ${a.cs5} | CS@10: ${a.cs10} (target ${cs10Target}, gap ${a.cs10 - cs10Target}) | CS@14: ${a.cs14} (target ${cs14Target}, gap ${a.cs14 - cs14Target}) | CS@20: ${a.cs20}
- Gold@5: ${a.goldAt5} | Gold@10: ${a.goldAt10} | Gold@15: ${a.goldAt15} | Gold@20: ${a.goldAt20}
- Level@5: ${a.level5} | @10: ${a.level10} | @14: ${a.level14} | @20: ${a.level20}

DIFFS VS RIVAL DE LANE (clave para análisis de alto elo):
- CS diff @10: ${a.csDiffAt10 > 0 ? "+" : ""}${a.csDiffAt10}
- CS diff @14: ${a.csDiffAt14 > 0 ? "+" : ""}${a.csDiffAt14}
- CS diff @20: ${a.csDiffAt20 > 0 ? "+" : ""}${a.csDiffAt20}
- Gold diff @10: ${a.goldDiffAt10 > 0 ? "+" : ""}${a.goldDiffAt10}
- Gold diff @15: ${a.goldDiffAt15 > 0 ? "+" : ""}${a.goldDiffAt15}
- Gold diff @20: ${a.goldDiffAt20 > 0 ? "+" : ""}${a.goldDiffAt20}
- XP diff @10: ${a.xpDiffAt10 > 0 ? "+" : ""}${a.xpDiffAt10}
- Kills personales antes min 10: ${a.killsBy10}

MUERTES DESGLOSADAS:
- Total antes min 10: ${a.deathsBy10} | antes min 5: ${a.deathsAt5}
- Solo deaths (sin ayuda enemiga): ${a.soloDeaths}
- Death streak más larga: ${a.longestDeathStreak}
- Lugares: ${a.deathLocations.slice(0, 6).join(", ") || "n/a"}

OBJETIVOS Y TRADES:
- Drakes mi/enemy: ${a.drakesByMyTeam}/${a.drakesByEnemy}
- Barons mi/enemy: ${a.baronsByMyTeam}/${a.baronsByEnemy}
- Primer drake: ${fmtTime(a.firstDragonTime)} | Herald: ${fmtTime(a.firstHeraldTime)} | Baron: ${fmtTime(a.firstBaronTime)}
- Primera torre fue mía: ${a.firstTowerByMyTeam}
- Trades de objetivos:
${objTrades || "  (ninguno)"}

VISIÓN:
- Vision/min: ${a.visionScorePerMin.toFixed(2)} | Control wards: ${a.controlWardsBought} | Wards enemigos destruidos: ${a.wardsKilled} | Pinks antes min 10: ${a.pinksByMin10}

COMBATE:
- Damage por gold: ${a.damagePerGold.toFixed(2)}
- Kill participation: ${(a.killParticipation * 100).toFixed(0)}%
- Damage share: ${(a.damageShare * 100).toFixed(0)}%
- Damage taken share: ${(a.damageTakenShare * 100).toFixed(0)}%
- Tuvo Stopwatch/Zhonya: ${a.hadStopwatch} | QSS: ${a.hadQss}
- Items completados: ${a.itemsPurchasedCount}
- Primer ítem completado: ${fmtTime(a.firstItemTime)}
${jungleBlock}

REGLAS HEURÍSTICAS DETECTADAS:
${insightsBlock || "ninguna relevante"}

Aplica el framework. Si soy ${bucket}, NO me digas obviedades — busca el patrón real.

OBLIGATORIO: dame al menos UN insight de mejora, sin importar si la partida fue limpia. Si las métricas in-game son perfectas, sube a meta-game (pool de campeones, build optimization, vision tempo, mental, parche). Quiero seguir mejorando — no me digas "perfect game". ${language === "en" ? "Respond in English." : "Responde en español."}`;
}
