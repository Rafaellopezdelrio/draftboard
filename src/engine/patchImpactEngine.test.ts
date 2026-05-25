// Tests the "did the latest patch hit any of your mains?" engine.
// Powers PatchImpactPanel ("Tu Vayne fue nerfeada esta semana").

import { describe, it, expect, beforeEach } from "vitest";
import { analyzePatchImpact, setPatchNotes } from "./patchImpactEngine";
import type { ChampionDb } from "../types/champion";
import type { ChampionMasteryDto } from "../services/riotApi";

const mkDb = (
  champs: Array<{ id: string; key: string; name?: string }>
): ChampionDb => ({
  patch: "26.10",
  champions: Object.fromEntries(
    champs.map((c) => [
      c.key,
      {
        id: c.id,
        key: c.key,
        name: c.name ?? c.id,
        title: "",
        iconUrl: `icon/${c.id}.png`,
        splashUrl: "",
        tags: [],
        roles: [],
        archetypes: [],
      },
    ])
  ),
  counters: [],
  meta: [],
  fetchedAt: 0,
});

const mkMastery = (championId: number): ChampionMasteryDto => ({
  championId,
  championPoints: 100_000,
  championLevel: 7,
  lastPlayTime: 0,
});

describe("analyzePatchImpact", () => {
  beforeEach(() => {
    setPatchNotes([]); // reset global between tests
  });

  it("empty masteries -> no output", () => {
    const out = analyzePatchImpact({
      db: mkDb([{ id: "Aatrox", key: "266" }]),
      masteries: [],
      patchNotes: [{ championId: "Aatrox", type: "buff", notes: "Q damage up" }],
    });
    expect(out).toEqual([]);
  });

  it("empty patch notes -> no output (no notes -> nothing to flag)", () => {
    const out = analyzePatchImpact({
      db: mkDb([{ id: "Aatrox", key: "266" }]),
      masteries: [mkMastery(266)],
      patchNotes: [],
    });
    expect(out).toEqual([]);
  });

  it("flags a main when patch notes mention them (buff)", () => {
    const out = analyzePatchImpact({
      db: mkDb([{ id: "Aatrox", key: "266" }]),
      masteries: [mkMastery(266)],
      patchNotes: [{ championId: "Aatrox", type: "buff", notes: "Q damage up" }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].change).toBe("buff");
    expect(out[0].championId).toBe(266);
    expect(out[0].championName).toBe("Aatrox");
    expect(out[0].iconUrl).toBe("icon/Aatrox.png");
  });

  it("ignores patch notes for champions NOT in user's masteries", () => {
    const out = analyzePatchImpact({
      db: mkDb([
        { id: "Aatrox", key: "266" },
        { id: "Ahri", key: "103" },
      ]),
      masteries: [mkMastery(266)], // only Aatrox is a main
      patchNotes: [
        { championId: "Aatrox", type: "buff", notes: "Q up" },
        { championId: "Ahri", type: "nerf", notes: "W down" },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].championId).toBe(266);
  });

  it("only checks top 10 masteries (champ pool cap)", () => {
    // 12 champs mastered, only first 10 should be in the lookup set.
    const champs = Array.from({ length: 12 }, (_, i) => ({
      id: `C${i}`,
      key: String(100 + i),
    }));
    const out = analyzePatchImpact({
      db: mkDb(champs),
      masteries: champs.map((c) => mkMastery(Number(c.key))),
      patchNotes: [
        { championId: "C10", type: "buff", notes: "buff" }, // 11th — should be excluded
        { championId: "C11", type: "nerf", notes: "nerf" }, // 12th — should be excluded
        { championId: "C0", type: "buff", notes: "buff" }, // 1st — included
      ],
    });
    expect(out.map((p) => p.championName)).toEqual(["C0"]);
  });

  it("rework type marked as high importance, buff/nerf as medium", () => {
    const out = analyzePatchImpact({
      db: mkDb([
        { id: "Aatrox", key: "266" },
        { id: "Ahri", key: "103" },
        { id: "Akali", key: "84" },
      ]),
      masteries: [mkMastery(266), mkMastery(103), mkMastery(84)],
      patchNotes: [
        { championId: "Aatrox", type: "rework", notes: "ult redesigned" },
        { championId: "Ahri", type: "buff", notes: "Q dmg" },
        { championId: "Akali", type: "nerf", notes: "shroud range" },
      ],
    });
    const aatrox = out.find((o) => o.championName === "Aatrox");
    const ahri = out.find((o) => o.championName === "Ahri");
    const akali = out.find((o) => o.championName === "Akali");
    expect(aatrox?.importance).toBe("high");
    expect(ahri?.importance).toBe("medium");
    expect(akali?.importance).toBe("medium");
  });

  it("uses setPatchNotes() as the default source when none provided", () => {
    setPatchNotes([
      { championId: "Aatrox", type: "buff", notes: "via setter" },
    ]);
    const out = analyzePatchImpact({
      db: mkDb([{ id: "Aatrox", key: "266" }]),
      masteries: [mkMastery(266)],
      // No patchNotes arg → falls back to CURRENT_PATCH_NOTES module global
    });
    expect(out).toHaveLength(1);
    expect(out[0].detail).toBe("via setter");
  });

  it("missing champion in db -> note skipped silently (defensive)", () => {
    const out = analyzePatchImpact({
      db: mkDb([{ id: "Aatrox", key: "266" }]),
      masteries: [mkMastery(266)],
      patchNotes: [
        { championId: "Aatrox", type: "buff", notes: "ok" },
        { championId: "Mythical", type: "buff", notes: "missing from db" },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].championName).toBe("Aatrox");
  });

  it("detail field is carried through to the UI item verbatim", () => {
    const out = analyzePatchImpact({
      db: mkDb([{ id: "Aatrox", key: "266" }]),
      masteries: [mkMastery(266)],
      patchNotes: [
        { championId: "Aatrox", type: "buff", notes: "Q ratio 0.6 → 0.75" },
      ],
    });
    expect(out[0].detail).toBe("Q ratio 0.6 → 0.75");
  });
});
