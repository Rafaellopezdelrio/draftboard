import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

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
  };
}

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
      timer = setTimeout(tick, consecutiveNulls >= 12 ? 30000 : 5000);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return state;
}
