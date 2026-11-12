import { describe, it, expect } from "vitest";
import { counterScore, MIN_COUNTER_SAMPLE } from "./murderBridge";
import type { CounterEntry } from "../types/champion";

const entry = (vs: string, winRate: number, sampleSize: number): CounterEntry => ({
  championKey: "103",
  vsChampionKey: vs,
  role: "MIDDLE",
  winRate,
  sampleSize,
});

describe("counterScore", () => {
  it("averages the matchups with enough games", () => {
    expect(counterScore("103", ["238", "7"], "MIDDLE", [entry("238", 0.54, 4000), entry("7", 0.52, 900)])).toBeCloseTo(0.53);
  });

  it("ignores thin pairs, so an off-lane coin flip can't drown the real matchup", () => {
    const counters = [entry("238", 0.54, 4000), entry("122", 0.2, MIN_COUNTER_SAMPLE - 1)];
    expect(counterScore("103", ["238", "122"], "MIDDLE", counters)).toBeCloseTo(0.54);
  });

  it("neutral when nothing usable is known", () => {
    expect(counterScore("103", ["122"], "MIDDLE", [entry("122", 0.2, 5)])).toBe(0.5);
    expect(counterScore("103", [], "MIDDLE", [])).toBe(0.5);
  });
});
