import { describe, it, expect } from "vitest";
import { riotIdLookalikes } from "./riotIdLookalikes";

describe("riotIdLookalikes", () => {
  it("offers the real spelling when a Greek Nu was typed for a Latin N", () => {
    // Real case: the account is ÐΛΣRΣN (Latin N); the user typed Greek Ν.
    const typed = "ÐΛΣRΣΝ";
    expect(riotIdLookalikes(typed)[0]).toBe("ÐΛΣRΣN");
  });

  it("offers the Greek spelling when a Latin letter was typed in a Greek name", () => {
    expect(riotIdLookalikes("ΣΛN")).toContain("ΣΛΝ");
  });

  it("plain Latin names get single-letter swaps only, never themselves", () => {
    const v = riotIdLookalikes("Caps");
    expect(v).not.toContain("Caps");
    expect(v.length).toBeLessThanOrEqual(6);
  });

  it("nothing to try when no letter has a lookalike", () => {
    expect(riotIdLookalikes("ÐΛΣ")).toEqual([]);
    expect(riotIdLookalikes("")).toEqual([]);
  });

  it("is capped", () => {
    expect(riotIdLookalikes("ABEZHIKMNOPTYX").length).toBeLessThanOrEqual(6);
  });
});
