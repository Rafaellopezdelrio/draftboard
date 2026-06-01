import { describe, it, expect } from "vitest";
import { parseTips, buildTipsPrompts } from "./championTips";

describe("parseTips", () => {
  it("strips numbering/bullets and blank lines", () => {
    const raw = "1. Sube Q primero\n- Wardea river a 2:30\n\n• All-in nivel 6\n";
    expect(parseTips(raw)).toEqual([
      "Sube Q primero",
      "Wardea river a 2:30",
      "All-in nivel 6",
    ]);
  });

  it("caps at 5 tips and drops over-long lines (likely prose, not a tip)", () => {
    expect(parseTips(["a", "b", "c", "d", "e", "f"].join("\n"))).toHaveLength(5);
    expect(parseTips("x".repeat(200))).toEqual([]);
  });
});

describe("buildTipsPrompts", () => {
  it("grounds the user prompt in champion + role + patch", () => {
    const { user } = buildTipsPrompts("Lee Sin", "JUNGLE", "16.11", "es");
    expect(user).toContain("Lee Sin");
    expect(user).toContain("JUNGLE");
    expect(user).toContain("16.11");
  });

  it("respects language", () => {
    expect(buildTipsPrompts("Ahri", "MIDDLE", "16.11", "en").system).toMatch(/pro League/i);
    expect(buildTipsPrompts("Ahri", "MIDDLE", "16.11", "es").system).toMatch(/coach pro/i);
  });
});
