import { describe, it, expect } from "vitest";
import { buildItemSetTitle } from "./autoActions";

// Naming-convention guard: the item set pushed to the LCU MUST start
// with "Draftboard" so users can identify ours in the in-game shop vs
// sets from Blitz / op.gg desktop / etc. This pin prevents silent
// rename refactors that would break user recognition.

describe("buildItemSetTitle — locked naming convention", () => {
  it("starts with 'Draftboard'", () => {
    expect(buildItemSetTitle("Aatrox").startsWith("Draftboard")).toBe(true);
  });

  it("contains the full champion name", () => {
    expect(buildItemSetTitle("Aatrox")).toContain("Aatrox");
    expect(buildItemSetTitle("Lee Sin")).toContain("Lee Sin");
    expect(buildItemSetTitle("Kai'Sa")).toContain("Kai'Sa");
  });

  it("uses the exact 'Draftboard - {Champion}' format", () => {
    expect(buildItemSetTitle("Aatrox")).toBe("Draftboard - Aatrox");
  });

  it("does not include role / patch / extras", () => {
    // Extras would shift the format — keep titles short so LoL's shop
    // sidebar (which truncates ~25 chars) shows the champion clearly.
    const title = buildItemSetTitle("Aatrox");
    expect(title).not.toMatch(/TOP|JUNGLE|MIDDLE|BOTTOM|UTILITY/);
    expect(title.length).toBeLessThanOrEqual(40);
  });
});
