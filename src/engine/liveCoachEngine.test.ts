import { describe, it, expect } from "vitest";
import { coachLiveGame } from "./liveCoachEngine";
import type { LiveGamePlayer, LiveGameScores } from "../services/liveClient";

function sc(o: Partial<LiveGameScores>): LiveGameScores {
  return { assists: 0, creepScore: 0, deaths: 0, kills: 0, wardScore: 0, ...o };
}

function p(over: Partial<LiveGamePlayer>): LiveGamePlayer {
  return {
    championName: "Ahri",
    isBot: false,
    isDead: false,
    level: 6,
    position: "MIDDLE",
    rawChampionName: "game_character_displayname_Ahri",
    scores: sc({}),
    skinID: 0,
    summonerName: "me",
    summonerSpells: {
      summonerSpellOne: { displayName: "Flash", rawDescription: "" },
      summonerSpellTwo: { displayName: "Ignite", rawDescription: "" },
    },
    team: "ORDER",
    items: [],
    ...over,
  };
}

const base = {
  laneOpponent: null,
  gameTime: 1200,
  nextDragonAt: null,
  nextBaronAt: null,
  currentGold: 0,
};

describe("coachLiveGame", () => {
  it("returns nothing without a player or too early", () => {
    expect(coachLiveGame({ ...base, me: null })).toEqual([]);
    expect(coachLiveGame({ ...base, me: p({}), gameTime: 30 })).toEqual([]);
  });

  it("flags heavy deaths as critical and ranks it first", () => {
    const r = coachLiveGame({
      ...base,
      me: p({ position: "JUNGLE", scores: sc({ kills: 1, deaths: 8, assists: 1 }) }),
    });
    expect(r[0].key).toBe("deaths-critical");
    expect(r[0].severity).toBe("critical");
  });

  it("warns when behind your direct lane opponent in CS", () => {
    const r = coachLiveGame({
      ...base,
      me: p({ position: "MIDDLE", scores: sc({ creepScore: 80 }) }),
      laneOpponent: p({ championName: "Zed", position: "MIDDLE", scores: sc({ creepScore: 110 }) }),
      gameTime: 900,
    });
    expect(r.map((i) => i.key)).toContain("lane-behind");
  });

  it("praises a CS lead as a convertible advantage", () => {
    const r = coachLiveGame({
      ...base,
      me: p({ position: "MIDDLE", scores: sc({ creepScore: 120 }) }),
      laneOpponent: p({ championName: "Zed", position: "MIDDLE", scores: sc({ creepScore: 90 }) }),
      gameTime: 900,
    });
    const ahead = r.find((i) => i.key === "lane-ahead");
    expect(ahead?.severity).toBe("good");
  });

  it("falls back to an absolute CS-pace check without a resolved opponent", () => {
    const r = coachLiveGame({
      ...base,
      me: p({ position: "MIDDLE", scores: sc({ creepScore: 20 }) }),
      gameTime: 600,
    });
    expect(r.map((i) => i.key)).toContain("cs-pace");
  });

  it("prompts objective prep inside the spawn window", () => {
    const r = coachLiveGame({
      ...base,
      me: p({ position: "JUNGLE" }),
      gameTime: 300,
      nextDragonAt: 330,
    });
    expect(r).toEqual([
      expect.objectContaining({ key: "obj-dragon", severity: "warn" }),
    ]);
  });

  it("caps at 3 insights, highest severity first", () => {
    const r = coachLiveGame({
      ...base,
      me: p({ position: "MIDDLE", level: 3, scores: sc({ deaths: 8, creepScore: 10 }) }),
      laneOpponent: p({ championName: "Zed", position: "MIDDLE", level: 7, scores: sc({ creepScore: 120 }) }),
      gameTime: 900,
      nextDragonAt: 920,
      currentGold: 2500,
    });
    expect(r).toHaveLength(3);
    expect(r[0].severity).toBe("critical");
    expect(r.some((i) => i.severity === "info")).toBe(false); // recall dropped by cap
  });

  it("suggests a reset when sitting on gold", () => {
    const r = coachLiveGame({
      ...base,
      me: p({ position: "JUNGLE" }),
      gameTime: 900,
      currentGold: 2100,
    });
    expect(r).toEqual([
      expect.objectContaining({ key: "recall", severity: "info" }),
    ]);
  });

  it("nudges a retreat at critically low HP, but not when healthy", () => {
    const low = coachLiveGame({
      ...base,
      me: p({ position: "JUNGLE" }),
      myHpPct: 0.15,
    });
    expect(low).toContainEqual(
      expect.objectContaining({ key: "low-hp", severity: "warn" })
    );
    const healthy = coachLiveGame({
      ...base,
      me: p({ position: "JUNGLE" }),
      myHpPct: 0.6,
    });
    expect(healthy.some((i) => i.key === "low-hp")).toBe(false);
  });

  it("raises a critical soul-deny when the enemy is on soul point", () => {
    const r = coachLiveGame({
      ...base,
      me: p({ position: "JUNGLE" }),
      myTeam: "ORDER",
      dragonsByTeam: { ORDER: 1, CHAOS: 3 },
    });
    expect(r).toContainEqual(
      expect.objectContaining({ key: "soul-deny", severity: "critical" })
    );
  });

  it("flags our own soul point as a good objective to force", () => {
    const r = coachLiveGame({
      ...base,
      me: p({ position: "JUNGLE" }),
      myTeam: "ORDER",
      dragonsByTeam: { ORDER: 3, CHAOS: 0 },
    });
    expect(r).toContainEqual(
      expect.objectContaining({ key: "soul-take", severity: "good" })
    );
  });

  it("warns while the enemy Baron buff is active, then stops once it expires", () => {
    const active = coachLiveGame({
      ...base,
      me: p({ position: "JUNGLE" }),
      gameTime: 1500,
      myTeam: "ORDER",
      lastBaronTeam: "CHAOS",
      lastBaronAt: 1440, // 60s ago -> still active
    });
    expect(active).toContainEqual(
      expect.objectContaining({ key: "baron-enemy", severity: "warn" })
    );

    const expired = coachLiveGame({
      ...base,
      me: p({ position: "JUNGLE" }),
      gameTime: 1700,
      myTeam: "ORDER",
      lastBaronTeam: "CHAOS",
      lastBaronAt: 1440, // 260s ago -> buff gone
    });
    expect(expired.some((i) => i.key === "baron-enemy")).toBe(false);
  });
});
