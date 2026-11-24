import { describe, it, expect } from "vitest";
import type { Archetype } from "../types/champion";
import { fitsStyle, isTeamParty, orderByStyle, orderForTeam, suggestStyle } from "./teamStyle";

const c = (...archetypes: Archetype[]) => ({ archetypes });
const party = (size: number, gameMode: string | null = "CLASSIC") => ({ size, gameMode, summonerIds: [] });

describe("isTeamParty", () => {
  it("five in the lobby on Summoner's Rift (Flex, Clash, normal draft, customs)", () => {
    expect(isTeamParty(party(5))).toBe(true);
    expect(isTeamParty(party(5, null))).toBe(true);
  });
  it("not solo, duo or a trio, not ARAM or Arena, not unknown", () => {
    for (const size of [1, 2, 3, 4]) expect(isTeamParty(party(size))).toBe(false);
    expect(isTeamParty(party(5, "ARAM"))).toBe(false);
    expect(isTeamParty(party(5, "CHERRY"))).toBe(false);
    expect(isTeamParty(null)).toBe(false);
  });
});

describe("fitsStyle", () => {
  it("matches by champion kind", () => {
    expect(fitsStyle(c("engage"), "engage")).toBe(true);
    expect(fitsStyle(c("frontline"), "engage")).toBe(true);
    expect(fitsStyle(c("poke"), "engage")).toBe(false);
    expect(fitsStyle(c("peel"), "protect")).toBe(true);
    expect(fitsStyle(c("splitpush"), "split")).toBe(true);
    expect(fitsStyle(undefined, "pick")).toBe(false);
  });
});

describe("orderByStyle", () => {
  const list = [
    { id: "a", champion: c("poke") },
    { id: "b", champion: c("engage") },
    { id: "c", champion: c("burst") },
    { id: "d", champion: c("frontline") },
  ];
  const ids = (l: typeof list) => l.map((x) => x.id).join("");

  it("puts the picks that fit first, each group keeping its order", () => {
    expect(ids(orderByStyle(list, "engage"))).toBe("bdac");
    expect(ids(orderByStyle(list, "pick"))).toBe("cabd");
  });
  it("no style, or nothing / everything fits: unchanged", () => {
    expect(orderByStyle(list, null)).toBe(list);
    expect(orderByStyle(list, "split")).toBe(list);
    expect(orderByStyle([list[1], list[3]], "engage")).toEqual([list[1], list[3]]);
  });
});

describe("orderForTeam", () => {
  const s = (id: string, kinds: Archetype[], winRate?: number) => ({
    id,
    champion: c(...kinds),
    breakdown: { lane: winRate == null ? null : { winRate } },
  });
  const ids = (l: Array<{ id: string }>) => l.map((x) => x.id).join("");

  it("before the lane rival picks: just the style first", () => {
    const list = [s("a", ["poke"]), s("b", ["engage"])];
    expect(ids(orderForTeam(list, "engage"))).toBe("ba");
  });

  it("once they picked: what fits AND beats them leads, the rest keeps its order", () => {
    // a: fits, loses · b: no fit, wins · c: fits, wins · d: no fit, loses
    const list = [s("a", ["engage"], 0.46), s("b", ["poke"], 0.56), s("c", ["frontline"], 0.53), s("d", ["burst"], 0.44)];
    expect(ids(orderForTeam(list, "engage"))).toBe("cabd");
  });

  it("no style: unchanged", () => {
    const list = [s("a", ["poke"], 0.4), s("b", ["engage"], 0.6)];
    expect(orderForTeam(list, null)).toBe(list);
  });
});

describe("suggestStyle", () => {
  it("the style most players can play", () => {
    const pools = [[c("engage")], [c("frontline"), c("poke")], [c("poke")], [c("poke"), c("peel")], [c("burst")]];
    expect(suggestStyle(pools)).toBe("poke");
  });
  it("ties go to the plan easiest to agree on (engage first)", () => {
    expect(suggestStyle([[c("engage")], [c("poke")]])).toBe("engage");
  });
  it("needs at least two players with known champions", () => {
    expect(suggestStyle([[c("engage")], [], []])).toBeNull();
    expect(suggestStyle([])).toBeNull();
  });
});
