import { describe, it, expect } from "vitest";
import { splitRiotId } from "./riotId";

describe("splitRiotId", () => {
  it("keeps a clean name and tag", () => {
    expect(splitRiotId("ÐΛΣRΣN", "EUW")).toEqual({ gameName: "ÐΛΣRΣN", tagLine: "EUW" });
  });
  it("splits a whole Riot ID typed into the name box", () => {
    expect(splitRiotId("Faker#KR1", "")).toEqual({ gameName: "Faker", tagLine: "KR1" });
    expect(splitRiotId(" Hide on bush # KR1 ", "EUW")).toEqual({ gameName: "Hide on bush", tagLine: "KR1" });
  });
  it("drops a # typed in front of the tag and stray spaces", () => {
    expect(splitRiotId(" Caps ", " #EUW ")).toEqual({ gameName: "Caps", tagLine: "EUW" });
  });
  it("falls back to the tag box when the name ends in #", () => {
    expect(splitRiotId("Caps#", "EUW")).toEqual({ gameName: "Caps", tagLine: "EUW" });
  });
});
