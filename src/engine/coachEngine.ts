import type {
  MatchFull,
  MatchParticipant,
  MatchTimeline,
} from "../services/riotApi";
import { DAMAGE_SHARE_TARGET, isRiftQueue } from "./rankBenchmarks";
import { i18n } from "../i18n";
import { earlyKillsBy, lanePairs, ROLE_LANE, type LanePair } from "./laneMatchups";

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
  /** Data Dragon tags of an item ("Armor", "SpellBlock"…); [] when unknown. */
  itemTags?: (itemId: number) => string[];
  /** Champion name for the texts; "#id" when unknown. */
  championName?: (championId: number) => string;
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

/** Post-game insight text, in the app language (coach.insights.*). */
const T = (key: string, params?: Record<string, string | number>): string =>
  i18n.t(`coach.insights.${key}`, params);
/** "MIDDLE" → "mid" (es/en); unknown positions are shown as they come. */
const roleLabel = (role: string): string =>
  role ? i18n.t(`coach.roles.${role}`, { defaultValue: role }) : role;

const VISION_SCORE_PER_MIN_TARGET: Record<string, number> = {
  TOP: 0.7,
  JUNGLE: 0.9,
  MIDDLE: 0.8,
  BOTTOM: 0.7,
  UTILITY: 1.6,
};

export function analyzeMatch({
  match,
  timeline,
  myPuuid,
  itemTags = () => [],
  championName = (id) => `#${id}`,
}: AnalyzeArgs): Insight[] {
  const me = match.participants.find((p) => p.puuid === myPuuid);
  if (!me) return [];
  // ARAM / Arena / URF: Summoner's Rift lane, vision and death rules don't apply.
  if (!isRiftQueue(match.queueId)) return [];

  const myParticipantId = me.participantId;
  const myTeamId = me.teamId;
  const team = match.participants.filter((p) => p.teamId === myTeamId);
  const enemy = match.participants.filter((p) => p.teamId !== myTeamId);
  const minutes = match.durationSec / 60;
  // Guard against remakes / corrupt duration: dividing CS, vision, gold etc.
  // by 0 (or a sub-minute value) yields Infinity/NaN and surfaces nonsense
  // insights ("Buen farm" with Infinity CS/min). No meaningful coaching from
  // a <1min game anyway.
  if (!Number.isFinite(minutes) || minutes < 1) return [];
  const role = me.position;

  const out: Insight[] = [];

  out.push(...checkFarming(me, role, minutes));
  out.push(...checkVision(me, role, minutes));
  out.push(...checkTrinket(me, myParticipantId, timeline, role, minutes));
  out.push(...checkDeaths(me, myParticipantId, timeline, minutes, role, new Set(team.map((p) => p.participantId))));
  out.push(...checkKillParticipation(me, team));
  out.push(...checkDamageShare(me, team, role));
  out.push(...checkObjectives(me, myTeamId, timeline));
  out.push(...checkBuildVsEnemy(enemy, me, itemTags));
  out.push(...checkGoldEfficiency(me, team, minutes));
  out.push(...checkDamagePerGold(me, role));
  out.push(...checkFirstBlood(me, myParticipantId, timeline));
  out.push(...checkSnowball(me, minutes));
  out.push(...checkLanePhase(me, role, timeline, myParticipantId));
  const pairs = lanePairs(match, timeline, myTeamId);
  out.push(...checkLaneMatchup(me, role, pairs, timeline, championName));
  out.push(...checkWhereLost(me, pairs, championName));

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
        title: T("farmLowTitle"),
        detail: T("farmLowDetail", { cspm: cspm.toFixed(1), role: roleLabel(role), target: target.toFixed(1) }),
        metric: T("farmLowMetric", { cs: me.cs, min: minutes.toFixed(0) }),
        action: T("farmLowAction"),
      },
    ];
  }
  if (cspm < target * 0.9) {
    return [
      {
        category: "farming",
        severity: "warn",
        title: T("farmMehTitle"),
        detail: T("farmMehDetail", { cspm: cspm.toFixed(1), target: target.toFixed(1) }),
        action: T("farmMehAction"),
      },
    ];
  }
  if (cspm >= target) {
    return [
      {
        category: "farming",
        severity: "good",
        title: T("farmGoodTitle"),
        detail: T("farmGoodDetail", { cspm: cspm.toFixed(1), role: roleLabel(role) }),
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
        title: T("visionLowTitle"),
        detail: T("visionLowDetail", { score: me.visionScore, vspm: vspm.toFixed(2), target: target.toFixed(2) }),
        metric: T("visionLowMetric", { wards: me.wardsPlaced, control: me.controlWardsBought }),
        action: T("visionLowAction"),
      },
    ];
  }
  if (me.controlWardsBought < Math.floor(minutes / 8)) {
    return [
      {
        category: "vision",
        severity: "warn",
        title: T("controlWardsTitle"),
        detail: T("controlWardsDetail", { n: me.controlWardsBought, min: minutes.toFixed(0) }),
        action: T("controlWardsAction"),
      },
    ];
  }
  return [];
}

export const ORACLE_LENS = 3364;
export const FARSIGHT_ALTERATION = 3363;
/** From minute 15 a support, jungler or ADC should be off the Stealth Ward:
 * the live coach says it out loud then, and the post-game coach flags a swap
 * that never happened or came after it. Shared with liveCoachEngine. */
export const TRINKET_SWAP_MIN = 15;
/** Farsight Alteration (the ADC swap) can only be bought from level 9. */
export const FARSIGHT_MIN_LEVEL = 9;
/** Time to get back to base and swap once it is due before calling it late. */
const TRINKET_GRACE_MIN = 2;
const TRINKET_NEVER_KEY: Record<string, string> = {
  UTILITY: "coach.trinket.neverSupport",
  JUNGLE: "coach.trinket.neverJungle",
  BOTTOM: "coach.trinket.neverAdc",
};

/**
 * Supports and junglers should swap the starting Stealth Ward for Oracle Lens,
 * and ADCs for Farsight Alteration, mid-game; many players forget. Top and mid
 * keep the ward, so they are never told. Either swap counts as done. The swap
 * time comes from the timeline; the final items catch a swap it missed.
 */
function checkTrinket(
  me: MatchParticipant,
  myParticipantId: number,
  timeline: MatchTimeline,
  role: string,
  minutes: number
): Insight[] {
  const neverKey = TRINKET_NEVER_KEY[role];
  if (neverKey === undefined) return [];
  // The swap is due at minute 15; an ADC also needs level 9 for Farsight, so
  // for them it is due at whichever comes later (level 9 time from the
  // per-minute frames; unknown → minute 15). Never reached 9 → nothing due.
  let dueMin = TRINKET_SWAP_MIN;
  if (role === "BOTTOM") {
    if (me.champLevel < FARSIGHT_MIN_LEVEL) return [];
    const lvl9 = timeline.frames.find(
      (f) => (f.participantFrames?.[myParticipantId]?.level ?? 0) >= FARSIGHT_MIN_LEVEL
    );
    if (lvl9) dueMin = Math.max(dueMin, lvl9.timestamp / 1000 / 60);
  }
  if (minutes < dueMin) return [];

  let swapMin: number | null = null;
  for (const frame of timeline.frames) {
    for (const ev of frame.events) {
      if (ev.type !== "ITEM_PURCHASED") continue;
      const e = ev as Extract<typeof ev, { type: "ITEM_PURCHASED" }>;
      if (e.participantId !== myParticipantId) continue;
      if (e.itemId !== ORACLE_LENS && e.itemId !== FARSIGHT_ALTERATION) continue;
      const t = e.timestamp / 1000 / 60;
      if (swapMin === null || t < swapMin) swapMin = t;
    }
  }
  const swapped =
    swapMin !== null || me.items.includes(ORACLE_LENS) || me.items.includes(FARSIGHT_ALTERATION);
  const action = i18n.t("coach.trinket.action");

  if (!swapped) {
    return [
      {
        category: "vision",
        severity: "warn",
        title: i18n.t("coach.trinket.neverTitle"),
        detail: i18n.t(neverKey, { min: Math.round(minutes) }),
        action,
      },
    ];
  }
  if (swapMin !== null && swapMin > dueMin + TRINKET_GRACE_MIN) {
    return [
      {
        category: "vision",
        severity: "info",
        title: i18n.t("coach.trinket.lateTitle"),
        detail: i18n.t("coach.trinket.lateDetail", { at: Math.floor(swapMin) }),
        action,
      },
    ];
  }
  return [];
}

function checkDeaths(
  me: MatchParticipant,
  myParticipantId: number,
  timeline: MatchTimeline,
  minutes: number,
  role: string,
  allyIds: Set<number>
): Insight[] {
  let earlyDeaths = 0;
  let soloDeaths = 0;
  let teamFightDeaths = 0;
  const kills = timeline.frames.flatMap((f) =>
    f.events.filter((ev) => ev.type === "CHAMPION_KILL")
  ) as Extract<MatchTimeline["frames"][number]["events"][number], { type: "CHAMPION_KILL" }>[];
  for (const e of kills) {
    if (e.victimId !== myParticipantId) continue;
    const t = e.timestamp / 1000 / 60;
    if (t < 8) earlyDeaths++;
    const assists = (e.assistingParticipantIds ?? []).length;
    if (assists === 0) soloDeaths++;
    // Two or more teammates down within 15 s: a team fight, the group's call.
    const alliesDown = kills.filter(
      (k) =>
        k.victimId !== myParticipantId &&
        allyIds.has(k.victimId) &&
        Math.abs(k.timestamp - e.timestamp) <= TEAM_FIGHT_WINDOW_MS
    ).length;
    if (alliesDown >= 2) teamFightDeaths++;
  }

  const out: Insight[] = [];
  if (earlyDeaths >= 3) {
    out.push({
      category: "deaths",
      severity: "bad",
      title: T("earlyDeathsBadTitle", { n: earlyDeaths }),
      detail: T("earlyDeathsBadDetail"),
      action: T(role === "JUNGLE" ? "earlyDeathsBadActionJungle" : "earlyDeathsBadActionLane"),
    });
  } else if (earlyDeaths >= 2) {
    out.push({
      category: "deaths",
      severity: "warn",
      title: T("earlyDeathsWarnTitle", { n: earlyDeaths }),
      detail: T(role === "JUNGLE" ? "earlyDeathsWarnJungle" : "earlyDeathsWarnLane"),
    });
  }

  if (me.deaths >= 8 && minutes < 30) {
    out.push({
      category: "deaths",
      severity: "bad",
      title: T("manyDeathsTitle"),
      detail:
        teamFightDeaths > 0
          ? T("manyDeathsDetailTf", { n: me.deaths, min: minutes.toFixed(0), count: teamFightDeaths })
          : T("manyDeathsDetail", { n: me.deaths, min: minutes.toFixed(0) }),
      action: T("manyDeathsAction"),
    });
  }

  if (soloDeaths >= 3) {
    out.push({
      category: "deaths",
      severity: "warn",
      title: T("soloDeathsTitle", { n: soloDeaths }),
      detail: T("soloDeathsDetail"),
      action: T("soloDeathsAction"),
    });
  }

  return out;
}

const TEAM_FIGHT_WINDOW_MS = 15_000;
/** Gold gap at minute 14 that counts as a won / lost lane. */
const LANE_GOLD_EDGE = 500;
/** A lane this far behind at 14, and at least this much worse than mine,
 * is where the game was lost. */
const WHERE_LOST_GOLD = 1000;

const laneName = (lane: string) => i18n.t(`coach.lanes.${lane}`);
const fmtGold = (g: number) => Math.abs(Math.round(g)).toLocaleString(i18n.language?.startsWith("en") ? "en-US" : "es-ES");

/** My lane at minute 14 against whoever really laned against me (lane
 * swaps included), and how much of their lead came from killing others. */
function checkLaneMatchup(
  me: MatchParticipant,
  role: string,
  pairs: LanePair[],
  timeline: MatchTimeline,
  name: (id: number) => string
): Insight[] {
  const mine = pairs.find((p) => p.ally === me);
  if (!mine || mine.lane === "JUNGLE") return [];
  const champ = name(mine.enemy.championId);
  const out: Insight[] = [];
  const assigned = ROLE_LANE[role];
  if (assigned && assigned !== mine.lane) {
    out.push({
      category: "macro",
      severity: "info",
      title: T("laneSwapTitle", { lane: laneName(mine.lane) }),
      detail: T("laneSwapDetail", { lane: laneName(mine.lane), role: roleLabel(role), champ }),
    });
  }
  if (role === "UTILITY") return out;
  const gold = fmtGold(mine.gold);
  if (mine.gold >= LANE_GOLD_EDGE) {
    out.push({ category: "combat", severity: "good", title: T("laneWonTitle"), detail: T("laneWonDetail", { gold, champ }) });
  } else if (mine.gold > -LANE_GOLD_EDGE) {
    out.push({ category: "combat", severity: "info", title: T("laneEvenTitle"), detail: T("laneEvenDetail", { gold, champ }) });
  } else {
    const { onOthers } = earlyKillsBy(timeline, mine.enemy.participantId, me.participantId);
    const fed = onOthers > 0 ? ` ${T("laneLostFed", { champ, count: onOthers })}` : "";
    out.push({
      category: "combat",
      severity: "warn",
      title: T("laneLostTitle"),
      detail: T("laneLostDetail", { gold, champ }) + fed,
      action: T("laneLostAction"),
    });
  }
  return out;
}

/** After a loss: the matchup that fell furthest behind at minute 14, when it
 * is not mine and clearly worse than mine. Numbers only, no blame. */
function checkWhereLost(me: MatchParticipant, pairs: LanePair[], name: (id: number) => string): Insight[] {
  if (me.win || pairs.length === 0) return [];
  const mine = pairs.find((p) => p.ally === me);
  const worst = [...pairs].sort((a, b) => a.gold - b.gold)[0];
  if (worst.ally === me || worst.gold > -WHERE_LOST_GOLD) return [];
  if (mine && mine.gold - worst.gold < WHERE_LOST_GOLD) return [];
  const e = worst.enemy;
  return [
    {
      category: "macro",
      severity: "info",
      title: T("whereLostTitle", { lane: laneName(worst.lane) }),
      detail: T("whereLostDetail", {
        ally: name(worst.ally.championId),
        enemy: name(e.championId),
        gold: fmtGold(worst.gold),
        kda: `${e.kills}/${e.deaths}/${e.assists}`,
      }),
    },
  ];
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
        title: T("kpLowTitle"),
        detail: T("kpLowDetail", { pct: (kp * 100).toFixed(0) }),
        action: T("kpLowAction"),
      },
    ];
  }
  if (kp >= 0.7) {
    return [
      {
        category: "macro",
        severity: "good",
        title: T("kpHighTitle"),
        detail: T("kpHighDetail", { pct: (kp * 100).toFixed(0) }),
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
        title: T("dmgLowTitle"),
        detail: T("dmgLowDetail", {
          pct: (share * 100).toFixed(0),
          role: roleLabel(role),
          target: (target * 100).toFixed(0),
        }),
        action: T("dmgLowAction"),
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
      title: T("dragonsLostTitle"),
      detail: T("dragonsLostDetail", { n: lostDragons }),
      action: T("dragonsLostAction"),
    });
  }
  if (lostBarons >= 1 && me.position !== "JUNGLE") {
    out.push({
      category: "objectives",
      severity: "info",
      title: T("baronLostTitle"),
      detail: T("baronLostDetail"),
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
        title: T("adcGoldTitle"),
        detail: T("adcGoldDetail", { pct: (goldShare * 100).toFixed(0) }),
        action: T("adcGoldAction"),
      },
    ];
  }
  if ((me.position === "MIDDLE" || me.position === "TOP") && gpm < 320) {
    return [
      {
        category: "macro",
        severity: "warn",
        title: T("gpmTitle"),
        detail: T("gpmDetail", { gpm: gpm.toFixed(0), role: roleLabel(me.position) }),
        action: T("gpmAction"),
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
        title: T("dpgTitle"),
        detail: T("dpgDetail", { dpg: dpg.toFixed(2), target: target.toFixed(1) }),
        action: T("dpgAction"),
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
        title: T("fbLostTitle"),
        detail: T("fbLostDetail", { min: (firstKill.ts / 1000 / 60).toFixed(1) }),
        action: T("fbLostAction"),
      },
    ];
  }
  if (firstKill.killerId === myParticipantId) {
    return [
      {
        category: "macro",
        severity: "good",
        title: T("fbTitle"),
        detail: T("fbDetail"),
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
        title: T("snowballTitle"),
        detail: T("snowballDetail", { kda: `${me.kills}/${me.deaths}/${me.assists}` }),
      },
    ];
  }
  if (earlyAggressive && !me.win) {
    return [
      {
        category: "macro",
        severity: "warn",
        title: T("leadLostTitle"),
        detail: T("leadLostDetail", { kda: `${me.kills}/${me.deaths}/${me.assists}` }),
        action: T("leadLostAction"),
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
        title: T("cs14Title", { cs: cs14 }),
        detail: T("cs14Detail", { role: roleLabel(role), target }),
        action: T("cs14Action"),
      },
    ];
  }
  return [];
}

/** Two or more items giving that resist = the player already built for it. */
const RESIST_BUILT_ITEMS = 2;

function checkBuildVsEnemy(
  enemy: MatchParticipant[],
  me: MatchParticipant,
  itemTags: (itemId: number) => string[]
): Insight[] {
  if (enemy.length === 0) return [];
  const builtResist = (tag: string) =>
    me.items.filter((id) => id > 0 && itemTags(id).includes(tag)).length >= RESIST_BUILT_ITEMS;
  // Aggregate the enemy team's actual damage profile (magic vs physical). A
  // decisive skew means the concrete takeaway is to prioritise the matching
  // resist next game — real, actionable build advice instead of the old no-op.
  let magic = 0;
  let physical = 0;
  for (const e of enemy) {
    magic += e.magicDamageDealtToChampions;
    physical += e.physicalDamageDealtToChampions;
  }
  const total = magic + physical;
  if (total === 0) return [];
  const magicShare = magic / total;
  // Only fire on a decisive skew — a balanced team gives no clear priority.
  if (magicShare >= 0.65) {
    if (builtResist("SpellBlock")) return [];
    return [
      {
        category: "build",
        severity: "info",
        title: T("magicTitle"),
        detail: T("magicDetail", { pct: (magicShare * 100).toFixed(0) }),
        action: T("magicAction"),
      },
    ];
  }
  if (magicShare <= 0.35) {
    if (builtResist("Armor")) return [];
    return [
      {
        category: "build",
        severity: "info",
        title: T("physTitle"),
        detail: T("physDetail", { pct: ((1 - magicShare) * 100).toFixed(0) }),
        action: T("physAction"),
      },
    ];
  }
  return [];
}
