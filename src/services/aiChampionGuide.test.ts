import { describe, it, expect } from "vitest";
import { enrichGuideMarkdown } from "./aiChampionGuide";

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
