// Extracts professional-level metrics from a match + timeline.
// These metrics feed the AI coach for accurate, specific advice.

import type { MatchFull, MatchTimeline } from "../services/riotApi";

export interface ProMatchAnalytics {
  // Lane phase metrics
  cs10: number;
  cs14: number;
  goldAt10: number;
  goldAt15: number;
  xpAt10: number;
  level10: number;
  level14: number;

  // Death analysis
  deathsBy10: number;
  deathsAt5: number;
  soloDeaths: number;
  deathsInLane: number;
  deathLocations: string[]; // descriptive: "river bot", "tribush", etc.

  // Snowball / lead conversion
  goldLeadAt15: number; // vs lane opponent
  csLeadAt14: number;
  killsBy10: number;

  // Objectives
  drakesByMyTeam: number;
  drakesByEnemy: number;
  baronsByMyTeam: number;
  baronsByEnemy: number;
  firstDragonTime: number | null;
  firstHeraldTime: number | null;
  firstBaronTime: number | null;
  firstTowerByMyTeam: boolean;

  // Vision
  visionScorePerMin: number;
  controlWardsBought: number;
  wardsKilled: number;
  pinksByMin10: number;

  // Combat
  damagePerGold: number;
  damagePerDeath: number;
  killParticipation: number;
  damageShare: number;
  damageTakenShare: number;

  // Items / build
  firstItemTime: number | null;
  itemsPurchasedCount: number;
  hadStopwatch: boolean;
  hadQss: boolean;

  // Gameplay flow
  longestDeathStreak: number;
  longestKillStreak: number;
  recallsBeforeDeath: number;

  // Champion identification
  myChampionId: number;
  myChampionName: string;
  laneOpponentChampionId: number | null;
  laneOpponentChampionName: string | null;
  position: string;
  win: boolean;
  durationMin: number;
  queueId: number;
  myTeamId: number;

  // Comp
  enemyTeamComposition: { championId: number; championName: string; position: string }[];
  myTeamComposition: { championId: number; championName: string; position: string }[];
}

const STOPWATCH_IDS = new Set([2419, 2420, 3157, 3193]);
const QSS_IDS = new Set([3140, 6035]);

export function buildProAnalytics(
  match: MatchFull,
  timeline: MatchTimeline,
  myPuuid: string,
  championNamesById: Map<number, string>
): ProMatchAnalytics | null {
  const me = match.participants.find((p) => p.puuid === myPuuid);
  if (!me) return null;

  const myPid = me.participantId;
  const enemy = match.participants.find(
    (p) => p.teamId !== me.teamId && p.position === me.position
  );
  const enemyPid = enemy?.participantId ?? null;

  const minutes = match.durationSec / 60;

  // Frame snapshots
  const frame5 = findFrameAt(timeline, 5);
  const frame10 = findFrameAt(timeline, 10);
  const frame14 = findFrameAt(timeline, 14);
  const frame15 = findFrameAt(timeline, 15);

  void frame5;
  const me10 = frame10?.participantFrames[String(myPid)];
  const me14 = frame14?.participantFrames[String(myPid)];
  const me15 = frame15?.participantFrames[String(myPid)];

  const enemy14 = enemyPid && frame14?.participantFrames[String(enemyPid)];
  const enemy15 = enemyPid && frame15?.participantFrames[String(enemyPid)];

  const cs = (f: { minionsKilled: number; jungleMinionsKilled: number } | undefined) =>
    f ? f.minionsKilled + f.jungleMinionsKilled : 0;

  // Walk timeline events
  let deathsBy10 = 0;
  let deathsAt5 = 0;
  let soloDeaths = 0;
  let killsBy10 = 0;
  const deathLocations: string[] = [];
  const myTeamId = me.teamId;
  let drakesByMy = 0,
    drakesByEnemy = 0,
    baronsByMy = 0,
    baronsByEnemy = 0;
  let firstDragonTime: number | null = null;
  let firstHeraldTime: number | null = null;
  let firstBaronTime: number | null = null;
  let firstTowerByMyTeam = false;
  let towerSeen = false;
  let firstItemTime: number | null = null;
  let itemsPurchased = 0;
  let pinksByMin10 = 0;
  let longestDeathStreak = 0;
  let curDeathStreak = 0;
  let longestKillStreak = 0;
  let curKillStreak = 0;
  let lastEventBeforeDeath: "kill" | "death" | "recall" | null = null;
  let recallsBeforeDeath = 0;

  for (const f of timeline.frames) {
    for (const ev of f.events) {
      const t = ev.timestamp / 1000 / 60;
      switch (ev.type) {
        case "CHAMPION_KILL": {
          const e = ev as Extract<typeof ev, { type: "CHAMPION_KILL" }>;
          if (e.victimId === myPid) {
            if (t < 10) deathsBy10++;
            if (t < 5) deathsAt5++;
            const assists = (e.assistingParticipantIds ?? []).length;
            if (assists === 0) soloDeaths++;
            // Heuristic location label by position coords
            if (e.position) {
              deathLocations.push(coarseLocation(e.position));
            }
            curDeathStreak++;
            longestDeathStreak = Math.max(longestDeathStreak, curDeathStreak);
            curKillStreak = 0;
            // recallsBeforeDeath is computed elsewhere (timeline lacks explicit recall events).
            void lastEventBeforeDeath;
            lastEventBeforeDeath = "death";
          } else if (e.killerId === myPid) {
            if (t < 10) killsBy10++;
            curKillStreak++;
            longestKillStreak = Math.max(longestKillStreak, curKillStreak);
            curDeathStreak = 0;
            lastEventBeforeDeath = "kill";
          }
          break;
        }
        case "ELITE_MONSTER_KILL": {
          const e = ev as Extract<typeof ev, { type: "ELITE_MONSTER_KILL" }>;
          const killerTeam = e.killerId > 5 ? 200 : 100;
          const isMine = killerTeam === myTeamId;
          if (e.monsterType === "DRAGON") {
            if (firstDragonTime === null) firstDragonTime = ev.timestamp;
            if (isMine) drakesByMy++;
            else drakesByEnemy++;
          }
          if (e.monsterType === "BARON_NASHOR") {
            if (firstBaronTime === null) firstBaronTime = ev.timestamp;
            if (isMine) baronsByMy++;
            else baronsByEnemy++;
          }
          if (e.monsterType === "RIFTHERALD" && firstHeraldTime === null) {
            firstHeraldTime = ev.timestamp;
          }
          break;
        }
        case "BUILDING_KILL": {
          const e = ev as Extract<typeof ev, { type: "BUILDING_KILL" }>;
          if (e.buildingType === "TOWER_BUILDING" && !towerSeen) {
            towerSeen = true;
            firstTowerByMyTeam = (e.teamId === 200 ? 100 : 200) === myTeamId;
          }
          break;
        }
        case "ITEM_PURCHASED": {
          const e = ev as Extract<typeof ev, { type: "ITEM_PURCHASED" }>;
          if (e.participantId === myPid) {
            itemsPurchased++;
            if (firstItemTime === null && isFinishedItem(e.itemId)) {
              firstItemTime = ev.timestamp;
            }
            if (e.itemId === 2055 && t < 10) pinksByMin10++; // control ward
          }
          break;
        }
        // Recall is not a discrete event in match-v5; can infer from gold drop in store.
        // Skipped; "recallsBeforeDeath" stays at 0 for now.
      }
    }
  }

  const teamMembers = match.participants.filter((p) => p.teamId === me.teamId);
  const teamKills = teamMembers.reduce((a, p) => a + p.kills, 0);
  const teamDmg = teamMembers.reduce((a, p) => a + p.totalDamageDealtToChampions, 0);
  const teamDmgTaken = teamMembers.reduce((a, p) => a + p.totalDamageTaken, 0);

  const enemyTeam = match.participants.filter((p) => p.teamId !== me.teamId);
  const itemSet = new Set(me.items);

  return {
    cs10: cs(me10),
    cs14: cs(me14),
    goldAt10: me10?.totalGold ?? 0,
    goldAt15: me15?.totalGold ?? 0,
    xpAt10: me10?.xp ?? 0,
    level10: me10?.level ?? 0,
    level14: me14?.level ?? 0,

    deathsBy10,
    deathsAt5,
    soloDeaths,
    deathsInLane: deathLocations.filter((l) => l === me.position.toLowerCase() || l === "lane").length,
    deathLocations,

    goldLeadAt15: (me15?.totalGold ?? 0) - ((enemy15 ? enemy15.totalGold : 0) || 0),
    csLeadAt14: cs(me14) - cs(enemy14 || undefined),
    killsBy10,

    drakesByMyTeam: drakesByMy,
    drakesByEnemy: drakesByEnemy,
    baronsByMyTeam: baronsByMy,
    baronsByEnemy: baronsByEnemy,
    firstDragonTime,
    firstHeraldTime,
    firstBaronTime,
    firstTowerByMyTeam,

    visionScorePerMin: me.visionScore / Math.max(1, minutes),
    controlWardsBought: me.controlWardsBought,
    wardsKilled: me.wardsKilled,
    pinksByMin10,

    damagePerGold:
      me.goldEarned > 0 ? me.totalDamageDealtToChampions / me.goldEarned : 0,
    damagePerDeath:
      me.deaths > 0 ? me.totalDamageDealtToChampions / me.deaths : me.totalDamageDealtToChampions,
    killParticipation:
      teamKills > 0 ? (me.kills + me.assists) / teamKills : 0,
    damageShare:
      teamDmg > 0 ? me.totalDamageDealtToChampions / teamDmg : 0,
    damageTakenShare:
      teamDmgTaken > 0 ? me.totalDamageTaken / teamDmgTaken : 0,

    firstItemTime,
    itemsPurchasedCount: itemsPurchased,
    hadStopwatch: me.items.some((i) => STOPWATCH_IDS.has(i)),
    hadQss: me.items.some((i) => QSS_IDS.has(i)) || itemSet.has(3139),

    longestDeathStreak,
    longestKillStreak,
    recallsBeforeDeath,

    myChampionId: me.championId,
    myChampionName: championNamesById.get(me.championId) ?? `#${me.championId}`,
    laneOpponentChampionId: enemy?.championId ?? null,
    laneOpponentChampionName: enemy
      ? championNamesById.get(enemy.championId) ?? `#${enemy.championId}`
      : null,
    position: me.position,
    win: me.win,
    durationMin: minutes,
    queueId: match.queueId,
    myTeamId: me.teamId,

    enemyTeamComposition: enemyTeam.map((p) => ({
      championId: p.championId,
      championName: championNamesById.get(p.championId) ?? `#${p.championId}`,
      position: p.position,
    })),
    myTeamComposition: teamMembers.map((p) => ({
      championId: p.championId,
      championName: championNamesById.get(p.championId) ?? `#${p.championId}`,
      position: p.position,
    })),
  };
}

function findFrameAt(t: MatchTimeline, minutes: number) {
  const target = minutes * 60 * 1000;
  return t.frames.find((f) => f.timestamp >= target) ?? null;
}

function coarseLocation(pos: { x: number; y: number }): string {
  // Summoner's Rift is ~14820 x 14881
  const { x, y } = pos;
  const isTopHalf = y > 7400;
  const isLeftHalf = x < 7400;
  const isMidline = Math.abs(x - y) < 2500 && x > 3000 && x < 12000;
  if (isMidline) return "mid";
  if (isTopHalf && isLeftHalf) return "top";
  if (!isTopHalf && !isLeftHalf) return "bot";
  if (isTopHalf && !isLeftHalf) return "river top";
  if (!isTopHalf && isLeftHalf) return "river bot";
  return "jungle";
}

function isFinishedItem(itemId: number): boolean {
  // Simple heuristic: finished items have IDs >= 3000 mostly. Skip basic items.
  return itemId >= 3000 && itemId !== 2055 && itemId !== 2003 && itemId !== 2031;
}
