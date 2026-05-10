import type {
  MatchFull,
  MatchParticipant,
  MatchTimeline,
} from "../services/riotApi";

export type Severity = "info" | "warn" | "bad" | "good";
export type Category =
  | "farming"
  | "vision"
  | "deaths"
  | "macro"
  | "combat"
  | "objectives"
  | "build";

export interface Insight {
  category: Category;
  severity: Severity;
  title: string;
  detail: string;
  metric?: string;
  action?: string;
}

interface AnalyzeArgs {
  match: MatchFull;
  timeline: MatchTimeline;
  myPuuid: string;
}

// Reference benchmarks per role for several elos. Coach picks the closest
// to the user's current rank.
type EloBucket = "iron-bronze" | "silver" | "gold-platinum" | "diamond" | "master+";
const CS_PER_MIN_BY_ELO: Record<EloBucket, Record<string, number>> = {
  "iron-bronze": { TOP: 4.5, JUNGLE: 3.5, MIDDLE: 5.0, BOTTOM: 5.5, UTILITY: 1.0 },
  silver:        { TOP: 5.5, JUNGLE: 4.3, MIDDLE: 6.0, BOTTOM: 6.5, UTILITY: 1.2 },
  "gold-platinum":{ TOP: 6.3, JUNGLE: 4.8, MIDDLE: 6.8, BOTTOM: 7.3, UTILITY: 1.4 },
  diamond:       { TOP: 7.0, JUNGLE: 5.5, MIDDLE: 7.5, BOTTOM: 8.0, UTILITY: 1.5 },
  "master+":     { TOP: 7.7, JUNGLE: 5.9, MIDDLE: 8.0, BOTTOM: 8.4, UTILITY: 1.6 },
};

let CURRENT_ELO_BUCKET: EloBucket = "diamond";

export function setCoachEloBucket(tier: string | undefined) {
  if (!tier) return;
  const t = tier.toUpperCase();
  if (t === "IRON" || t === "BRONZE") CURRENT_ELO_BUCKET = "iron-bronze";
  else if (t === "SILVER") CURRENT_ELO_BUCKET = "silver";
  else if (t === "GOLD" || t === "PLATINUM" || t === "EMERALD") CURRENT_ELO_BUCKET = "gold-platinum";
  else if (t === "DIAMOND") CURRENT_ELO_BUCKET = "diamond";
  else if (t === "MASTER" || t === "GRANDMASTER" || t === "CHALLENGER")
    CURRENT_ELO_BUCKET = "master+";
}

const CS_PER_MIN_TARGET: Record<string, number> = new Proxy({} as Record<string, number>, {
  get: (_t, p: string) => CS_PER_MIN_BY_ELO[CURRENT_ELO_BUCKET][p] ?? 6,
});

const VISION_SCORE_PER_MIN_TARGET: Record<string, number> = {
  TOP: 0.7,
  JUNGLE: 0.9,
  MIDDLE: 0.8,
  BOTTOM: 0.7,
  UTILITY: 1.6,
};

const DAMAGE_SHARE_TARGET: Record<string, number> = {
  TOP: 0.22,
  JUNGLE: 0.18,
  MIDDLE: 0.27,
  BOTTOM: 0.28,
  UTILITY: 0.1,
};

export function analyzeMatch({
  match,
  timeline,
  myPuuid,
}: AnalyzeArgs): Insight[] {
  const me = match.participants.find((p) => p.puuid === myPuuid);
  if (!me) return [];

  const myParticipantId = me.participantId;
  const myTeamId = me.teamId;
  const team = match.participants.filter((p) => p.teamId === myTeamId);
  const enemy = match.participants.filter((p) => p.teamId !== myTeamId);
  const minutes = match.durationSec / 60;
  const role = me.position;

  const out: Insight[] = [];

  out.push(...checkFarming(me, role, minutes));
  out.push(...checkVision(me, role, minutes));
  out.push(...checkDeaths(me, myParticipantId, timeline, minutes));
  out.push(...checkKillParticipation(me, team));
  out.push(...checkDamageShare(me, team, role));
  out.push(...checkObjectives(me, myTeamId, timeline));
  out.push(...checkBuildVsEnemy(me, enemy));
  out.push(...checkGoldEfficiency(me, team, minutes));
  out.push(...checkDamagePerGold(me, role));
  out.push(...checkFirstBlood(me, myParticipantId, timeline));
  out.push(...checkSnowball(me, minutes));
  out.push(...checkLanePhase(me, role, timeline, myParticipantId));

  // Sort: bad first, then warn, then good, then info
  const order: Severity[] = ["bad", "warn", "good", "info"];
  out.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return out;
}

function checkFarming(me: MatchParticipant, role: string, minutes: number): Insight[] {
  if (role === "UTILITY") return [];
  const target = CS_PER_MIN_TARGET[role] ?? 6;
  const cspm = me.cs / minutes;
  if (cspm < target * 0.7) {
    return [
      {
        category: "farming",
        severity: "bad",
        title: "CS muy bajo",
        detail: `Conseguiste ${cspm.toFixed(1)} CS/min. El objetivo en ${role} es ${target.toFixed(1)}+.`,
        metric: `${me.cs} CS en ${minutes.toFixed(0)}min`,
        action: "Practica last-hits en modo práctica 5 min antes de jugar. Foco en wave management.",
      },
    ];
  }
  if (cspm < target * 0.9) {
    return [
      {
        category: "farming",
        severity: "warn",
        title: "CS mejorable",
        detail: `${cspm.toFixed(1)} CS/min. Margen para llegar a ${target.toFixed(1)}.`,
        action: "Vuelve siempre a la lane con peón y aprovecha waves antes de roams.",
      },
    ];
  }
  if (cspm >= target) {
    return [
      {
        category: "farming",
        severity: "good",
        title: "Buen farm",
        detail: `${cspm.toFixed(1)} CS/min — por encima del objetivo en ${role}.`,
      },
    ];
  }
  return [];
}

function checkVision(me: MatchParticipant, role: string, minutes: number): Insight[] {
  const target = VISION_SCORE_PER_MIN_TARGET[role] ?? 0.8;
  const vspm = me.visionScore / minutes;
  if (vspm < target * 0.6) {
    return [
      {
        category: "vision",
        severity: "bad",
        title: "Visión muy baja",
        detail: `Vision score ${me.visionScore} (${vspm.toFixed(2)}/min). Objetivo: ${target.toFixed(2)}+/min.`,
        metric: `${me.wardsPlaced} wards puestas, ${me.controlWardsBought} control wards`,
        action: "Compra control ward en cada vuelta a base. Pon ward antes de empujar.",
      },
    ];
  }
  if (me.controlWardsBought < Math.floor(minutes / 8)) {
    return [
      {
        category: "vision",
        severity: "warn",
        title: "Pocos control wards",
        detail: `Solo compraste ${me.controlWardsBought} control wards en ${minutes.toFixed(0)}min.`,
        action: "Cómpralos siempre que vuelvas a base si tienes 75g sobrantes.",
      },
    ];
  }
  return [];
}

function checkDeaths(
  me: MatchParticipant,
  myParticipantId: number,
  timeline: MatchTimeline,
  minutes: number
): Insight[] {
  let earlyDeaths = 0;
  let soloDeaths = 0;
  for (const frame of timeline.frames) {
    for (const ev of frame.events) {
      if (ev.type !== "CHAMPION_KILL") continue;
      const e = ev as Extract<typeof ev, { type: "CHAMPION_KILL" }>;
      if (e.victimId !== myParticipantId) continue;
      const t = e.timestamp / 1000 / 60;
      if (t < 8) earlyDeaths++;
      const assists = (e.assistingParticipantIds ?? []).length;
      if (assists === 0) soloDeaths++;
    }
  }

  const out: Insight[] = [];
  if (earlyDeaths >= 3) {
    out.push({
      category: "deaths",
      severity: "bad",
      title: `${earlyDeaths} muertes en early`,
      detail: "Moriste demasiado antes del minuto 8.",
      action: "Juega más pasivo hasta nivel 6. Pushea solo cuando tengas visión del jungla.",
    });
  } else if (earlyDeaths >= 2) {
    out.push({
      category: "deaths",
      severity: "warn",
      title: `${earlyDeaths} muertes tempranas`,
      detail: "Cuida más el early — los ganks son letales sin items.",
    });
  }

  if (me.deaths >= 8 && minutes < 30) {
    out.push({
      category: "deaths",
      severity: "bad",
      title: "Muchas muertes",
      detail: `${me.deaths} muertes en ${minutes.toFixed(0)}min.`,
      action: "Cuando vayas perdiendo, juega seguro y espera a que el equipo se reagrupe. Cada muerte da oro al rival.",
    });
  }

  if (soloDeaths >= 3) {
    out.push({
      category: "deaths",
      severity: "warn",
      title: `${soloDeaths} solo deaths`,
      detail: "Te pillaron solo varias veces. Es el patrón más punible en SoloQ.",
      action: "No empujes sin visión. No te salgas hacia el enemigo cuando los aliados están lejos.",
    });
  }

  return out;
}

function checkKillParticipation(me: MatchParticipant, team: MatchParticipant[]): Insight[] {
  const teamKills = team.reduce((a, p) => a + p.kills, 0);
  if (teamKills === 0) return [];
  const kp = (me.kills + me.assists) / teamKills;
  if (kp < 0.4) {
    return [
      {
        category: "macro",
        severity: "warn",
        title: "Participación baja",
        detail: `Solo participaste en ${(kp * 100).toFixed(0)}% de las kills del equipo.`,
        action: "Acude a teamfights. Si tu lane no necesita atención, hace roam o agrupa.",
      },
    ];
  }
  if (kp >= 0.7) {
    return [
      {
        category: "macro",
        severity: "good",
        title: "Excelente participación",
        detail: `${(kp * 100).toFixed(0)}% KP — siempre estuviste en las jugadas.`,
      },
    ];
  }
  return [];
}

function checkDamageShare(
  me: MatchParticipant,
  team: MatchParticipant[],
  role: string
): Insight[] {
  const teamDmg = team.reduce((a, p) => a + p.totalDamageDealtToChampions, 0);
  if (teamDmg === 0) return [];
  const share = me.totalDamageDealtToChampions / teamDmg;
  const target = DAMAGE_SHARE_TARGET[role] ?? 0.2;
  if (share < target * 0.6 && (role === "MIDDLE" || role === "BOTTOM")) {
    return [
      {
        category: "combat",
        severity: "bad",
        title: "Daño muy bajo",
        detail: `Hiciste ${(share * 100).toFixed(0)}% del daño del equipo (objetivo en ${role}: ${(target * 100).toFixed(0)}%).`,
        action: "Posiciónate mejor en teamfights — necesitas mantenerte vivo y disparar todo el fight.",
      },
    ];
  }
  return [];
}

function checkObjectives(
  me: MatchParticipant,
  myTeamId: number,
  timeline: MatchTimeline
): Insight[] {
  let lostDragons = 0;
  let lostBarons = 0;
  for (const frame of timeline.frames) {
    for (const ev of frame.events) {
      if (ev.type !== "ELITE_MONSTER_KILL") continue;
      const e = ev as Extract<typeof ev, { type: "ELITE_MONSTER_KILL" }>;
      const killerTeam = e.killerId > 5 ? 200 : 100;
      const enemyTook = killerTeam !== myTeamId;
      if (!enemyTook) continue;
      if (e.monsterType === "DRAGON") lostDragons++;
      if (e.monsterType === "BARON_NASHOR") lostBarons++;
    }
  }
  const out: Insight[] = [];
  if (lostDragons >= 4) {
    out.push({
      category: "objectives",
      severity: "warn",
      title: "Dragones perdidos",
      detail: `Tu equipo cedió ${lostDragons} dragones (alma del rival muy probable).`,
      action: "Coordínate con el jungla en el spawn de drakes (cada 5 min). Empuja waves laterales antes.",
    });
  }
  if (lostBarons >= 1 && me.position !== "JUNGLE") {
    out.push({
      category: "objectives",
      severity: "info",
      title: "Baron al rival",
      detail: "El rival cogió Baron — recuerda contestar el siguiente con visión río preparada.",
    });
  }
  return out;
}

function checkGoldEfficiency(
  me: MatchParticipant,
  team: MatchParticipant[],
  minutes: number
): Insight[] {
  const teamGold = team.reduce((a, p) => a + p.goldEarned, 0);
  if (teamGold === 0) return [];
  const goldShare = me.goldEarned / teamGold;
  const gpm = me.goldEarned / minutes;
  if (me.position === "BOTTOM" && goldShare < 0.2) {
    return [
      {
        category: "macro",
        severity: "warn",
        title: "Oro bajo como ADC",
        detail: `${(goldShare * 100).toFixed(0)}% del oro del equipo. Como carry deberías estar entre 25-30%.`,
        action: "Llega a las waves rápido tras teamfights. No mueras innecesariamente.",
      },
    ];
  }
  if ((me.position === "MIDDLE" || me.position === "TOP") && gpm < 320) {
    return [
      {
        category: "macro",
        severity: "warn",
        title: "GPM bajo",
        detail: `${gpm.toFixed(0)} oro/min. Diamond promedio en ${me.position}: 380+.`,
        action: "Usa el push de wave para volver a base con oro y rotar; no farmees pasivo cuando te toca rotar.",
      },
    ];
  }
  return [];
}

function checkDamagePerGold(me: MatchParticipant, role: string): Insight[] {
  if (me.goldEarned === 0) return [];
  const dpg = me.totalDamageDealtToChampions / me.goldEarned;
  // Rough thresholds: ADC/Mid > 1.4, Top > 1.0, JG > 1.1, Sup > 0.5
  const target =
    role === "BOTTOM" || role === "MIDDLE" ? 1.4 : role === "JUNGLE" ? 1.1 : role === "TOP" ? 1.0 : 0.5;
  if (dpg < target * 0.6) {
    return [
      {
        category: "combat",
        severity: "warn",
        title: "Daño por oro bajo",
        detail: `${dpg.toFixed(2)} dmg/gold. Objetivo: ${target.toFixed(1)}+. Compraste items y no los usaste para hacer daño.`,
        action: "En teamfights, posiciónate para meter daño SIN morir antes. Espera el frontline tank.",
      },
    ];
  }
  return [];
}

function checkFirstBlood(
  _me: MatchParticipant,
  myParticipantId: number,
  timeline: MatchTimeline
): Insight[] {
  let firstKill: { ts: number; killerId: number; victimId: number } | null = null;
  for (const f of timeline.frames) {
    for (const ev of f.events) {
      if (ev.type !== "CHAMPION_KILL") continue;
      const e = ev as Extract<typeof ev, { type: "CHAMPION_KILL" }>;
      if (!firstKill || e.timestamp < firstKill.ts) {
        firstKill = { ts: e.timestamp, killerId: e.killerId, victimId: e.victimId };
      }
    }
  }
  if (!firstKill) return [];
  if (firstKill.victimId === myParticipantId) {
    return [
      {
        category: "deaths",
        severity: "warn",
        title: "First blood en tu contra",
        detail: `Moriste en el primer kill de la partida (${(firstKill.ts / 1000 / 60).toFixed(1)}min).`,
        action: "Juega más seguro en early. Wardea jungla o evita pushear sin visión.",
      },
    ];
  }
  if (firstKill.killerId === myParticipantId) {
    return [
      {
        category: "macro",
        severity: "good",
        title: "First blood",
        detail: "Conseguiste el primer kill — buena lectura del momento.",
      },
    ];
  }
  return [];
}

function checkSnowball(me: MatchParticipant, minutes: number): Insight[] {
  // If you got 5+ kills in <20min, you snowballed. If >0/0/0 at 20min, you didn't.
  if (minutes < 20) return [];
  const earlyAggressive = me.kills + me.assists >= 6 && me.deaths <= 2;
  if (earlyAggressive && me.win) {
    return [
      {
        category: "combat",
        severity: "good",
        title: "Snowball ejecutado",
        detail: `${me.kills}/${me.deaths}/${me.assists} — convertiste la lead en victoria.`,
      },
    ];
  }
  if (earlyAggressive && !me.win) {
    return [
      {
        category: "macro",
        severity: "warn",
        title: "Lead desperdiciada",
        detail: `${me.kills}/${me.deaths}/${me.assists} pero perdiste. Snowball necesita objetivos, no solo kills.`,
        action: "Después de una kill: empuja wave, mira drake/herald, prox-ward. Convierte oro en mapa.",
      },
    ];
  }
  return [];
}

function checkLanePhase(
  _me: MatchParticipant,
  role: string,
  timeline: MatchTimeline,
  myParticipantId: number
): Insight[] {
  if (role === "JUNGLE" || role === "UTILITY") return [];
  // CS at 14min benchmark (end of lane phase): Diamond mid/top ~110, ADC ~130
  const frame14 = timeline.frames.find((f) => f.timestamp >= 14 * 60 * 1000);
  if (!frame14) return [];
  const me14 = frame14.participantFrames[String(myParticipantId)];
  if (!me14) return [];
  const cs14 = me14.minionsKilled + me14.jungleMinionsKilled;
  const target = role === "BOTTOM" ? 130 : 105;
  if (cs14 < target * 0.7) {
    return [
      {
        category: "farming",
        severity: "bad",
        title: `CS@14 muy bajo: ${cs14}`,
        detail: `Objetivo en ${role}: ${target}+. Saliste de lane phase sin oro.`,
        action: "Trabaja wave management. No abandones lane sin recoger la wave que empujaste.",
      },
    ];
  }
  return [];
}

function checkBuildVsEnemy(me: MatchParticipant, enemy: MatchParticipant[]): Insight[] {
  // Very rough magic vs physical heuristic by champion id parity won't work — skip.
  // Use damage taken as proxy for whether your build matched.
  // For now placeholder; can be expanded with item DB.
  if (me.totalDamageTaken === 0 || enemy.length === 0) return [];
  return [];
}
