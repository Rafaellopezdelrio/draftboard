import { describe, it, expect } from "vitest";
import { buildLeakMemory } from "./leakMemory";
import type { Leak, LeakReport } from "../engine/leakEngine";

function leak(key: Leak["key"], label: string, insight: string): Leak {
  return {
    key,
    label,
    winAvg: 2,
    lossAvg: 6,
    delta: 4,
    effect: 0.9,
    severity: "bad",
    insight,
    advice: "x",
  };
}

function report(over: Partial<LeakReport> = {}): LeakReport {
  const l = leak("deaths", "Muertes", "Muertes: derrotas 6.0 vs victorias 2.0");
  return {
    topLeak: l,
    leaks: [l],
    games: 20,
    wins: 10,
    losses: 10,
    macro: false,
    headline: "h",
    ...over,
  };
}

describe("buildLeakMemory", () => {
  it("saves a fresh leak and reports no change when there's no prior", () => {
    const u = buildLeakMemory(report(), null);
    expect(u.shouldSave).toBe(true);
    expect(u.changed).toBe(false);
    expect(u.progress).toBeNull();
    expect(u.content).toMatch(/\[deaths\]$/);
  });

  it("does not re-save when the leak is unchanged", () => {
    const u = buildLeakMemory(report(), "Fuga principal: Muertes — ... [deaths]");
    expect(u.shouldSave).toBe(false);
    expect(u.changed).toBe(false);
  });

  it("detects a shift and emits a progress note", () => {
    const u = buildLeakMemory(report(), "Fuga principal: Visión — ... [vision]");
    expect(u.changed).toBe(true);
    expect(u.shouldSave).toBe(true);
    expect(u.progress).toMatch(/vision → deaths/);
  });

  it("encodes a macro verdict with a macro key", () => {
    const u = buildLeakMemory(report({ macro: true, headline: "macro problem" }), null);
    expect(u.key).toBe("macro");
    expect(u.content).toMatch(/macro\/draft/);
    expect(u.content).toMatch(/\[macro\]$/);
  });
});
