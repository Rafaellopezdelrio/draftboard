import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentSummoner } from "../services/lcuService";
import {
  rosterFromGameflow,
  applyGameflowRoster,
  type GameflowGameData,
} from "./gameflowRoster";

export type GamePhase =
  | "None"
  | "Lobby"
  | "Matchmaking"
  | "ReadyCheck"
  | "ChampSelect"
  | "GameStart"
  | "InProgress"
  | "PreEndOfGame"
  | "EndOfGame"
  | "WaitingForStats";

interface GameflowSession {
  phase: GamePhase;
  gameData?: {
    gameId?: number;
    queue?: { id: number; description: string };
    isCustomGame?: boolean;
  } & GameflowGameData;
}

// Local player's identity for gameflow team-side resolution. Fetched lazily
// once per mount; cleared on unmount so an account switch re-resolves.
let gfMe: { puuid?: string | null; summonerId?: number | null } | null = null;

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function lcuGetSafe<T>(path: string): Promise<T | null> {
  if (!isTauri()) return null;
  try {
    return (await invoke<T>("lcu_get_json", { path })) ?? null;
  } catch {
    return null;
  }
}

export function useGamePhase(): { phase: GamePhase | null; gameId?: number } {
  const [state, setState] = useState<{ phase: GamePhase | null; gameId?: number }>({
    phase: null,
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Adaptive cadence: 5s while LoL is (or might be) running; after ~1min of
    // consecutive nulls (client closed — lockfile read fails fast) back off to
    // 30s so we don't burn an IPC round-trip every 5s for hours of "LoL isn't
    // open". A single non-null resets to the fast cadence. Worst case this
    // delays "user just opened LoL" detection by ≤30s — harmless, since
    // reaching an actual game from a cold client takes minutes.
    let consecutiveNulls = 0;
    const tick = async () => {
      // CRITICAL: do NOT pause this on document.hidden. The whole
      // point of gameflow detection is to know when the user goes
      // InProgress -> ended, which happens WHILE Draftboard is hidden
      // (user is in LoL fullscreen/borderless). Skipping polls when
      // hidden meant we never registered the transitions -> post-game
      // auto-coach never fired. Wave 14 mistakenly added a hidden
      // guard here; this revert keeps the LCU poll always-on.
      const session = await lcuGetSafe<GameflowSession>("/lol-gameflow/v1/session");
      if (cancelled) return;
      consecutiveNulls = session ? 0 : consecutiveNulls + 1;
      const next = {
        phase: session?.phase ?? null,
        gameId: session?.gameData?.gameId,
      };
      // Log only on phase transition so draftboard.log shows exactly when
      // gameflow flipped Lobby → ReadyCheck → ChampSelect → InProgress →
      // EndOfGame. Critical for diagnosing "post-game coach didn't open"
      // — if InProgress never logged, the poll missed the whole match.
      setState((prev) => {
        if (prev.phase !== next.phase) {
          // eslint-disable-next-line no-console
          console.log(`[useGamePhase] transition ${prev.phase ?? "null"} → ${next.phase ?? "null"}`);
        }
        return next;
      });

      // Loading-screen roster bridge: once the game is starting, the gameflow
      // payload (already in hand — zero extra IPC) carries teamOne/teamTwo.
      // Fill the draft board from it when anonymized champ select left it
      // empty; applyGameflowRoster never overwrites a populated board.
      if (
        (next.phase === "GameStart" || next.phase === "InProgress") &&
        session?.gameData
      ) {
        if (!gfMe) {
          const me = await getCurrentSummoner();
          if (cancelled) return;
          if (me?.puuid) gfMe = { puuid: me.puuid };
        }
        if (gfMe) {
          const wrote = applyGameflowRoster(
            rosterFromGameflow(session.gameData, gfMe)
          );
          if (wrote) {
            // eslint-disable-next-line no-console
            console.info("[useGamePhase] board filled from gameflow roster (anonymized-select bridge)");
          }
        }
      }

      timer = setTimeout(tick, consecutiveNulls >= 12 ? 30000 : 5000);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      // Re-resolve identity on remount (account switch / HMR).
      gfMe = null;
    };
  }, []);

  return state;
}
