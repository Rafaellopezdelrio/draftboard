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

/**
 * Push a recommended item set to the LCU. Shows up in the in-game shop's
 * left sidebar so the user can buy each block with a click.
 *
 * Blocks are labelled groups of items (e.g. "Starter", "Core", "Vs AP")
 * with stable order. Riot's schema is loose (item IDs are strings, fields
 * are mostly optional) — our Rust wrapper builds a valid payload around
 * the minimal shape callers provide.
 *
 * Returns true on success, false when the LCU isn't ready (login screen
 * or client closed) or on any error. Never throws.
 */
export interface ItemSetInput {
  championId: number;
  title: string;
  blocks: Array<{
    type: string;
    items: Array<{ id: number; count?: number }>;
  }>;
}
export async function pushItemSet(set: ItemSetInput): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const ok = await invoke<boolean>("lcu_push_item_set", { set });
    return ok;
  } catch {
    return false;
  }
}

/**
 * Apply two summoner spells to the local player's current pick in champ
 * select. Returns `true` if the LCU accepted the change, `false` if we're
 * not in champ select (404) or the call failed for any other reason —
 * never throws so callers can fire-and-forget.
 *
 * Riot spell IDs: 4=Flash, 14=Ignite, 11=Smite, 12=Teleport, 7=Heal,
 * 3=Exhaust, 1=Cleanse, 6=Ghost, 21=Barrier.
 */
export async function applySummonerSpells(
  spell1: number,
  spell2: number
): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const ok = await invoke<boolean>("lcu_apply_summoner_spells", {
      spell1,
      spell2,
    });
    return ok;
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
  // 1) Subscribe FIRST so we don't miss events arriving between calls.
  const unlisten = await listen<LcuStatus>("lcu:status", (e) => cb(e.payload));
  // 2) Then ask for the current cached status — the watcher only emits on
  // change, so after HMR / late mount the frontend needs to seed itself.
  try {
    const current = await invoke<LcuStatus>("lcu_status");
    cb(current);
  } catch {
    // command not available (older binary, etc.) — listener will catch the
    // next change.
  }
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
