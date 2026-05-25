import { describe, it, expect } from "vitest";
import { findMatchup, ddIdToOpggKey, type OpggMatchup } from "./opggMatchups";

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

  it("maps MonkeyKing to wukong (op.gg renames)", () => {
    expect(ddIdToOpggKey("MonkeyKing")).toBe("wukong");
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
