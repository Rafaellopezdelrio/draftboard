// Win Conditions engine. Derives a 3-point game plan from the team
// composition + the user's champion. Pure heuristic: classifies both
// teams' damage shape, durability, and engage tools, then emits the
// short tactical bullets that "fit" the comp.
//
// Used by WinConditionsPanel to surface a "Game plan" card at champ
// select. Lets the user enter the game with a clear macro objective
// instead of just a pick recommendation. Gold-standard advice quality
// here is what separates a draft tool from a CS-counter.

import type { Champion, ChampionDb, Role } from "../types/champion";

export type CompArchetype =
  | "engage-front-back"   // tanky frontline + carries behind
  | "poke-siege"          // long-range AP + waveclear
  | "pick-burst"          // assassins + lockdown
  | "scaling-late"        // hyper-carries needing time
  | "early-skirmish"      // dive + bruiser brawl
  | "split-1-4"           // 1 carry pushes side, 4 group
  | "mixed";              // no clear archetype

export interface CompProfile {
  archetype: CompArchetype;
  apShare: number;       // 0-1
  adShare: number;       // 0-1
  trueDmg: number;       // count of champs with significant true damage
  engageScore: number;   // sum of hard-engage tools (0..N)
  diveScore: number;     // sum of dive threats
  rangeScore: number;    // weighted long-range presence
  scaleScore: number;    // weighted hyper-carry presence
}

export interface WinCondition {
  /** Concrete tactical objective the user can actually do. */
  text: string;
  /** Phase of the game this applies to. UI sorts by phase. */
  phase: "early" | "mid" | "late" | "any";
  /** Priority — UI may bold the top 2 and grey the rest. */
  priority: 1 | 2 | 3;
}

// Curated champion → trait sets. Same approach as adaptiveBuildEngine —
// small enough to maintain across patches, large enough to cover most
// SoloQ rosters.
const HARD_ENGAGE = new Set([
  "Leona", "Nautilus", "Malphite", "Sett", "Amumu", "Ashe", "Lissandra",
  "Morgana", "Maokai", "Sejuani", "Rell", "Skarner", "Alistar", "Jarvan IV",
  "Galio", "Ornn", "Kennen", "Hecarim", "Rumble",
]);

const DIVE_THREATS = new Set([
  "Camille", "Hecarim", "Irelia", "Jarvan IV", "Vi", "Diana", "Wukong",
  "Olaf", "Lee Sin", "Kha'Zix", "Talon", "Zed", "Akali", "Kassadin", "Yone",
  "Yasuo", "Master Yi", "Tryndamere",
]);

const LONG_RANGE = new Set([
  "Caitlyn", "Jinx", "Varus", "Lux", "Xerath", "Ziggs", "Vel'Koz", "Karthus",
  "Senna", "Heimerdinger", "Zoe", "Ezreal",
]);

const HYPER_CARRY_LATE = new Set([
  "Vayne", "Kog'Maw", "Twitch", "Kayle", "Nasus", "Veigar", "Senna",
  "Master Yi", "Smolder", "Aphelios",
]);

const TRUE_DMG = new Set(["Vayne", "Kayle", "Camille", "Fiora", "Master Yi"]);

const SPLIT_PUSHERS = new Set([
  "Camille", "Fiora", "Trundle", "Tryndamere", "Jax", "Yorick", "Nasus",
  "Sett", "Riven", "Irelia",
]);

function profileTeam(db: ChampionDb, keys: string[]): CompProfile {
  let ap = 0, ad = 0;
  let trueDmg = 0;
  let engageScore = 0;
  let diveScore = 0;
  let rangeScore = 0;
  let scaleScore = 0;

  for (const k of keys) {
    const c = db.champions[k];
    if (!c) continue;
    const tags = new Set(c.tags);
    if (tags.has("Mage") || tags.has("Support")) ap++;
    if (tags.has("Marksman") || tags.has("Fighter")) ad++;
    // Assassins are bi-damage; split by name
    if (tags.has("Assassin")) {
      if (["Akali", "Diana", "Ekko", "Evelynn", "Fizz", "Katarina", "Kassadin", "LeBlanc"].includes(c.name)) ap++;
      else ad++;
    }
    if (TRUE_DMG.has(c.name)) trueDmg++;
    if (HARD_ENGAGE.has(c.name)) engageScore++;
    if (DIVE_THREATS.has(c.name)) diveScore++;
    if (LONG_RANGE.has(c.name)) rangeScore++;
    if (HYPER_CARRY_LATE.has(c.name)) scaleScore += 1.5;
  }
  const total = Math.max(1, ap + ad);
  return {
    archetype: classifyArchetype(engageScore, rangeScore, diveScore, scaleScore),
    apShare: ap / total,
    adShare: ad / total,
    trueDmg,
    engageScore,
    diveScore,
    rangeScore,
    scaleScore,
  };
}

function classifyArchetype(
  engage: number,
  range: number,
  dive: number,
  scale: number
): CompArchetype {
  // Heuristic priority order — first signal that crosses threshold wins.
  if (range >= 3) return "poke-siege";
  if (engage >= 2 && scale >= 2) return "engage-front-back";
  if (dive >= 2 && engage <= 1) return "pick-burst";
  if (scale >= 3) return "scaling-late";
  if (dive >= 3) return "early-skirmish";
  if (dive >= 1 && scale >= 1) return "split-1-4";
  return "mixed";
}

interface DeriveArgs {
  db: ChampionDb;
  myChampionKey: string | null;
  myRole: Role | null;
  allyKeys: string[];
  enemyKeys: string[];
}

/**
 * Returns 3-5 win conditions tailored to the actual comp matchup.
 * Bias toward concrete actions the user can take ("Push waves before
 * Drake spawn") rather than vague platitudes ("play safely"). UI
 * renders them top-priority first.
 */
export function deriveWinConditions({
  db,
  myChampionKey,
  myRole,
  allyKeys,
  enemyKeys,
}: DeriveArgs): WinCondition[] {
  const myChamp: Champion | null =
    myChampionKey ? (db.champions[myChampionKey] ?? null) : null;
  const allies = profileTeam(db, allyKeys.filter((k): k is string => Boolean(k)));
  const enemies = profileTeam(db, enemyKeys.filter((k): k is string => Boolean(k)));
  const conditions: WinCondition[] = [];

  // ---- Macro: when to fight based on comp shape ----
  if (enemies.archetype === "poke-siege") {
    conditions.push({
      text: "Compra wards y evita peleas largas en lane. Fuerza all-ins cortos antes de que su poke acumule daño.",
      phase: "mid",
      priority: 1,
    });
  } else if (enemies.archetype === "engage-front-back") {
    conditions.push({
      text: "Posiciona detrás de tu frontline. Si te engagean primero, su comp gana la peleas. Espera su CD.",
      phase: "mid",
      priority: 1,
    });
  } else if (enemies.archetype === "pick-burst") {
    conditions.push({
      text: "Nunca vayas solo a wards. Pickean cualquier carry sin escolta. Agrupa minutos 14-30.",
      phase: "mid",
      priority: 1,
    });
  } else if (enemies.archetype === "scaling-late") {
    conditions.push({
      text: "Eres más fuerte ahora. Fuerza objetivos y skirmishes ANTES del minuto 25. Late-game = pierdes.",
      phase: "early",
      priority: 1,
    });
  } else if (enemies.archetype === "early-skirmish") {
    conditions.push({
      text: "Su comp peaks 5-15min. Juega seguro la primera oleada, evita gankeo + espera mid-game.",
      phase: "early",
      priority: 1,
    });
  } else if (enemies.archetype === "split-1-4") {
    conditions.push({
      text: "Vigila side-laner enemigo. Pinguea MIA si desaparece. Tu equipo debe forzar 4v4 en mid.",
      phase: "mid",
      priority: 2,
    });
  }

  // ---- Ally-side game plan ----
  if (allies.archetype === "scaling-late") {
    conditions.push({
      text: "Tu equipo escala. Pierde lane controlada > muere por ganar. Stack farm + CS hasta el minuto 25.",
      phase: "early",
      priority: 1,
    });
  }
  if (allies.archetype === "engage-front-back" && allies.engageScore >= 2) {
    conditions.push({
      text: "Tu equipo tiene engage hard. Pingea para forzar peleas en objetivos. No los desperdicies en skirmishes.",
      phase: "mid",
      priority: 2,
    });
  }
  if (allies.archetype === "split-1-4" || (myChamp && SPLIT_PUSHERS.has(myChamp.name))) {
    conditions.push({
      text: "Empuja side opuesto a objetivos. Crea presión 1-3-1. Tu equipo gana al absorber TP/ulti.",
      phase: "late",
      priority: 2,
    });
  }

  // ---- Damage type vs enemy durability ----
  if (enemies.apShare >= 0.55 && allies.adShare >= 0.6) {
    conditions.push({
      text: "Comp enemiga AP-heavy, vosotros AD-heavy. Tu Soporte/Tank debe comprar Mercurial/Wit's End. Coordinad MR temprano.",
      phase: "mid",
      priority: 2,
    });
  }
  if (enemies.adShare >= 0.55 && allies.apShare >= 0.6) {
    conditions.push({
      text: "Equipo enemigo AD-heavy. Tank ally compra Plated/Randuin. Tú builda armor situational si squishy.",
      phase: "mid",
      priority: 2,
    });
  }

  // ---- True damage threat ----
  if (enemies.trueDmg >= 2) {
    conditions.push({
      text: "Múltiples enemigos con daño verdadero — HP raw NO te salva. Combina HP + resistencias + escapes.",
      phase: "late",
      priority: 2,
    });
  }

  // ---- My champion-specific late game ----
  if (myChamp && HYPER_CARRY_LATE.has(myChamp.name)) {
    conditions.push({
      text: `${myChamp.name} es hypercarry. Tu equipo debe peelearte. Pídeles peel y mantente atrás en teamfights.`,
      phase: "late",
      priority: 1,
    });
  }
  if (myChamp && LONG_RANGE.has(myChamp.name) && enemies.diveScore >= 2) {
    conditions.push({
      text: "Su comp tiene dive — ward río + buy Stopwatch/QSS. Su CD principal = tu ventana de peleas.",
      phase: "mid",
      priority: 2,
    });
  }

  // ---- Role-specific, comp-tied tip (uses myRole) ----
  const roleTip = roleCondition(myRole, myChamp, allies, enemies);
  if (roleTip) conditions.push(roleTip);

  // ---- Default if comp is mixed ----
  if (conditions.length === 0) {
    conditions.push({
      text: "Comp equilibrada. Juega objetivos: Dragon stack > Baron tempo > Cierre con Soul/Elder.",
      phase: "any",
      priority: 2,
    });
  }

  // Sort by priority asc, then by phase order
  const phaseOrder = { early: 0, mid: 1, late: 2, any: 3 };
  conditions.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return phaseOrder[a.phase] - phaseOrder[b.phase];
  });

  // Cap at 4 — too many bullets and the user stops reading.
  return conditions.slice(0, 4);
}

/**
 * One role-specific win condition, tied to the comp shape so it stays a
 * concrete read ("ward flanks vs their pick comp") instead of a platitude
 * ("play safe"). Returns null when a more specific condition already covers it.
 */
function roleCondition(
  myRole: Role | null,
  myChamp: Champion | null,
  allies: CompProfile,
  enemies: CompProfile
): WinCondition | null {
  switch (myRole) {
    case "JUNGLE":
      if (allies.archetype === "scaling-late")
        return {
          text: "Jungla: trackea su jungla y farmea seguro — no fuerces ganks que retrasen el escalado de tu equipo.",
          phase: "early",
          priority: 2,
        };
      if (enemies.archetype === "early-skirmish" || enemies.diveScore >= 2)
        return {
          text: "Jungla: su comp pelea early — vive en las lanes, contra-gankea y niégales el tempo.",
          phase: "early",
          priority: 2,
        };
      return {
        text: "Jungla: marcas el tempo de objetivos — empareja cada spawn de dragón con prio de carril.",
        phase: "any",
        priority: 3,
      };
    case "UTILITY":
      if (enemies.archetype === "pick-burst" || enemies.diveScore >= 2)
        return {
          text: "Support: tu visión rompe sus picks — wardea flancos y ríos ANTES de cada objetivo.",
          phase: "mid",
          priority: 2,
        };
      if (allies.engageScore >= 2)
        return {
          text: "Support: tienes engage — busca el primer pick en objetivos, no en lane vacía.",
          phase: "mid",
          priority: 2,
        };
      return {
        text: "Support: ganas el mapa con visión — control ward en cada recall y limpia la suya.",
        phase: "any",
        priority: 3,
      };
    case "MIDDLE":
      if (enemies.archetype === "poke-siege")
        return {
          text: "Mid: presiona oleadas para robar tempo y roamea cuando empujen tu torre.",
          phase: "mid",
          priority: 3,
        };
      return {
        text: "Mid: tras shovear, roamea con prio a side/objetivos — tu impacto está en el mapa.",
        phase: "mid",
        priority: 3,
      };
    case "BOTTOM":
      if (enemies.diveScore >= 2 || enemies.archetype === "pick-burst")
        return {
          text: "ADC: posición lo es todo vs su dive/pick — no des flancos y guarda summoner defensivo para peleas.",
          phase: "late",
          priority: 1,
        };
      return {
        text: "ADC: encuentra tu zona de daño cada pelea — pega desde la última posición segura.",
        phase: "late",
        priority: 2,
      };
    case "TOP":
      // Split tip already covered when the champ is a split pusher.
      if (myChamp && SPLIT_PUSHERS.has(myChamp.name)) return null;
      if (enemies.diveScore >= 2)
        return {
          text: "Top: guarda TP para flanquear peleas — tu mayor impacto es girar con TP, no quedarte aislado.",
          phase: "mid",
          priority: 2,
        };
      return {
        text: "Top: elige split o agrupar según el objetivo — comunica TP antes de cada dragón/Baron.",
        phase: "mid",
        priority: 3,
      };
    default:
      return null;
  }
}
