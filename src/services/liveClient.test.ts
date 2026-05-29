import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import {
  fetchLiveGameSnapshot,
  findMyPlayer,
  liveChampionKey,
  type LiveGameActivePlayer,
  type LiveGamePlayer,
} from "./liveClient";
import type { ChampionDb } from "../types/champion";

const mkPlayer = (over: Partial<LiveGamePlayer>): LiveGamePlayer => ({
  championName: "Lux",
  isBot: false,
  isDead: false,
  level: 1,
  position: "",
  rawChampionName: "",
  scores: { assists: 0, creepScore: 0, deaths: 0, kills: 0, wardScore: 0 },
  skinID: 0,
  summonerName: "",
  summonerSpells: {
    summonerSpellOne: { displayName: "Flash", rawDescription: "" },
    summonerSpellTwo: { displayName: "Ignite", rawDescription: "" },
  },
  team: "ORDER",
  items: [],
  ...over,
});

describe("findMyPlayer — robust local-player matching across Riot ID shapes", () => {
  it("matches when both sides use plain summonerName", () => {
    const active = { summonerName: "Rafa", currentGold: 0, level: 1 } as LiveGameActivePlayer;
    const all = [
      mkPlayer({ summonerName: "Foe", team: "ORDER" }),
      mkPlayer({ summonerName: "Rafa", team: "CHAOS" }),
    ];
    expect(findMyPlayer(active, all)?.team).toBe("CHAOS");
  });

  it("matches when active has gameName but allPlayers entries use gameName#tag", () => {
    const active = {
      summonerName: "Rafa",
      riotIdGameName: "Rafa",
      currentGold: 0,
      level: 1,
    } as LiveGameActivePlayer;
    const all = [
      mkPlayer({ summonerName: "Rafa#EUW", riotIdGameName: "Rafa", riotIdTagLine: "EUW", team: "CHAOS" }),
      mkPlayer({ summonerName: "Other#NA", riotIdGameName: "Other", riotIdTagLine: "NA", team: "ORDER" }),
    ];
    expect(findMyPlayer(active, all)?.team).toBe("CHAOS");
  });

  it("matches via riotIdGameName when summonerName fields disagree (ARAM CHAOS bug)", () => {
    const active = {
      summonerName: "Rafa#EUW",
      riotIdGameName: "Rafa",
      riotIdTagLine: "EUW",
      currentGold: 0,
      level: 1,
    } as LiveGameActivePlayer;
    const all = [
      mkPlayer({ summonerName: "", riotIdGameName: "Rafa", riotIdTagLine: "EUW", team: "CHAOS" }),
      mkPlayer({ summonerName: "", riotIdGameName: "Mate", riotIdTagLine: "EUW", team: "CHAOS" }),
    ];
    expect(findMyPlayer(active, all)?.team).toBe("CHAOS");
  });

  it("returns null when no match exists", () => {
    const active = { summonerName: "Ghost", currentGold: 0, level: 1 } as LiveGameActivePlayer;
    const all = [mkPlayer({ summonerName: "Other" })];
    expect(findMyPlayer(active, all)).toBeNull();
  });

  it("handles whitespace & case differences", () => {
    const active = { summonerName: "RAFA LOPEZ", currentGold: 0, level: 1 } as LiveGameActivePlayer;
    const all = [mkPlayer({ summonerName: "rafalopez", team: "CHAOS" })];
    expect(findMyPlayer(active, all)?.team).toBe("CHAOS");
  });
});


describe("liveClient.fetchLiveGameSnapshot", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    // Force isTauri() === true so the function actually invokes.
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      value: {},
      writable: true,
      configurable: true,
    });
  });

  it("returns null when the invoke command throws (not in game)", async () => {
    mockInvoke.mockRejectedValue(new Error("connection refused"));
    const snap = await fetchLiveGameSnapshot();
    expect(snap).toBeNull();
  });

  it("returns null when the response is not an object", async () => {
    mockInvoke.mockResolvedValue("garbage");
    const snap = await fetchLiveGameSnapshot();
    expect(snap).toBeNull();
  });

  it("flattens events.Events[] into a top-level events array", async () => {
    mockInvoke.mockResolvedValue({
      activePlayer: { currentGold: 500, level: 6, summonerName: "MeBoi" },
      allPlayers: [],
      events: {
        Events: [
          { EventID: 1, EventName: "GameStart", EventTime: 0 },
          { EventID: 7, EventName: "DragonKill", EventTime: 305 },
        ],
      },
      gameData: { gameMode: "CLASSIC", gameTime: 312, mapNumber: 11 },
    });
    const snap = await fetchLiveGameSnapshot();
    expect(snap).not.toBeNull();
    expect(snap?.events).toHaveLength(2);
    expect(snap?.events[1].EventName).toBe("DragonKill");
    expect(snap?.gameData.gameTime).toBe(312);
  });

  it("provides sensible defaults when fields are missing", async () => {
    mockInvoke.mockResolvedValue({}); // empty object — game just starting?
    const snap = await fetchLiveGameSnapshot();
    expect(snap).not.toBeNull();
    expect(snap?.allPlayers).toEqual([]);
    expect(snap?.events).toEqual([]);
    expect(snap?.activePlayer).toBeNull();
    expect(snap?.gameData.gameMode).toBe("");
  });

  it("preserves activePlayer fields verbatim", async () => {
    mockInvoke.mockResolvedValue({
      activePlayer: {
        currentGold: 1234.5,
        level: 11,
        summonerName: "Yo",
        championStats: { currentHealth: 800, maxHealth: 1000, resourceMax: 400, resourceValue: 200 },
      },
      allPlayers: [],
      events: { Events: [] },
      gameData: { gameMode: "CLASSIC", gameTime: 0, mapNumber: 11 },
    });
    const snap = await fetchLiveGameSnapshot();
    expect(snap?.activePlayer?.currentGold).toBe(1234.5);
    expect(snap?.activePlayer?.championStats?.maxHealth).toBe(1000);
  });
});

describe("liveChampionKey — live player → ChampionDb key", () => {
  const db = {
    champions: {
      "59": { id: "JarvanIV", key: "59", name: "Jarvan IV" },
      "19": { id: "Warwick", key: "19", name: "Warwick" },
      "62": { id: "MonkeyKing", key: "62", name: "Wukong" },
    },
  } as unknown as ChampionDb;

  it("maps via rawChampionName suffix === DDragon id (Jarvan, not the suggestion)", () => {
    expect(
      liveChampionKey(db, { rawChampionName: "game_character_displayname_JarvanIV" })
    ).toBe("59");
  });

  it("maps display-name mismatch via rawChampionName (Wukong → MonkeyKing)", () => {
    expect(
      liveChampionKey(db, { rawChampionName: "game_character_displayname_MonkeyKing", championName: "Wukong" })
    ).toBe("62");
  });

  it("falls back to championName when rawChampionName is empty", () => {
    expect(liveChampionKey(db, { championName: "Warwick", rawChampionName: "" })).toBe("19");
  });

  it("returns null when the champion isn't in the db", () => {
    expect(
      liveChampionKey(db, { rawChampionName: "game_character_displayname_Aatrox" })
    ).toBeNull();
  });
});
