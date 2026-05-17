import { describe, it, expect } from "vitest";
import { parseOpggResponse } from "./opggMeta";

// Real op.gg MCP format: Positions(top[],mid[],jungle[],adc[],support[])
const SAMPLE_RESPONSE = `LolListLaneMetaChampions("en_US","all",Data(Positions([Top("Malphite",false,588057,306122,2605126,0.52,0.07,0.8,0.19,2.47,1,1,1,2),Top("Teemo",false,500620,262866,2675068,0.53,0.06,0.75,0.07,1.59,1,2,2,4),Top("Garen",false,580126,299762,4014946,0.52,0.07,0.93,0.07,1.86,1,3,3,1),Top("Renekton",false,150000,75000,800000,0.5,0.04,0.6,0.05,1.8,2,5,4,3),Top("WeakChamp",false,10000,4500,30000,0.45,0.01,0.2,0.0,1.0,5,30,30,30)],[Top("Yasuo",false,800000,400000,5000000,0.5,0.1,0.9,0.15,2.0,2,4,3,2)],[],[],[])))`;

describe("parseOpggResponse — regression for 'only 3 S-tier' bug", () => {
  it("parses multiple S-tier entries from the TOP section (mobalytics-calibrated)", () => {
    // Tier 1 (Malphite, Teemo, Garen) AND tier 2 (Renekton) all map to S now,
    // matching Mobalytics' broader S-tier distribution.
    const result = parseOpggResponse(SAMPLE_RESPONSE, "TOP");
    const sTier = result.filter((m) => m.tier === "S");
    expect(sTier.length).toBe(4); // Malphite, Teemo, Garen, Renekton (tier 1 + tier 2)
    const names = sTier.map((m) => m.championKey);
    expect(names).toContain("Malphite");
    expect(names).toContain("Teemo");
    expect(names).toContain("Garen");
    expect(names).toContain("Renekton");
  });

  it("classifies tier 0/1/2 = S, tier 3 = A, tier 5 = C (matches Mobalytics)", () => {
    // SAMPLE: Renekton has tier=2 (top-A) → should be S in our broader scale.
    // WeakChamp has tier=5 → mapped to C (was D before mobalytics-calibration).
    const result = parseOpggResponse(SAMPLE_RESPONSE, "TOP");
    expect(result.find((m) => m.championKey === "Malphite")?.tier).toBe("S");
    expect(result.find((m) => m.championKey === "Renekton")?.tier).toBe("S");
    expect(result.find((m) => m.championKey === "WeakChamp")?.tier).toBe("C");
  });

  it("extracts winRate, pickRate, banRate as fractions (0-1 scale)", () => {
    const result = parseOpggResponse(SAMPLE_RESPONSE, "TOP");
    const malph = result.find((m) => m.championKey === "Malphite");
    expect(malph?.winRate).toBeCloseTo(0.52);
    expect(malph?.pickRate).toBeCloseTo(0.07);
    expect(malph?.banRate).toBeCloseTo(0.19);
  });

  it("parses MID role (different section name)", () => {
    const result = parseOpggResponse(SAMPLE_RESPONSE, "MIDDLE");
    expect(result.length).toBe(1);
    expect(result[0].championKey).toBe("Yasuo");
    expect(result[0].role).toBe("MIDDLE");
  });

  it("returns empty array for roles with no data", () => {
    expect(parseOpggResponse(SAMPLE_RESPONSE, "JUNGLE")).toEqual([]);
    expect(parseOpggResponse(SAMPLE_RESPONSE, "BOTTOM")).toEqual([]);
    expect(parseOpggResponse(SAMPLE_RESPONSE, "UTILITY")).toEqual([]);
  });

  it("gracefully handles unparseable text", () => {
    expect(parseOpggResponse("not the expected format", "TOP")).toEqual([]);
    expect(parseOpggResponse("", "TOP")).toEqual([]);
  });

  it("regression: tier 0 (OP / S+ in op.gg) maps to S, not D (Smolder bug)", () => {
    // Smolder is broken in op.gg data: 55% WR, 25% PR, 48% BR, rank #1.
    // op.gg uses tier 0 (= OP/S+) for him. Old mapping fell to D as default.
    const response = `LolListLaneMetaChampions("en_US","all",Data(Positions([],[],[],[Top("Smolder",false,3326439,1834658,25951577,0.55,0.25,0.92,0.48,2.52,0,1,1,1)],[])))`;
    const result = parseOpggResponse(response, "BOTTOM");
    expect(result.length).toBe(1);
    expect(result[0].championKey).toBe("Smolder");
    expect(result[0].tier).toBe("S"); // NOT D
  });
});
