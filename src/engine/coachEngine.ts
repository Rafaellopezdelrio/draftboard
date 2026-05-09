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

// Reference benchmarks per role (rough Diamond averages, used as targets).
const CS_PER_MIN_TARGET: Record<string, number> = {
  TOP: 7.0,
  JUNGLE: 5.5,
  MIDDLE: 7.5,
  BOTTOM: 8.0,
  UTILITY: 1.5,
};

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

function checkBuildVsEnemy(me: MatchParticipant, enemy: MatchParticipant[]): Insight[] {
  // Very rough magic vs physical heuristic by champion id parity won't work — skip.
  // Use damage taken as proxy for whether your build matched.
  // For now placeholder; can be expanded with item DB.
  if (me.totalDamageTaken === 0 || enemy.length === 0) return [];
  return [];
}
