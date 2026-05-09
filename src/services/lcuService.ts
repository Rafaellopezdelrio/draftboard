import { listen } from "@tauri-apps/api/event";
import type { Role } from "../types/champion";

export interface LcuStatus {
  connected: boolean;
  reason?: string | null;
}

export interface LcuPlayer {
  cellId: number;
  championId: number;
  championPickIntent?: number;
  assignedPosition?: string;
  summonerId?: number;
}

export interface LcuChampSelectSession {
  myTeam: LcuPlayer[];
  theirTeam: LcuPlayer[];
  bans: { myTeamBans: number[]; theirTeamBans: number[] };
  localPlayerCellId: number;
  timer?: { phase: string; adjustedTimeLeftInPhase: number };
}

export type LcuListener = (s: LcuChampSelectSession) => void;
export type StatusListener = (s: LcuStatus) => void;

export async function subscribeChampSelect(
  cb: LcuListener
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const unlisten = await listen<LcuChampSelectSession>(
    "lcu:champ-select",
    (e) => cb(e.payload)
  );
  return unlisten;
}

export async function subscribeStatus(
  cb: StatusListener
): Promise<() => void> {
  if (!isTauri()) {
    cb({ connected: false, reason: "running in browser" });
    return () => {};
  }
  const unlisten = await listen<LcuStatus>("lcu:status", (e) => cb(e.payload));
  return unlisten;
}

export function lcuPositionToRole(p?: string): Role | null {
  switch ((p ?? "").toUpperCase()) {
    case "TOP":
      return "TOP";
    case "JUNGLE":
      return "JUNGLE";
    case "MIDDLE":
    case "MID":
      return "MIDDLE";
    case "BOTTOM":
    case "BOT":
    case "ADC":
      return "BOTTOM";
    case "UTILITY":
    case "SUPPORT":
    case "SUP":
      return "UTILITY";
    default:
      return null;
  }
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
