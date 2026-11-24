// Team mode: reads the lobby from the LoL client (official local API) to know
// when five friends play together, suggests a team style from their main
// champions and keeps the style the group picked. Solo and duo never see it.

import { useEffect, useState } from "react";
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { getSummonerById } from "../services/lcuService";
import { getRiotProxyUrl, getTopMasteries } from "../services/riotApi";
import { settingsOrDefault } from "../services/accountResolve";
import { trackFeature } from "../services/reports";
import type { Champion, ChampionDb } from "../types/champion";
import { isTeamParty, suggestStyle, type PartyInfo, type TeamStyle } from "../engine/teamStyle";

/** The style the group picked; kept for the session (the next game of the
 * same group starts with it), changed with one click. */
export const useTeamStyleStore = create<{ style: TeamStyle | null; setStyle: (s: TeamStyle | null) => void }>(
  (set) => ({
    style: null,
    setStyle: (style) => {
      if (style) trackFeature("team-style");
      set({ style });
    },
  })
);

/** Phases in which the party is known: before the queue pops and in champ select. */
const PARTY_PHASES = new Set(["Lobby", "Matchmaking", "ReadyCheck", "ChampSelect"]);
/** Friends join the lobby one by one. */
const POLL_MS = 5000;
/** Main champions read per player for the style suggestion. */
const POOL_SIZE = 5;

interface LcuLobby {
  members?: Array<{ summonerId?: number }>;
  gameConfig?: { gameMode?: string };
}

export async function readParty(): Promise<PartyInfo | null> {
  const lobby = await invoke<LcuLobby | null>("lcu_get_json", { path: "/lol-lobby/v2/lobby" });
  if (!lobby || !Array.isArray(lobby.members)) return null;
  return {
    size: lobby.members.length,
    gameMode: lobby.gameConfig?.gameMode ?? null,
    summonerIds: lobby.members.map((m) => m.summonerId ?? 0).filter((id) => id > 0),
  };
}

/** One suggestion per group of players (the same lobby asks once). */
const SUGGESTION_CACHE = new Map<string, Promise<TeamStyle | null>>();

async function fetchSuggestion(ids: number[], db: ChampionDb): Promise<TeamStyle | null> {
  const cfg = await settingsOrDefault();
  if (!cfg.apiKey && !getRiotProxyUrl()) return null;
  const pools: Champion[][] = [];
  for (const id of ids) {
    try {
      const puuid = (await getSummonerById(id))?.puuid;
      if (!puuid) continue;
      const top = await getTopMasteries(cfg, puuid, POOL_SIZE);
      pools.push(top.map((m) => db.champions[String(m.championId)]).filter((c): c is Champion => !!c));
    } catch {
      // A private or failed profile just leaves that player out.
    }
  }
  return suggestStyle(pools);
}

export function __testOnly_resetTeamMode() {
  SUGGESTION_CACHE.clear();
  useTeamStyleStore.setState({ style: null });
}

export interface TeamMode {
  /** Five together on Summoner's Rift. */
  active: boolean;
  /** The style most of the group can play, once their champions are read. */
  suggested: TeamStyle | null;
}

export function useTeamMode(phase: string | null, db: ChampionDb | null): TeamMode {
  const [party, setParty] = useState<PartyInfo | null>(null);
  const inParty = !!phase && PARTY_PHASES.has(phase);

  useEffect(() => {
    if (!inParty) {
      // Back to the client home or in game: the next lobby is read afresh.
      if (phase === "None") setParty(null);
      return;
    }
    let stale = false;
    const read = () =>
      readParty()
        .then((p) => {
          // A failed read keeps the last known party (champ select included).
          if (!stale && p) setParty(p);
        })
        .catch(() => {});
    void read();
    const t = setInterval(read, POLL_MS);
    return () => {
      stale = true;
      clearInterval(t);
    };
  }, [inParty, phase]);

  const active = isTeamParty(party);
  const key = active && party ? [...party.summonerIds].sort((a, b) => a - b).join(",") : "";
  const [suggested, setSuggested] = useState<{ key: string; style: TeamStyle | null } | null>(null);

  useEffect(() => {
    if (!key || !party || !db) return;
    trackFeature("team-mode");
    let p = SUGGESTION_CACHE.get(key);
    if (!p) {
      p = fetchSuggestion(party.summonerIds, db).catch(() => null);
      SUGGESTION_CACHE.set(key, p);
    }
    let cancelled = false;
    void p.then((style) => {
      if (!cancelled) setSuggested({ key, style });
    });
    return () => {
      cancelled = true;
    };
    // `party.summonerIds` is captured through `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, db]);

  return { active, suggested: suggested && suggested.key === key ? suggested.style : null };
}
