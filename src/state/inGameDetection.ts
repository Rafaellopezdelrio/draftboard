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
    const tick = async () => {
      // Pause when window hidden — UI doesn't need a fresh gameflow
      // state if the user can't see the rendering. We deliberately
      // keep the interval running (vs clearing on hide + restarting
      // on show) because reattaching gameflow detection has a tiny
      // race window where post-game auto-coach could miss its trigger.
      if (typeof document !== "undefined" && document.hidden) return;
      const session = await lcuGetSafe<GameflowSession>("/lol-gameflow/v1/session");
      if (cancelled) return;
      setState({
        phase: session?.phase ?? null,
        gameId: session?.gameData?.gameId,
      });
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return state;
}
