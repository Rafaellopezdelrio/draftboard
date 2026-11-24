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
// to the user's current rank. Jungle measured 24/11 on other junglers: Gold
// median 6.4 CS/min, Master+ 7.3 (the old 4.8 / 5.9 praised 90% of them).
// Top, mid and ADC are the same medians Trends uses (rankBenchmarks, measured
// 24/11); the old Gold top 6.3 sat under the 7.1 median, so "Good farm"
// praised 67% of Gold tops. Silver and Iron-Bronze keep their old ratio to
// Gold, Diamond in between.
type EloBucket = "iron-bronze" | "silver" | "gold-platinum" | "diamond" | "master+";
const CS_PER_MIN_BY_ELO: Record<EloBucket, Record<string, number>> = {
  "iron-bronze": { TOP: 5.1, JUNGLE: 4.5, MIDDLE: 4.7, BOTTOM: 5.8, UTILITY: 1.0 },
  silver:        { TOP: 6.2, JUNGLE: 5.5, MIDDLE: 5.6, BOTTOM: 6.9, UTILITY: 1.2 },
  "gold-platinum":{ TOP: 7.1, JUNGLE: 6.3, MIDDLE: 6.4, BOTTOM: 7.7, UTILITY: 1.4 },
  diamond:       { TOP: 7.3, JUNGLE: 6.8, MIDDLE: 7.0, BOTTOM: 8.0, UTILITY: 1.5 },
  "master+":     { TOP: 7.4, JUNGLE: 7.3, MIDDLE: 7.6, BOTTOM: 8.2, UTILITY: 1.6 },
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

// Measured 24/11 (Gold and Master+ games): supports average 2.5-2.7 a minute,
// so 1.6 never flagged one; mids sit near tops and ADCs (0.6-0.7), so 0.8
// flagged twice as many. "Very low" (< 60%) now hits 7-19% of each position.
const VISION_SCORE_PER_MIN_TARGET: Record<string, number> = {
  TOP: 0.7,
  JUNGLE: 0.9,
  MIDDLE: 0.7,
  BOTTOM: 0.7,
  UTILITY: 2.5,
};

/** Shorter games are too short to expect a control ward from a laner. */
const CONTROL_WARD_MIN_GAME = 20;

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
  out.push(...checkOutnumberedFights(myParticipantId, timeline, new Set(team.map((p) => p.participantId))));
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
  // Measured on 40 Master+ EUW games (24/11): top, mid and ADC place 0 control
  // wards in half their games and the jungler 0-1, so "one every 8 min" fired
  // on 74-93% of them. Support keeps that bar; the jungler is warned only for
  // none at all, and a laner just gets a note.
  const fewPinks =
    role === "UTILITY"
      ? me.controlWardsBought < Math.floor(minutes / 8)
      : me.controlWardsBought === 0 && minutes >= CONTROL_WARD_MIN_GAME;
  if (fewPinks) {
    return [
      {
        category: "vision",
        severity: role === "UTILITY" || role === "JUNGLE" ? "warn" : "info",
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
/** The live coach reminds a jungler from this minute: most junglers are on
 * their first or second trip to base by then. Shared with liveCoachEngine. */
export const JUNGLE_TRINKET_LIVE_MIN = 8;
/** Farsight Alteration (the ADC swap) can only be bought from level 9. */
export const FARSIGHT_MIN_LEVEL = 9;
/** World Atlas (3865) turns into Runic Compass, which already places wards;
 * from then on a support should swap to Oracle Lens. Later stages included. */
export const WORLD_ATLAS = 3865;
export const WARDING_SUPPORT_ITEMS = [3866, 3867, 3869, 3870, 3871, 3876, 3877];
/** Trips to base (after the start) a jungler gets to swap: Rafael, 24/11. */
const JUNGLE_SWAP_TRIPS = 2;
/** Purchases closer than this belong to the same trip to base. */
const SHOP_TRIP_GAP_MS = 60_000;
/** The starting purchases happen before this. */
const START_SHOP_MS = 90_000;
const TRINKET_NEVER_KEY: Record<string, string> = {
  UTILITY: "coach.trinket.neverSupport",
  JUNGLE: "coach.trinket.neverJungle",
  BOTTOM: "coach.trinket.neverAdc",
};

/** Fiddlesticks' passive replaces the trinket with his Scarecrow Effigy, which
 * cannot be swapped; Data Dragon lists no other champion-locked trinket. */
const SCARECROW_EFFIGY = 3330;
const FIDDLESTICKS_ID = 9;
function hasLockedTrinket(me: MatchParticipant): boolean {
  return me.championId === FIDDLESTICKS_ID || me.items.includes(SCARECROW_EFFIGY);
}

/** My trips to base after the start, from my purchases: buys less than a
 * minute apart are one trip. */
function shopTrips(timeline: MatchTimeline, myParticipantId: number): Array<{ start: number; end: number }> {
  const times: number[] = [];
  for (const frame of timeline.frames)
    for (const ev of frame.events)
      if (ev.type === "ITEM_PURCHASED" && ev.participantId === myParticipantId && ev.timestamp >= START_SHOP_MS)
        times.push(ev.timestamp);
  times.sort((x, y) => x - y);
  const trips: Array<{ start: number; end: number }> = [];
  for (const t of times) {
    const last = trips[trips.length - 1];
    if (last && t - last.end < SHOP_TRIP_GAP_MS) last.end = t;
    else trips.push({ start: t, end: t });
  }
  return trips;
}

/** When the swap becomes due (ms), or null if it never did: a support once
 * World Atlas turns into a warding item, an ADC at level 9 (Farsight is not
 * sold before), a jungler from the start. */
function trinketDueMs(role: string, me: MatchParticipant, myParticipantId: number, timeline: MatchTimeline): number | null {
  if (role === "JUNGLE") return 0;
  if (role === "UTILITY") {
    for (const frame of timeline.frames)
      for (const ev of frame.events)
        if (ev.type === "ITEM_DESTROYED" && ev.participantId === myParticipantId && ev.itemId === WORLD_ATLAS)
          return ev.timestamp as number;
    return null;
  }
  if (me.champLevel < FARSIGHT_MIN_LEVEL) return null;
  const lvl9 = timeline.frames.find(
    (f) => (f.participantFrames?.[myParticipantId]?.level ?? 0) >= FARSIGHT_MIN_LEVEL
  );
  return lvl9 ? lvl9.timestamp : null;
}

/**
 * Supports and junglers should swap the starting Stealth Ward for Oracle Lens,
 * and ADCs for Farsight Alteration; many players forget. When (Rafael, 24/11):
 * a support on the first trip to base after the support item places wards, a
 * jungler by the second trip, an ADC on the first trip after level 9. Mid
 * depends on the game (softTrinketNote); top keeps the yellow one. Either
 * swap counts as done.
 */
function checkTrinket(
  me: MatchParticipant,
  myParticipantId: number,
  timeline: MatchTimeline,
  role: string,
  minutes: number
): Insight[] {
  if (hasLockedTrinket(me)) return [];
  const neverKey = TRINKET_NEVER_KEY[role];
  if (neverKey === undefined) return softTrinketNote(me, myParticipantId, timeline, role, minutes);
  const dueMs = trinketDueMs(role, me, myParticipantId, timeline);
  if (dueMs === null) return [];
  const tripsAllowed = role === "JUNGLE" ? JUNGLE_SWAP_TRIPS : 1;
  // The last trip to base where the swap was still on time; none yet → not late.
  const deadline = shopTrips(timeline, myParticipantId).filter((t) => t.end >= dueMs)[tripsAllowed - 1];

  let swapMs: number | null = null;
  for (const frame of timeline.frames) {
    for (const ev of frame.events) {
      if (ev.type !== "ITEM_PURCHASED" || ev.participantId !== myParticipantId) continue;
      if (ev.itemId !== ORACLE_LENS && ev.itemId !== FARSIGHT_ALTERATION) continue;
      if (swapMs === null || ev.timestamp < swapMs) swapMs = ev.timestamp;
    }
  }
  const swapped =
    swapMs !== null || me.items.includes(ORACLE_LENS) || me.items.includes(FARSIGHT_ALTERATION);
  if (!deadline) return [];
  const action = i18n.t("coach.trinket.action");
  const toMin = (ms: number) => Math.floor(ms / 60_000);

  if (!swapped) {
    return [
      {
        category: "vision",
        severity: "warn",
        title: i18n.t("coach.trinket.neverTitle"),
        detail: i18n.t(neverKey, { min: Math.round(minutes), due: toMin(dueMs) }),
        action,
      },
    ];
  }
  if (swapMs !== null && swapMs > deadline.end) {
    return [
      {
        category: "vision",
        severity: "info",
        title: i18n.t("coach.trinket.lateTitle"),
        detail: i18n.t("coach.trinket.lateDetail", { at: toMin(swapMs), could: toMin(deadline.start) }),
        action,
      },
    ];
  }
  return [];
}

/** Mid: the swap depends on the game (lane warding first, then the red lens
 * when grouping for objectives, or the blue one when split-pushing), so only
 * a gentle note after a long game still on the yellow trinket.
 * 25 min, measured 24/11: Master+ mids still on yellow are 45% of 20-25 min
 * games (laning just ended) but only 17-18% past 25. Top gets no note: Master+
 * tops keep the yellow one in 44-67% of games past 25 min (Rafael, 24/11). */
const SOFT_TRINKET_MIN = 25;
/** The yellow trinket (Stealth Ward). */
const STEALTH_WARD_TRINKET = 3340;
function softTrinketNote(
  me: MatchParticipant,
  myParticipantId: number,
  timeline: MatchTimeline,
  role: string,
  minutes: number
): Insight[] {
  if (role !== "MIDDLE" || minutes < SOFT_TRINKET_MIN) return [];
  if (!me.items.includes(STEALTH_WARD_TRINKET)) return [];
  const swapped =
    me.items.includes(ORACLE_LENS) ||
    me.items.includes(FARSIGHT_ALTERATION) ||
    timeline.frames.some((f) =>
      f.events.some((ev) => {
        if (ev.type !== "ITEM_PURCHASED") return false;
        const e = ev as Extract<typeof ev, { type: "ITEM_PURCHASED" }>;
        return e.participantId === myParticipantId && (e.itemId === ORACLE_LENS || e.itemId === FARSIGHT_ALTERATION);
      })
    );
  if (swapped) return [];
  return [
    {
      category: "vision",
      severity: "info",
      title: i18n.t("coach.trinket.softTitle"),
      detail: i18n.t("coach.trinket.softDetail", { role: roleLabel(role), min: Math.round(minutes) }),
    },
  ];
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
  } else if (earlyDeaths >= 2 && role !== "BOTTOM") {
    // Not for the ADC: bot lane trades 2v2 kills both ways. Measured 24/11,
    // ADCs with 2 deaths before 8 min won 54-59% (3+ won 22-25%).
    out.push({
      category: "deaths",
      severity: "warn",
      title: T("earlyDeathsWarnTitle", { n: earlyDeaths }),
      detail: T(role === "JUNGLE" ? "earlyDeathsWarnJungle" : "earlyDeathsWarnLane"),
    });
  }

  // 8+ deaths and at least one every 3 min. Was "8+ in under 30 min", which
  // never fired in half of Gold games (30+ min). Measured 24/11: fires on
  // 6-13% of Gold players, 8-21% of Master+, who win 0-33% of those games.
  if (me.deaths >= Math.max(MANY_DEATHS_MIN, minutes / 3)) {
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

  // Top and mid lanes are 1v1, so dying alone is part of the matchup: with 3
  // solo deaths they won 52% (measured 24/11), with 4+ only 33%.
  if (soloDeaths >= (role === "TOP" || role === "MIDDLE" ? 4 : 3)) {
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
const MANY_DEATHS_MIN = 8;
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

/** Enemies minus teammates in a fight for it to count as taken outnumbered. */
const OUTNUMBERED_BY = 2;

/** Deaths in fights my side took with fewer players: not every call has to
 * be followed — when the numbers are against you, rotate instead. Who was
 * in a fight = everyone who killed, assisted or died within 15 s of my death. */
function checkOutnumberedFights(myParticipantId: number, timeline: MatchTimeline, allyIds: Set<number>): Insight[] {
  const kills = timeline.frames.flatMap((f) =>
    f.events.filter((ev) => ev.type === "CHAMPION_KILL")
  ) as Extract<MatchTimeline["frames"][number]["events"][number], { type: "CHAMPION_KILL" }>[];
  const fights: Array<{ min: number; us: number; them: number }> = [];
  for (const death of kills) {
    if (death.victimId !== myParticipantId) continue;
    const near = kills.filter((k) => Math.abs(k.timestamp - death.timestamp) <= TEAM_FIGHT_WINDOW_MS);
    const us = new Set<number>();
    const them = new Set<number>();
    for (const k of near) {
      for (const id of [k.killerId, k.victimId, ...(k.assistingParticipantIds ?? [])]) {
        if (id <= 0) continue; // tower / minion kill
        (allyIds.has(id) ? us : them).add(id);
      }
    }
    // A pick-off (one or two enemies on me alone) is "solo deaths", not this.
    if (us.size >= 2 && them.size - us.size >= OUTNUMBERED_BY) {
      fights.push({ min: death.timestamp / 60_000, us: us.size, them: them.size });
    }
  }
  if (fights.length === 0) return [];
  const worst = [...fights].sort((a, b) => b.them - b.us - (a.them - a.us))[0];
  return [
    {
      category: "macro",
      severity: "warn",
      title: T("outnumberedTitle", { count: fights.length }),
      detail: T("outnumberedDetail", { min: worst.min.toFixed(0), us: worst.us, them: worst.them }),
      action: T("outnumberedAction"),
    },
  ];
}

/** Below this share of the team's kills = "low participation". Top is alone
 * on its side of the map: on 40 Master+ games half the tops were under 33%
 * and a quarter under 21%, so one 40% bar flagged 61% of them. Each value
 * sits near the 20th percentile of those players. */
const KP_LOW: Record<string, number> = { TOP: 0.2, JUNGLE: 0.4, MIDDLE: 0.33, BOTTOM: 0.33, UTILITY: 0.4 };
/** Low participation only says "you lost" for top, ADC and support (they won
 * 23-38% of those games); junglers and mids under the bar won 50-55% in
 * both Gold and Master+ games (measured 24/11), so for them it is a note. */
const KP_LOW_NOTE_ONLY = new Set(["JUNGLE", "MIDDLE"]);

function checkKillParticipation(me: MatchParticipant, team: MatchParticipant[]): Insight[] {
  const teamKills = team.reduce((a, p) => a + p.kills, 0);
  if (teamKills === 0) return [];
  const kp = (me.kills + me.assists) / teamKills;
  if (kp < (KP_LOW[me.position] ?? 0.4)) {
    return [
      {
        category: "macro",
        severity: KP_LOW_NOTE_ONLY.has(me.position) ? "info" : "warn",
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
