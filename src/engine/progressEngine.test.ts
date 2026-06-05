import { describe, it, expect } from "vitest";
import { analyzeProgress, summarizeProgressForAi } from "./progressEngine";
import type { MatchRow } from "../services/matchRepo";

let id = 0;
function mk(
  ts: number,
  o: Partial<MatchRow> & { win: boolean }
): MatchRow {
  return {
    matchId: `m${id++}`,
    championId: 1,
    win: o.win,
    kills: o.kills ?? 5,
    deaths: o.deaths ?? 5,
    assists: o.assists ?? 5,
    cs: o.cs ?? 200,
    durationSec: o.durationSec ?? 1800, // 30 min
    gameEndTimestampMs: ts,
    queueId: 420,
    position: o.position ?? "MIDDLE",
    opponentChampionId: 0,
    visionScore: o.visionScore ?? null,
    goldEarned: o.goldEarned ?? null,
  };
}

describe("analyzeProgress", () => {
  it("returns null below the minimum sample", () => {
    const rows = Array.from({ length: 9 }, (_, i) => mk(i, { win: true }));
    expect(analyzeProgress(rows)).toBeNull();
  });

  it("detects improvement: deaths dropping over time reads as 'up'", () => {
    // older 5 games: 8 deaths; newer 5 games: 3 deaths.
    const older = Array.from({ length: 5 }, (_, i) =>
      mk(i, { win: false, deaths: 8 })
    );
    const newer = Array.from({ length: 5 }, (_, i) =>
      mk(100 + i, { win: true, deaths: 3 })
    );
    const r = analyzeProgress([...newer, ...older]); // unsorted input
    expect(r).not.toBeNull();
    const deaths = r!.metrics.find((m) => m.key === "deaths")!;
    expect(deaths.older).toBeCloseTo(8);
    expect(deaths.newer).toBeCloseTo(3);
    expect(deaths.improving).toBe(true);
    expect(deaths.direction).toBe("up");
  });

  it("classifies an overall improving trend when winrate rises", () => {
    const older = Array.from({ length: 5 }, (_, i) =>
      mk(i, { win: false, deaths: 9, cs: 150 })
    );
    const newer = Array.from({ length: 5 }, (_, i) =>
      mk(100 + i, { win: true, deaths: 3, cs: 260 })
    );
    const r = analyzeProgress([...older, ...newer])!;
    expect(r.trend).toBe("improving");
    expect(r.headline).toContain("subida");
    expect(r.windowGames).toBe(5);
  });

  it("classifies a declining trend when winrate falls", () => {
    const older = Array.from({ length: 5 }, (_, i) =>
      mk(i, { win: true, deaths: 3, cs: 260 })
    );
    const newer = Array.from({ length: 5 }, (_, i) =>
      mk(100 + i, { win: false, deaths: 9, cs: 150 })
    );
    const r = analyzeProgress([...older, ...newer])!;
    expect(r.trend).toBe("declining");
    expect(r.headline).toContain("Bajón");
  });

  it("marks tiny moves as flat / stable", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      mk(i, { win: i % 2 === 0, deaths: 5, cs: 200 })
    );
    const r = analyzeProgress(rows)!;
    const cs = r.metrics.find((m) => m.key === "cspm")!;
    expect(cs.direction).toBe("flat");
    expect(r.trend).toBe("stable");
  });

  it("excludes UTILITY games from the CS metric", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      mk(i, { win: true, position: "UTILITY" })
    );
    const r = analyzeProgress(rows)!;
    expect(r.metrics.find((m) => m.key === "cspm")).toBeUndefined();
  });

  it("skips vision when pre-010 rows lack the data", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      mk(i, { win: true, visionScore: null })
    );
    const r = analyzeProgress(rows)!;
    expect(r.metrics.find((m) => m.key === "vision")).toBeUndefined();
  });

  it("includes vision when both windows have enough samples", () => {
    const older = Array.from({ length: 5 }, (_, i) =>
      mk(i, { win: false, visionScore: 15 })
    );
    const newer = Array.from({ length: 5 }, (_, i) =>
      mk(100 + i, { win: true, visionScore: 30 })
    );
    const r = analyzeProgress([...older, ...newer])!;
    const vis = r.metrics.find((m) => m.key === "vision")!;
    expect(vis.improving).toBe(true);
  });

  it("drops the middle game on an odd count so windows are equal", () => {
    const rows = Array.from({ length: 11 }, (_, i) => mk(i, { win: true }));
    const r = analyzeProgress(rows)!;
    expect(r.windowGames).toBe(5);
    expect(r.totalGames).toBe(11);
  });

  it("summarizeProgressForAi lists every metric + the trend", () => {
    const older = Array.from({ length: 5 }, (_, i) =>
      mk(i, { win: false, deaths: 9 })
    );
    const newer = Array.from({ length: 5 }, (_, i) =>
      mk(100 + i, { win: true, deaths: 3 })
    );
    const r = analyzeProgress([...older, ...newer])!;
    const s = summarizeProgressForAi(r);
    expect(s).toContain("Evolución");
    expect(s).toContain("Tendencia general");
    expect(s).toContain("Muertes");
  });
});
