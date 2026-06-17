// Live in-game coaching. Reads the Live Client snapshot each poll and emits
// prioritized, time-aware coaching prompts — the "Phase 2" the LiveGamePanel
// header always promised ("vas 20cs por debajo", objective prep, death
// discipline). Distinct from inGameAdapter (which only reacts to enemy ITEMS):
// this reasons about laning state, tempo, and macro.
//
// 100% derived from Riot's official Live Client Data API — no memory reads,
// no OCR, nothing against Riot's third-party policy.

import type { LiveGamePlayer } from "../services/liveClient";
import type { PowerSpikeProfile } from "../data/powerSpikes";
import { i18n } from "../i18n";

export type LiveCoachSeverity = "critical" | "warn" | "good" | "info";

export interface LiveCoachInsight {
  /** Stable key so the UI can keep React keys steady across polls. */
  key: string;
  severity: LiveCoachSeverity;
  /** i18n key (liveCoach.*) resolved by the panel/overlay via t(); the spoken
   *  version uses the i18n.t singleton. */
  textKey: string;
  params?: Record<string, string | number>;
}

export interface LiveCoachArgs {
  /** The local player's record from allPlayers (scores, level, position). */
  me: LiveGamePlayer | null;
  /** Enemy laner sharing my position, if resolvable (null in ARAM / unknown). */
  laneOpponent: LiveGamePlayer | null;
  /** Seconds since GameStart. */
  gameTime: number;
  /** Next dragon / baron spawn in game-seconds (from LiveGamePanel timers). */
  nextDragonAt: number | null;
  nextBaronAt: number | null;
  /** activePlayer.currentGold — unspent gold on hand. */
  currentGold: number;
  /** My team side. Required for soul/baron-control coaching; omit for the
   *  basic laning insights. */
  myTeam?: "ORDER" | "CHAOS" | null;
  /** Dragons per team (from attributeObjectives) for soul-point awareness. */
  dragonsByTeam?: { ORDER: number; CHAOS: number } | null;
  /** Most recent Baron taker + time, for the buff-active window. */
  lastBaronTeam?: "ORDER" | "CHAOS" | null;
  lastBaronAt?: number | null;
  /** Current HP fraction (0-1) from activePlayer.championStats, for a retreat
   *  nudge. Omit when unavailable. */
  myHpPct?: number | null;
  /** Champion power-spike profile (from powerSpikes data) for spike timing. */
  spikeProfile?: PowerSpikeProfile | null;
}

/** Champion strength (0-10) at the current game window, keyed off level. */
function spikeRatingAt(p: PowerSpikeProfile, level: number): number {
  if (level <= 3) return p.level1to3;
  if (level <= 6) return p.level4to6;
  if (level <= 10) return p.firstItem;
  if (level <= 13) return p.twoItems;
  return p.fullBuild;
}

const LANES = new Set(["TOP", "MIDDLE", "BOTTOM"]);
const MIN_GAME_TIME = 90; // <1:30 there's nothing to coach yet
const EXPECTED_CSPM = 6.5; // a clean solo-lane pace; below 70% of it = a leak
const CS_BEHIND = 20; // CS deficit vs your laner that warrants "play safe"
const CS_AHEAD = 25; // CS lead worth converting to map pressure
const DRAGON_PREP_WINDOW = 45; // seconds before spawn to start prepping
const BARON_PREP_WINDOW = 60;
const RECALL_GOLD = 2000;
const SOUL_POINT = 3; // a team on 3 dragons takes Soul on its next dragon
const BARON_BUFF_SEC = 180; // Baron buff lasts ~3min
const LOW_HP_PCT = 0.2; // retreat nudge below 20% HP

const RANK: Record<LiveCoachSeverity, number> = {
  critical: 0,
  warn: 1,
  good: 2,
  info: 3,
};

/** Compute coaching insights for the current snapshot. Pure + side-effect free
 *  so it's trivially testable and safe to call every poll. Returns at most 3,
 *  highest severity first, so the overlay stays readable. */
export function coachLiveGame(args: LiveCoachArgs): LiveCoachInsight[] {
  const {
    me,
    laneOpponent,
    gameTime,
    nextDragonAt,
    nextBaronAt,
    currentGold,
    myTeam,
    dragonsByTeam,
    lastBaronTeam,
    lastBaronAt,
    myHpPct,
    spikeProfile,
  } = args;
  if (!me || gameTime < MIN_GAME_TIME) return [];

  const out: LiveCoachInsight[] = [];
  const minutes = gameTime / 60;
  const isLaner = LANES.has(me.position);
  const k = me.scores.kills;
  const d = me.scores.deaths;
  const a = me.scores.assists;

  // --- Death discipline -------------------------------------------------
  if (d >= 7) {
    out.push({
      key: "deaths-critical",
      severity: "critical",
      textKey: "liveCoach.deathsCritical",
      params: { k, d, a },
    });
  } else if (d >= 4 && d > k + a) {
    out.push({
      key: "deaths-warn",
      severity: "warn",
      textKey: "liveCoach.deathsWarn",
      params: { k, d, a },
    });
  }

  // --- Survival: retreat nudge on critically low HP --------------------
  if (typeof myHpPct === "number" && !me.isDead && myHpPct <= LOW_HP_PCT) {
    out.push({
      key: "low-hp",
      severity: "warn",
      textKey: "liveCoach.lowHp",
      params: { hp: Math.round(myHpPct * 100) },
    });
  }

  // --- Laning: relative to your direct opponent when we can resolve them,
  //     otherwise an absolute CS-pace check. -----------------------------
  if (isLaner) {
    if (laneOpponent && LANES.has(laneOpponent.position)) {
      const diff = me.scores.creepScore - laneOpponent.scores.creepScore;
      if (diff <= -CS_BEHIND) {
        out.push({
          key: "lane-behind",
          severity: "warn",
          textKey: "liveCoach.laneBehind",
          params: { diff, champ: laneOpponent.championName },
        });
      } else if (diff >= CS_AHEAD) {
        out.push({
          key: "lane-ahead",
          severity: "good",
          textKey: "liveCoach.laneAhead",
          params: { diff, champ: laneOpponent.championName },
        });
      }
      if (me.level <= laneOpponent.level - 2) {
        out.push({
          key: "lvl-behind",
          severity: "warn",
          textKey: "liveCoach.lvlBehind",
          params: { levels: laneOpponent.level - me.level, champ: laneOpponent.championName },
        });
      }
    } else if (minutes >= 5) {
      const expected = Math.round(minutes * EXPECTED_CSPM);
      if (me.scores.creepScore < expected * 0.7) {
        out.push({
          key: "cs-pace",
          severity: "warn",
          textKey: "liveCoach.csPace",
          params: { cs: me.scores.creepScore, min: Math.floor(minutes), expected },
        });
      }
    }
  }

  // --- Objective prep ---------------------------------------------------
  if (nextBaronAt !== null) {
    const eta = Math.round(nextBaronAt - gameTime);
    if (eta >= 0 && eta <= BARON_PREP_WINDOW) {
      out.push({
        key: "obj-baron",
        severity: "warn",
        textKey: "liveCoach.objBaron",
        params: { eta },
      });
    }
  }
  if (nextDragonAt !== null) {
    const eta = Math.round(nextDragonAt - gameTime);
    if (eta >= 0 && eta <= DRAGON_PREP_WINDOW) {
      out.push({
        key: "obj-dragon",
        severity: "warn",
        textKey: "liveCoach.objDragon",
        params: { eta },
      });
    }
  }

  // --- Objective control: dragon soul + active Baron buff ---------------
  const other =
    myTeam === "ORDER" ? "CHAOS" : myTeam === "CHAOS" ? "ORDER" : null;
  if (myTeam && other && dragonsByTeam) {
    const mine = dragonsByTeam[myTeam];
    const theirs = dragonsByTeam[other];
    if (theirs >= SOUL_POINT && theirs < 4) {
      out.push({
        key: "soul-deny",
        severity: "critical",
        textKey: "liveCoach.soulDeny",
      });
    } else if (mine >= SOUL_POINT && mine < 4) {
      out.push({
        key: "soul-take",
        severity: "good",
        textKey: "liveCoach.soulTake",
      });
    }
  }
  if (myTeam && other && lastBaronTeam && typeof lastBaronAt === "number") {
    const remaining = Math.round(BARON_BUFF_SEC - (gameTime - lastBaronAt));
    if (remaining > 0) {
      if (lastBaronTeam === other) {
        out.push({
          key: "baron-enemy",
          severity: "warn",
          textKey: "liveCoach.baronEnemy",
          params: { sec: remaining },
        });
      } else {
        out.push({
          key: "baron-mine",
          severity: "good",
          textKey: "liveCoach.baronMine",
          params: { sec: remaining },
        });
      }
    }
  }

  // --- Power-spike timing ----------------------------------------------
  if (spikeProfile) {
    const rating = spikeRatingAt(spikeProfile, me.level);
    if (rating >= 8) {
      out.push({
        key: "spike-strong",
        severity: "good",
        textKey: "liveCoach.spikeStrong",
        params: { rating },
      });
    } else if (rating <= 4) {
      out.push({
        key: "spike-weak",
        severity: "warn",
        textKey: "liveCoach.spikeWeak",
        params: { rating, summary: i18n.t(spikeProfile.summaryKey) },
      });
    }
  }

  // --- Reset value ------------------------------------------------------
  if (!me.isDead && currentGold >= RECALL_GOLD) {
    out.push({
      key: "recall",
      severity: "info",
      textKey: "liveCoach.recall",
      params: { gold: Math.round(currentGold) },
    });
  }

  out.sort((x, y) => RANK[x.severity] - RANK[y.severity]);
  return out.slice(0, 3);
}
