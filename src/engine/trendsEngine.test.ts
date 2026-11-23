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
    const wr = trends.find((t) => t.metric === "Victorias");
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
    const wr = trends.find((t) => t.metric === "Victorias");
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
    const cspm = trends.find((t) => t.metric === "Súbditos por minuto");
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

  it("uses a lower CS/min bar for junglers (5.2 is fine, 4 is not)", () => {
    // 156 cs / 30 min = 5.2 cs/min — a normal Gold jungler.
    const ok = Array(5).fill(0).map(() =>
      match({ cs: 156, kills: 8, deaths: 3, assists: 7, position: "JUNGLE" })
    );
    expect(detectWeakestArea(ok)).toBeNull();
    const low = Array(5).fill(0).map(() =>
      match({ cs: 120, kills: 8, deaths: 3, assists: 7, position: "JUNGLE" })
    );
    expect(detectWeakestArea(low)?.category).toBe("Farming");
  });
});

describe("trends texts in English", () => {
  it("trends, weakest area, progress and rank benchmarks read in English", async () => {
    const { i18n } = await import("../i18n");
    const enBundle = (await import("../i18n/locales/en.json")).default;
    const { analyzeProgress } = await import("./progressEngine");
    const { benchmarkStats, bracketLabel } = await import("./rankBenchmarks");
    i18n.addResourceBundle("en", "translation", enBundle, true, true);
    await i18n.changeLanguage("en");
    try {
      // 12 games: the newer six die a lot more and farm less than the older six.
      const games = Array.from({ length: 12 }, (_, i) =>
        match({
          win: i >= 6,
          deaths: i < 6 ? 9 : 2,
          cs: i < 6 ? 90 : 220,
          gameEndTimestampMs: 1_000 + i,
        })
      );
      const texts: string[] = [];
      for (const tr of computeTrends(games)) texts.push(tr.metric, tr.insight);
      const weak = detectWeakestArea(games);
      if (weak) texts.push(weak.category, weak.detail);
      const progress = analyzeProgress(games);
      if (progress) texts.push(progress.headline, ...progress.metrics.map((m) => m.label));
      for (const b of benchmarkStats({ bracket: "gold-plat", role: "MIDDLE", cspm: 5, vspm: 1, dpm: 0.2, kda: 2 }))
        texts.push(b.label);
      texts.push(bracketLabel("master-plus"));

      expect(texts.length).toBeGreaterThan(10);
      for (const text of texts) expect(text).not.toMatch(/trends\.|[áéíóúñ]|antes|partidas|Muertes|Victorias/);
      expect(texts).toContain("Wins");
      expect(bracketLabel("master-plus")).toBe("Master or higher");
    } finally {
      await i18n.changeLanguage("es");
    }
  });
});
