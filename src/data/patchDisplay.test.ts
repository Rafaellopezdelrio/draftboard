import { describe, it, expect } from "vitest";
import { displayPatch } from "./patchDisplay";

describe("displayPatch — DDragon season number → Riot year display", () => {
  it("16.10 → 26.10", () => {
    expect(displayPatch("16.10")).toBe("26.10");
  });

  it("16.10.1 (with build suffix) → 26.10", () => {
    expect(displayPatch("16.10.1")).toBe("26.10");
  });

  it("15.24 → 25.24 (end of 2025)", () => {
    expect(displayPatch("15.24")).toBe("25.24");
  });

  it("14.1 → 24.1 (start of 2024 — the shift point)", () => {
    expect(displayPatch("14.1")).toBe("24.1");
  });

  it("13.x stays as-is (predates the year-shift era)", () => {
    expect(displayPatch("13.24")).toBe("13.24");
  });

  it("malformed input passes through (defensive)", () => {
    expect(displayPatch("")).toBe("");
    expect(displayPatch("foo")).toBe("foo");
    expect(displayPatch("16")).toBe("16");
  });
});
