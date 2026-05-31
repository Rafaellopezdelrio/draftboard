import { describe, it, expect } from "vitest";
import {
  findMatchup,
  ddIdToOpggKey,
  opggTierForRank,
  type OpggMatchup,
} from "./opggMatchups";

function matchup(key: string, name: string, wr = 50, play = 1000): OpggMatchup {
  return {
    championKey: key,
    championName: name,
    play,
    win: Math.round(play * (wr / 100)),
    winRate: wr,
  };
}

describe("ddIdToOpggKey", () => {
  it("lowercases plain names", () => {
    expect(ddIdToOpggKey("Aatrox")).toBe("aatrox");
    expect(ddIdToOpggKey("Ahri")).toBe("ahri");
  });

  it("maps MonkeyKing to monkeyking (op.gg uses the internal id, not 'wukong')", () => {
    // op.gg's counter page lives at /champions/monkeyking/... — /wukong 404s,
    // so the inverted mapping silently returned 0 matchups for Wukong.
    expect(ddIdToOpggKey("MonkeyKing")).toBe("monkeyking");
  });

  it("handles K'Sante / Kai'Sa / Bel'Veth without apostrophes", () => {
    expect(ddIdToOpggKey("KSante")).toBe("ksante");
    expect(ddIdToOpggKey("Kaisa")).toBe("kaisa");
    expect(ddIdToOpggKey("Belveth")).toBe("belveth");
  });

  it("preserves valid lowercase keys (already op.gg form)", () => {
    expect(ddIdToOpggKey("LeeSin")).toBe("leesin");
    expect(ddIdToOpggKey("MissFortune")).toBe("missfortune");
  });
});

describe("opggTierForRank", () => {
  it("maps each tier to its op.gg _plus bracket", () => {
    expect(opggTierForRank("GOLD")).toBe("gold_plus");
    expect(opggTierForRank("PLATINUM")).toBe("platinum_plus");
    expect(opggTierForRank("EMERALD")).toBe("emerald_plus");
    expect(opggTierForRank("DIAMOND")).toBe("diamond_plus");
  });

  it("floors iron/bronze/silver at silver_plus (no _plus bucket below it)", () => {
    expect(opggTierForRank("IRON")).toBe("silver_plus");
    expect(opggTierForRank("BRONZE")).toBe("silver_plus");
    expect(opggTierForRank("SILVER")).toBe("silver_plus");
  });

  it("caps master+ at diamond_plus (higher brackets thin out + get noisy)", () => {
    expect(opggTierForRank("MASTER")).toBe("diamond_plus");
    expect(opggTierForRank("GRANDMASTER")).toBe("diamond_plus");
    expect(opggTierForRank("CHALLENGER")).toBe("diamond_plus");
  });

  it("defaults unranked/null/unknown to emerald_plus", () => {
    expect(opggTierForRank(null)).toBe("emerald_plus");
    expect(opggTierForRank(undefined)).toBe("emerald_plus");
    expect(opggTierForRank("UNRANKED")).toBe("emerald_plus");
    expect(opggTierForRank("")).toBe("emerald_plus");
  });

  it("is case- and division-tolerant", () => {
    expect(opggTierForRank("gold")).toBe("gold_plus");
    expect(opggTierForRank("Diamond II")).toBe("diamond_plus");
  });
});

describe("findMatchup", () => {
  const list = [
    matchup("aatrox", "Aatrox", 47, 800),
    matchup("camille", "Camille", 53, 1200),
    matchup("teemo", "Teemo", 45, 600),
  ];

  it("finds by exact key", () => {
    expect(findMatchup(list, "camille")?.championName).toBe("Camille");
  });

  it("matches case-insensitively", () => {
    expect(findMatchup(list, "CAMILLE")?.championName).toBe("Camille");
    expect(findMatchup(list, "Aatrox")?.championName).toBe("Aatrox");
  });

  it("returns null for unknown champion", () => {
    expect(findMatchup(list, "nobody")).toBeNull();
  });

  it("returns null on empty list", () => {
    expect(findMatchup([], "aatrox")).toBeNull();
  });
});
