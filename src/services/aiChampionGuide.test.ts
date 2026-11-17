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
  const shop = ["Escudo de Doran", "Fuerza de la Trinidad", "Égida de la Legión", "Doran's Shield", "Doran's"];

  it("bolds the shop's items case-insensitively with the shop spelling", () => {
    const out = enrichGuideMarkdown("Compra ESCUDO DE DORAN y luego fuerza de la trinidad al final.", shop);
    expect(out).toContain("**Escudo de Doran**");
    expect(out).toContain("**Fuerza de la Trinidad**");
  });

  it("matches accented Spanish names and longest names first", () => {
    const out = enrichGuideMarkdown("Get a Doran's Shield, then Égida de la Legión.", shop);
    expect(out).toContain("**Doran's Shield**");
    expect(out).not.toContain("**Doran's** Shield");
    expect(out).toContain("**Égida de la Legión**");
  });

  it("does not bold an item twice and leaves removed items plain", () => {
    expect(enrichGuideMarkdown("**Escudo de Doran** primero.", shop)).toBe("**Escudo de Doran** primero.");
    expect(enrichGuideMarkdown("Crown of the Shattered Queen", shop)).toBe("Crown of the Shattered Queen");
  });
});

describe("generateChampionGuide — today's shop only", () => {
  beforeEach(() => {
    callAi.mockReset().mockResolvedValue("Compra cielo partido.");
    getDbMock.mockReset().mockResolvedValue({ select: async () => [], execute: async () => {} });
  });

  it("gives the AI the shop list in the guide's language and drops the English-names rule", async () => {
    const out = await generateChampionGuide({
      provider: "groq", apiKey: "k", championId: 1, championName: "Garen", role: "TOP",
      patch: "16.23.1", language: "es", itemNames: ["Cielo partido", "Fuerza de la naturaleza"],
    });
    const { systemPrompt, userPrompt } = callAi.mock.calls[0][0] as { systemPrompt: string; userPrompt: string };
    expect(userPrompt).toContain("OBJETOS QUE EXISTEN EN ESTE PARCHE");
    expect(userPrompt).toContain("Cielo partido; Fuerza de la naturaleza");
    expect(systemPrompt).not.toContain("Doran's Shield");
    expect(out).toBe("Compra **Cielo partido**.");
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
