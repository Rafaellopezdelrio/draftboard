// Lobby synthesis — turns the per-player rank/WR rows the lobby scout already
// fetches (lobbyScout.ScoutedPlayer, via LCU) into a team-level read: who to
// play around, who to cover, the biggest enemy threat, and the overall rank
// balance. The panel showed five rows; this says what to DO with them — our
// identity (the verdict), not Porofessor's raw list.
//
// Pure + reuses rankValue from scoutInsights. ToS-safe (LCU data only).

import type { ScoutedPlayer } from "../services/lobbyScout";
import { rankValue } from "./scoutInsights";

export interface LobbyCallout {
  name: string;
  reason: string;
}

export interface LobbyRead {
  /** Ally most worth playing around (your win condition). */
  carry: LobbyCallout | null;
  /** Ally most likely to underperform (cover / don't depend on). */
  liability: LobbyCallout | null;
  /** Biggest enemy threat to respect. */
  topThreat: LobbyCallout | null;
  /** Rank balance between teams + a one-line tactical read. */
  balance: { delta: number; text: string } | null;
}

// rankValue is ~4 per tier (division = 1). UNRANKED has no value; for ranking
// players we use a neutral placeholder so they're neither carry nor liability
// purely from being unranked.
const UNRANKED_PLACEHOLDER = 8; // ~ Silver
const MIN_SAMPLE = 20; // games before win rate is trusted
const PLATINUM = 16; // rankValue at PLATINUM IV
const TIER = 4; // rankValue units per tier

function reliability(p: ScoutedPlayer): number {
  const rv = rankValue(p.soloRank, p.soloLp) ?? UNRANKED_PLACEHOLDER;
  const wrAdj = p.soloGames >= MIN_SAMPLE ? (p.soloWinRate - 0.5) * 10 : 0;
  return rv + wrAdj;
}

function fmt(p: ScoutedPlayer): string {
  const wr = `${Math.round(p.soloWinRate * 100)}% en ${p.soloGames}g`;
  return p.soloRank ? `${p.soloRank}, ${wr}` : `unranked, ${wr}`;
}

function maxBy<T>(arr: T[], f: (x: T) => number): T | null {
  let best: T | null = null;
  let bestV = -Infinity;
  for (const x of arr) {
    const v = f(x);
    if (v > bestV) {
      bestV = v;
      best = x;
    }
  }
  return best;
}

export function readLobby(
  myTeam: ScoutedPlayer[],
  theirTeam: ScoutedPlayer[]
): LobbyRead {
  const allies = myTeam.filter((p) => p.loaded);
  const enemies = theirTeam.filter((p) => p.loaded);

  // Carry: best ally that genuinely stands out (high rank OR strong proven WR).
  let carry: LobbyCallout | null = null;
  const bestAlly = maxBy(allies, reliability);
  if (bestAlly) {
    const rv = rankValue(bestAlly.soloRank, bestAlly.soloLp);
    const standout =
      (rv != null && rv >= PLATINUM) ||
      (bestAlly.soloGames >= MIN_SAMPLE && bestAlly.soloWinRate >= 0.56);
    if (standout) {
      carry = {
        name: bestAlly.summonerName,
        reason: `${fmt(bestAlly)} — tu win condition, juega alrededor suyo.`,
      };
    }
  }

  // Liability: ally we can't lean on (tiny sample / proven low WR).
  let liability: LobbyCallout | null = null;
  const worstAlly = allies.length >= 2 ? minByReliability(allies) : null;
  if (worstAlly && worstAlly.summonerName !== carry?.name) {
    const weak =
      worstAlly.soloGames < 10 ||
      (worstAlly.soloGames >= MIN_SAMPLE && worstAlly.soloWinRate < 0.45);
    if (weak) {
      const why =
        worstAlly.soloGames < 10
          ? "muestra pequeña / posible autofill"
          : "bajo de forma";
      liability = {
        name: worstAlly.summonerName,
        reason: `${fmt(worstAlly)} — ${why}, no dependas de él.`,
      };
    }
  }

  // Top enemy threat: best enemy worth respecting.
  let topThreat: LobbyCallout | null = null;
  const bestEnemy = maxBy(enemies, reliability);
  if (bestEnemy) {
    const rv = rankValue(bestEnemy.soloRank, bestEnemy.soloLp);
    const scary =
      (rv != null && rv >= PLATINUM) ||
      (bestEnemy.soloGames >= MIN_SAMPLE && bestEnemy.soloWinRate >= 0.56);
    if (scary) {
      topThreat = {
        name: bestEnemy.summonerName,
        reason: `${fmt(bestEnemy)} — mayor amenaza enemiga, respeta su carril.`,
      };
    }
  }

  // Balance: average rank of each team (only players with a real rank).
  const balance = teamBalance(allies, enemies);

  return { carry, liability, topThreat, balance };
}

function minByReliability(arr: ScoutedPlayer[]): ScoutedPlayer | null {
  return maxBy(arr, (p) => -reliability(p));
}

export interface DodgeHint {
  severity: "warn";
  text: string;
}

// Rank gap (in rankValue units, ~4 per tier) that makes a game an uphill climb.
const OUTRANKED = 8; // ~2 tiers behind
const HEAVILY_OUTRANKED = 12; // ~3 tiers behind

/** A non-pushy "this is an uphill game, maybe dodge" read, derived purely from
 *  the lobby data we already computed. Only fires when the enemy clearly
 *  outranks AND there's an extra negative signal (or the gap is huge) — so it
 *  stays rare and meaningful, not spammy. Dodging costs LP; we only surface it
 *  when the matchup is genuinely lopsided. */
export function dodgeHint(read: LobbyRead): DodgeHint | null {
  if (!read.balance) return null;
  const delta = read.balance.delta; // mine - theirs (negative = enemy stronger)
  const heavy = delta <= -HEAVILY_OUTRANKED;
  const outranked = delta <= -OUTRANKED;
  if (!heavy && !(outranked && (read.liability || read.topThreat))) return null;

  const tiers = Math.round(Math.abs(delta) / 4);
  const bits = [`enemigo ~+${tiers} tiers`];
  if (read.topThreat) bits.push("amenaza fuerte");
  if (read.liability) bits.push("aliado flojo");
  return {
    severity: "warn",
    text: `Partida cuesta arriba (${bits.join(", ")}). Valora dodgear: a veces -LP sale más barato que una derrota probable.`,
  };
}

function teamBalance(
  allies: ScoutedPlayer[],
  enemies: ScoutedPlayer[]
): { delta: number; text: string } | null {
  const avg = (ps: ScoutedPlayer[]): number | null => {
    const vals = ps
      .map((p) => rankValue(p.soloRank, p.soloLp))
      .filter((v): v is number => v != null);
    if (vals.length < 2) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  const mine = avg(allies);
  const theirs = avg(enemies);
  if (mine == null || theirs == null) return null;
  const delta = mine - theirs;
  let text: string;
  if (delta >= TIER) {
    text = "Outrankeas al enemigo — presiona temprano, fuerza tu ventaja.";
  } else if (delta <= -TIER) {
    text = "El enemigo outrankea — juega seguro, agrupa y juega objetivos.";
  } else {
    text = "Equipos parejos en rango — el draft y la ejecución deciden.";
  }
  return { delta, text };
}
