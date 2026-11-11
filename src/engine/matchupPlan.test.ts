import { describe, it, expect } from "vitest";
import { buildMatchupPlan } from "./matchupPlan";
import type { BuildAdaptation } from "./adaptiveBuildEngine";
import type { MatchupBuild } from "../services/opggMatchupBuild";

const path = (ids: number[]) => ({ ids, names: [], play: 100, win: 50, pickRate: 0.5 });
const build = (over: Partial<MatchupBuild> = {}): MatchupBuild => ({
  games: 1000,
  wins: 500,
  tip: null,
  laneAdvantage: null,
  soloKillAdvantage: null,
  playStyle: null,
  coreItems: [path([3118, 4645, 3157])],
  boots: [path([3020])],
  starterItems: [path([1056, 2003])],
  runes: [],
  summonerSpells: [],
  ...over,
});
const adapt = (itemId: number, priority: "core" | "situational", reason = `r${itemId}`): BuildAdaptation => ({
  itemId,
  itemName: `i${itemId}`,
  reason,
  priority,
});

describe("buildMatchupPlan", () => {
  it("with no team needs, the plan is the lane build in order", () => {
    const p = buildMatchupPlan(build(), []);
    expect(p.steps).toEqual([
      { slot: "start", ids: [1056, 2003], source: "lane" },
      { slot: "first", ids: [3118], source: "lane" },
      { slot: "boots", ids: [3020], source: "lane" },
      { slot: "second", ids: [4645], source: "lane" },
      { slot: "third", ids: [3157], source: "lane" },
    ]);
    expect(p.situational).toEqual([]);
  });

  it("team boots replace the lane boots and carry the reason", () => {
    const p = buildMatchupPlan(build(), [adapt(3111, "core", "mucho CC")]);
    expect(p.steps.find((s) => s.slot === "boots")).toEqual({
      slot: "boots",
      ids: [3111],
      source: "team",
      reason: "mucho CC",
    });
  });

  it("boots the lane already buys stay a lane step", () => {
    const p = buildMatchupPlan(build({ boots: [path([3111])] }), [adapt(3111, "core")]);
    expect(p.steps.find((s) => s.slot === "boots")).toEqual({ slot: "boots", ids: [3111], source: "lane" });
    expect(p.situational).toEqual([]);
  });

  it("one core adaptation takes the third slot; the first item never moves", () => {
    const p = buildMatchupPlan(build(), [adapt(3165, "core", "curación")]);
    expect(p.steps.map((s) => [s.slot, s.ids[0], s.source])).toEqual([
      ["start", 1056, "lane"],
      ["first", 3118, "lane"],
      ["boots", 3020, "lane"],
      ["second", 4645, "lane"],
      ["third", 3165, "team"],
    ]);
  });

  it("two core adaptations take third then second; a third one is left as situational", () => {
    const a = [adapt(3165, "core"), adapt(3102, "core"), adapt(3135, "core"), adapt(2420, "situational")];
    const p = buildMatchupPlan(build(), a);
    expect(p.steps.find((s) => s.slot === "first")?.ids).toEqual([3118]);
    expect(p.steps.find((s) => s.slot === "third")?.ids).toEqual([3165]);
    expect(p.steps.find((s) => s.slot === "second")?.ids).toEqual([3102]);
    expect(p.situational.map((x) => x.itemId)).toEqual([3135, 2420]);
  });

  it("an adaptation already in the lane core changes nothing and is not repeated", () => {
    const p = buildMatchupPlan(build(), [adapt(3157, "core")]);
    expect(p.steps.every((s) => s.source === "lane")).toBe(true);
    expect(p.situational).toEqual([]);
  });

  it("situational adaptations never take a core slot", () => {
    const p = buildMatchupPlan(build(), [adapt(3165, "situational")]);
    expect(p.steps.find((s) => s.slot === "third")?.ids).toEqual([3157]);
    expect(p.situational.map((x) => x.itemId)).toEqual([3165]);
  });

  it("survives a build with missing pieces", () => {
    const p = buildMatchupPlan(build({ coreItems: [], boots: [], starterItems: [] }), [adapt(3165, "core")]);
    expect(p.steps).toEqual([]);
    expect(p.situational.map((x) => x.itemId)).toEqual([3165]);
  });
});
