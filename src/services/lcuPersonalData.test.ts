import { describe, it, expect } from "vitest";
import { inferPosition } from "./lcuPersonalData";

// Build a minimal participant shape matching the LCU response
function p(opts: {
  teamPosition?: string;
  smite?: boolean;
  jungleCS?: number;
  laneCS?: number;
  lane?: string;
  role?: string;
}) {
  const SMITE = 11;
  return {
    stats: {
      teamPosition: opts.teamPosition ?? "",
      neutralMinionsKilled: opts.jungleCS ?? 0,
      totalMinionsKilled: opts.laneCS ?? 0,
    },
    spell1Id: opts.smite ? SMITE : 4,
    spell2Id: 14,
    timeline: { lane: opts.lane, role: opts.role },
  } as never;
}

describe("inferPosition (Renekton-junglae bug regression)", () => {
  it("trusts teamPosition when present (modern matches)", () => {
    expect(inferPosition(p({ teamPosition: "TOP" }), 420)).toBe("TOP");
    expect(inferPosition(p({ teamPosition: "JUNGLE" }), 420)).toBe("JUNGLE");
    expect(inferPosition(p({ teamPosition: "MIDDLE" }), 420)).toBe("MIDDLE");
    expect(inferPosition(p({ teamPosition: "BOTTOM" }), 420)).toBe("BOTTOM");
    expect(inferPosition(p({ teamPosition: "UTILITY" }), 420)).toBe("UTILITY");
  });

  it("ARAM (queue 450) returns empty position", () => {
    expect(inferPosition(p({ teamPosition: "MIDDLE" }), 450)).toBe("");
  });

  it("smite override: legacy lane=JUNGLE but no smite is REJECTED (Renekton bug fix)", () => {
    // The original bug: LCU said lane=JUNGLE for a Renekton TOP game.
    // Without smite, we now refuse to classify as JUNGLE.
    expect(
      inferPosition(p({ lane: "JUNGLE", smite: false, laneCS: 180 }), 420)
    ).toBe("");
  });

  it("smite + jungle CS = JUNGLE (authoritative)", () => {
    expect(
      inferPosition(p({ smite: true, jungleCS: 80, laneCS: 30 }), 420)
    ).toBe("JUNGLE");
  });

  it("smite alone = JUNGLE intent (early game / smite player)", () => {
    expect(
      inferPosition(p({ smite: true, jungleCS: 10, laneCS: 20 }), 420)
    ).toBe("JUNGLE");
  });

  it("high jungle CS + low lane CS without smite = JUNGLE (off-meta)", () => {
    expect(
      inferPosition(p({ jungleCS: 60, laneCS: 40 }), 420)
    ).toBe("JUNGLE");
  });

  it("legacy lane fallback maps MID alias to MIDDLE", () => {
    expect(inferPosition(p({ lane: "MID", laneCS: 150 }), 420)).toBe("MIDDLE");
    expect(inferPosition(p({ lane: "MIDDLE", laneCS: 150 }), 420)).toBe("MIDDLE");
  });

  it("legacy lane=BOTTOM with role=DUO_SUPPORT → UTILITY", () => {
    expect(
      inferPosition(p({ lane: "BOTTOM", role: "DUO_SUPPORT", laneCS: 50 }), 420)
    ).toBe("UTILITY");
  });

  it("legacy lane=BOTTOM with role=DUO_CARRY → BOTTOM", () => {
    expect(
      inferPosition(p({ lane: "BOTTOM", role: "DUO_CARRY", laneCS: 200 }), 420)
    ).toBe("BOTTOM");
  });

  it("very low CS in both lane and jungle suggests UTILITY (support last-resort)", () => {
    expect(inferPosition(p({ laneCS: 30, jungleCS: 5 }), 420)).toBe("UTILITY");
  });

  it("returns empty string for unknowable cases (refuses to guess)", () => {
    expect(inferPosition(p({ lane: "NONE", laneCS: 100 }), 420)).toBe("");
  });
});
