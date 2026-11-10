import { describe, it, expect, vi, beforeEach } from "vitest";

const getDbMock = vi.fn();
let tauri = true;
vi.mock("../db/client", () => ({
  isTauri: () => tauri,
  getDb: () => getDbMock(),
}));
const callAi = vi.fn();
vi.mock("./aiProvider", () => ({
  callAi: (...a: unknown[]) => callAi(...a),
}));

import {
  enrichGuideMarkdown,
  generateChampionGuide,
  getCachedGuide,
  guideCacheKey,
} from "./aiChampionGuide";

describe("enrichGuideMarkdown — ability names", () => {
  it("wraps ALL CAPS ability + (E) into bold Title Case", () => {
    const out = enrichGuideMarkdown("GROUND SLAM (E) hace daño AOE.");
    expect(out).toContain("**Ground Slam (E)**");
  });

  it("handles Q/W/E/R/P keys", () => {
    const out = enrichGuideMarkdown(
      "UNCHAINED FURY (R) y PERFECT TIMING (P)."
    );
    expect(out).toContain("**Unchained Fury (R)**");
    expect(out).toContain("**Perfect Timing (P)**");
  });

  it("does not double-wrap when called twice (idempotent on ability names)", () => {
    const once = enrichGuideMarkdown("GROUND SLAM (E)");
    const twice = enrichGuideMarkdown(once);
    expect(twice).toBe(once);
  });

  it("handles apostrophes in ability names (D'Oh)", () => {
    const out = enrichGuideMarkdown("D'OH MOMENT (Q)");
    expect(out).toContain("**D'Oh Moment (Q)**");
  });
});

describe("enrichGuideMarkdown — item names", () => {
  it("bolds known items case-insensitively and canonicalises casing", () => {
    const out = enrichGuideMarkdown(
      "Compra DORAN'S SHIELD y luego trinity force al final."
    );
    expect(out).toContain("**Doran's Shield**");
    expect(out).toContain("**Trinity Force**");
  });

  it("matches longest item names first (Doran's Shield, not Doran's)", () => {
    const out = enrichGuideMarkdown("Get a Doran's Shield in lane.");
    // Should bold the full 'Doran's Shield', not split.
    expect(out).toContain("**Doran's Shield**");
    expect(out).not.toContain("**Doran's** Shield");
  });
});

describe("enrichGuideMarkdown — section headers", () => {
  it("converts '1. Win condition:' into '## Win condition'", () => {
    const out = enrichGuideMarkdown("1. Win condition:\nbody text");
    expect(out).toContain("## Win condition");
  });

  it("leaves inline numbering inside paragraphs alone", () => {
    const out = enrichGuideMarkdown("En el nivel 6 sube Q a max.");
    expect(out).not.toContain("##");
  });
});

describe("guide cache — keyed by role and language", () => {
  beforeEach(() => {
    tauri = true;
    callAi.mockReset();
    // Tiny in-memory table keyed like the real one: (champion_id, patch).
    const rows = new Map<string, { champion_id: number; patch: string; guide_text: string; generated_ts_ms: number }>();
    getDbMock.mockReset().mockResolvedValue({
      select: async (_sql: string, [id, patch]: [number, string]) => {
        const r = rows.get(`${id}/${patch}`);
        return r ? [r] : [];
      },
      execute: async (_sql: string, [id, patch, text, ts]: [number, string, string, number]) => {
        rows.set(`${id}/${patch}`, { champion_id: id, patch, guide_text: text, generated_ts_ms: ts });
      },
    });
  });

  const base = {
    provider: "groq" as const,
    apiKey: "k",
    championId: 555,
    championName: "Pyke",
    patch: "16.10.1",
  };

  it("guideCacheKey separates roles and languages, and stays the plain patch without a role", () => {
    expect(guideCacheKey("16.10.1")).toBe("16.10.1");
    const keys = [
      guideCacheKey("16.10.1", "UTILITY", "es"),
      guideCacheKey("16.10.1", "MIDDLE", "es"),
      guideCacheKey("16.10.1", "UTILITY", "en"),
    ];
    expect(new Set(keys).size).toBe(3);
    // No language given means Spanish, like the prompt.
    expect(guideCacheKey("16.10.1", "UTILITY")).toBe(keys[0]);
  });

  it("a cached UTILITY guide is not served for MIDDLE nor for another language", async () => {
    callAi.mockResolvedValueOnce("guia support");
    expect(await generateChampionGuide({ ...base, role: "UTILITY", language: "es" })).toBe("guia support");

    callAi.mockResolvedValueOnce("guia mid");
    expect(await generateChampionGuide({ ...base, role: "MIDDLE", language: "es" })).toBe("guia mid");
    callAi.mockResolvedValueOnce("support guide");
    expect(await generateChampionGuide({ ...base, role: "UTILITY", language: "en" })).toBe("support guide");
    expect(callAi).toHaveBeenCalledTimes(3);

    // Each one is cached on its own: no further AI calls, nothing overwritten.
    expect(await generateChampionGuide({ ...base, role: "UTILITY", language: "es" })).toBe("guia support");
    expect(await generateChampionGuide({ ...base, role: "MIDDLE", language: "es" })).toBe("guia mid");
    expect(callAi).toHaveBeenCalledTimes(3);
    const cached = await getCachedGuide(555, "16.10.1", "UTILITY", "en");
    expect(cached).toMatchObject({ patch: "16.10.1", guideText: "support guide" });
    expect(await getCachedGuide(555, "16.10.1", "JUNGLE", "es")).toBeNull();
  });
});
