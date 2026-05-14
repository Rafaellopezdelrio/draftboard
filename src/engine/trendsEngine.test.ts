import { describe, it, expect } from "vitest";
import { computeTrends, detectWeakestArea } from "./trendsEngine";
import type { MatchRow } from "../services/matchRepo";

function match(opts: Partial<MatchRow> = {}): MatchRow {
  return {
    matchId: "EUW1_" + Math.random(),
    championId: 238,
    win: false,
    kills: 5,
    deaths: 5,
    assists: 5,
    cs: 200,
    durationSec: 1800,
    gameEndTimestampMs: Date.now(),
    queueId: 420,
    position: "MIDDLE",
    opponentChampionId: 0,
    ...opts,
  };
}

describe("computeTrends", () => {
  it("returns empty when fewer than 6 matches", () => {
    expect(computeTrends([])).toEqual([]);
    expect(computeTrends(Array(5).fill(0).map(() => match()))).toEqual([]);
  });

  it("detects upward winrate trend (recent wins > earlier wins)", () => {
    // Recent half (positions 0..2): all wins. Earlier half (3..5): all losses.
    const matches: MatchRow[] = [
      match({ win: true }), match({ win: true }), match({ win: true }),
      match({ win: false }), match({ win: false }), match({ win: false }),
    ];
    const trends = computeTrends(matches);
    const wr = trends.find((t) => t.metric === "Winrate");
    expect(wr).toBeDefined();
    expect(wr!.direction).toBe("up");
    expect(wr!.severity).toBe("good");
  });

  it("detects downward winrate trend (slumping)", () => {
    const matches: MatchRow[] = [
      match({ win: false }), match({ win: false }), match({ win: false }),
      match({ win: true }), match({ win: true }), match({ win: true }),
    ];
    const trends = computeTrends(matches);
    const wr = trends.find((t) => t.metric === "Winrate");
    expect(wr!.direction).toBe("down");
    expect(wr!.severity).toBe("warn");
  });

  it("KDA trend reflects kill efficiency change", () => {
    const matches: MatchRow[] = [
      match({ kills: 15, deaths: 2, assists: 10 }), // KDA 12.5
      match({ kills: 12, deaths: 3, assists: 8 }),
      match({ kills: 10, deaths: 2, assists: 5 }),
      match({ kills: 2, deaths: 10, assists: 1 }), // KDA 0.3
      match({ kills: 1, deaths: 8, assists: 0 }),
      match({ kills: 3, deaths: 9, assists: 2 }),
    ];
    const trends = computeTrends(matches);
    const kda = trends.find((t) => t.metric === "KDA");
    expect(kda!.direction).toBe("up");
    expect(kda!.severity).toBe("good");
  });

  it("CS/min trend ignores UTILITY matches", () => {
    const matches: MatchRow[] = [
      match({ cs: 300, position: "MIDDLE" }), // 10 cs/min
      match({ cs: 300, position: "MIDDLE" }),
      match({ cs: 50, position: "UTILITY" }), // ignored
      match({ cs: 100, position: "MIDDLE" }), // 3.3 cs/min
      match({ cs: 100, position: "MIDDLE" }),
      match({ cs: 30, position: "UTILITY" }), // ignored
    ];
    const trends = computeTrends(matches);
    const cspm = trends.find((t) => t.metric === "CS/min");
    expect(cspm).toBeDefined();
    expect(cspm!.direction).toBe("up"); // recent has the high CS games
  });

  it("flat trend when delta is below threshold", () => {
    const matches: MatchRow[] = Array(6).fill(0).map(() =>
      match({ kills: 5, deaths: 5, assists: 5 })
    );
    const trends = computeTrends(matches);
    expect(trends.every((t) => t.direction === "flat")).toBe(true);
  });
});

describe("detectWeakestArea", () => {
  it("returns null when too few matches", () => {
    expect(detectWeakestArea(Array(4).fill(0).map(() => match()))).toBeNull();
  });

  it("flags farming when DPS roles avg below 5.5 CS/min", () => {
    const matches = Array(5).fill(0).map(() =>
      match({ cs: 100, durationSec: 1800, position: "MIDDLE" }) // 3.3 cs/min
    );
    const w = detectWeakestArea(matches);
    expect(w?.category).toBe("Farming");
  });

  it("flags deaths when KDA below 1.5", () => {
    const matches = Array(5).fill(0).map(() =>
      match({ cs: 250, kills: 1, deaths: 10, assists: 2, position: "MIDDLE" })
    );
    const w = detectWeakestArea(matches);
    expect(w?.category).toBe("Muertes");
  });

  it("returns null when stats are healthy", () => {
    const matches = Array(5).fill(0).map(() =>
      match({ cs: 270, kills: 8, deaths: 3, assists: 7, position: "MIDDLE" })
    );
    expect(detectWeakestArea(matches)).toBeNull();
  });
});
