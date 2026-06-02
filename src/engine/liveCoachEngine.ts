// Live in-game coaching. Reads the Live Client snapshot each poll and emits
// prioritized, time-aware coaching prompts — the "Phase 2" the LiveGamePanel
// header always promised ("vas 20cs por debajo", objective prep, death
// discipline). Distinct from inGameAdapter (which only reacts to enemy ITEMS):
// this reasons about laning state, tempo, and macro.
//
// 100% derived from Riot's official Live Client Data API — no memory reads,
// no OCR, nothing against Riot's third-party policy.

import type { LiveGamePlayer } from "../services/liveClient";

export type LiveCoachSeverity = "critical" | "warn" | "good" | "info";

export interface LiveCoachInsight {
  /** Stable key so the UI can keep React keys steady across polls. */
  key: string;
  severity: LiveCoachSeverity;
  text: string;
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
}

const LANES = new Set(["TOP", "MIDDLE", "BOTTOM"]);
const MIN_GAME_TIME = 90; // <1:30 there's nothing to coach yet
const EXPECTED_CSPM = 6.5; // a clean solo-lane pace; below 70% of it = a leak
const CS_BEHIND = 20; // CS deficit vs your laner that warrants "play safe"
const CS_AHEAD = 25; // CS lead worth converting to map pressure
const DRAGON_PREP_WINDOW = 45; // seconds before spawn to start prepping
const BARON_PREP_WINDOW = 60;
const RECALL_GOLD = 2000;

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
  const { me, laneOpponent, gameTime, nextDragonAt, nextBaronAt, currentGold } =
    args;
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
      text: `Mueres demasiado (${k}/${d}/${a}). Prioriza NO morir sobre conseguir kills.`,
    });
  } else if (d >= 4 && d > k + a) {
    out.push({
      key: "deaths-warn",
      severity: "warn",
      text: `Mueres más de lo que aportas (${k}/${d}/${a}). Juega seguro y farmea.`,
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
          text: `Vas ${diff} CS vs ${laneOpponent.championName}. Farmea seguro bajo torre y recupera oleadas.`,
        });
      } else if (diff >= CS_AHEAD) {
        out.push({
          key: "lane-ahead",
          severity: "good",
          text: `Vas +${diff} CS vs ${laneOpponent.championName}. Transfiere la ventaja: roam u objetivo.`,
        });
      }
      if (me.level <= laneOpponent.level - 2) {
        out.push({
          key: "lvl-behind",
          severity: "warn",
          text: `−${laneOpponent.level - me.level} niveles vs ${laneOpponent.championName}. No cedas XP, quédate en la oleada.`,
        });
      }
    } else if (minutes >= 5) {
      const expected = Math.round(minutes * EXPECTED_CSPM);
      if (me.scores.creepScore < expected * 0.7) {
        out.push({
          key: "cs-pace",
          severity: "warn",
          text: `Farm bajo: ${me.scores.creepScore} CS en ${Math.floor(minutes)}min (~${expected} esperado). Recupera oleadas entre jugadas.`,
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
        text: `Barón en ${eta}s: pon visión YA y no facechequees el foso.`,
      });
    }
  }
  if (nextDragonAt !== null) {
    const eta = Math.round(nextDragonAt - gameTime);
    if (eta >= 0 && eta <= DRAGON_PREP_WINDOW) {
      out.push({
        key: "obj-dragon",
        severity: "warn",
        text: `Dragón en ${eta}s: empuja tu oleada y wardea el río.`,
      });
    }
  }

  // --- Reset value ------------------------------------------------------
  if (!me.isDead && currentGold >= RECALL_GOLD) {
    out.push({
      key: "recall",
      severity: "info",
      text: `Tienes ${Math.round(currentGold)} de oro sin gastar. Recall en la próxima ventana de oleada.`,
    });
  }

  out.sort((x, y) => RANK[x.severity] - RANK[y.severity]);
  return out.slice(0, 3);
}
