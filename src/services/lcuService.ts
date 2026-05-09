import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { Role } from "../types/champion";

export interface LcuSummoner {
  puuid: string;
  gameName?: string;
  tagLine?: string;
  displayName?: string;
  summonerLevel?: number;
  region?: string;
}

export async function getCurrentSummoner(): Promise<LcuSummoner | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<LcuSummoner>("lcu_current_summoner");
  } catch {
    return null;
  }
}

export interface LcuSummonerLite {
  puuid: string;
  gameName?: string;
  tagLine?: string;
  summonerId?: number;
}

export async function getSummonerById(
  summonerId: number
): Promise<LcuSummonerLite | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<LcuSummonerLite>("lcu_summoner_by_id", { summonerId });
  } catch {
    return null;
  }
}

export interface RunePageInput {
  name: string;
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[];
}

export async function applyRunes(page: RunePageInput): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    await invoke("lcu_apply_runes", { page });
    return true;
  } catch {
    return false;
  }
}

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
