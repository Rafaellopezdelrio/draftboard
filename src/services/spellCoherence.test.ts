import { describe, it, expect } from "vitest";
import { pickCoherentSpells } from "./spellCoherence";
import type { Champion, Role } from "../types/champion";

// Minimal champion factory — only the fields pickCoherentSpells reads.
function champ(overrides: Partial<Champion> = {}): Champion {
  return {
    id: overrides.id ?? "Test",
    key: overrides.key ?? "0",
    name: overrides.name ?? "Test",
    title: "",
    iconUrl: "",
    splashUrl: "",
    tags: overrides.tags ?? [],
    roles: overrides.roles ?? ["TOP"],
    archetypes: overrides.archetypes ?? [],
  };
}

const FLASH = 4;
const SMITE = 11;
const TELEPORT = 12;
const IGNITE = 14;
const HEAL = 7;
const EXHAUST = 3;

describe("pickCoherentSpells — role sanity layer", () => {
  it("forces Flash+Smite for any JUNGLE champion regardless of op.gg pick", () => {
    const r = pickCoherentSpells(champ({ tags: ["Tank"] }), "JUNGLE" as Role, [FLASH, IGNITE]);
    expect(r.ids).toEqual([FLASH, SMITE]);
    expect(r.overrode).toBe(true);
  });

  it("doesn't mark override for JUNGLE when op.gg already had Smite", () => {
    const r = pickCoherentSpells(champ(), "JUNGLE" as Role, [FLASH, SMITE]);
    expect(r.ids).toEqual([FLASH, SMITE]);
    expect(r.overrode).toBe(false);
  });
});

describe("pickCoherentSpells — TOP heuristic", () => {
  it("splitpush archetype → Flash+TP", () => {
    const r = pickCoherentSpells(
      champ({ tags: ["Fighter"], archetypes: ["splitpush"] }),
      "TOP",
      [FLASH, IGNITE]
    );
    expect(r.ids).toEqual([FLASH, TELEPORT]);
    expect(r.overrode).toBe(true);
    expect(r.reasonKey).toBe("build.spellReason.topSplitpush");
  });

  it("tank or frontline → Flash+TP (Malphite-style)", () => {
    const r = pickCoherentSpells(
      champ({ tags: ["Tank"], archetypes: ["engage"] }),
      "TOP",
      [FLASH, IGNITE]
    );
    expect(r.ids).toEqual([FLASH, TELEPORT]);
  });

  it("assassin or burst → Flash+Ignite", () => {
    const r = pickCoherentSpells(
      champ({ tags: ["Assassin"] }),
      "TOP",
      [FLASH, TELEPORT]
    );
    expect(r.ids).toEqual([FLASH, IGNITE]);
  });

  it("plain Fighter/sustain-dps with no archetype → trust op.gg", () => {
    const r = pickCoherentSpells(
      champ({ tags: ["Fighter"], archetypes: ["sustain-dps"] }),
      "TOP",
      [FLASH, IGNITE]
    );
    expect(r.ids).toEqual([FLASH, IGNITE]);
    expect(r.overrode).toBe(false);
  });
});

describe("pickCoherentSpells — MID heuristic", () => {
  it("assassin → Flash+Ignite", () => {
    const r = pickCoherentSpells(
      champ({ tags: ["Assassin"] }),
      "MIDDLE",
      [FLASH, TELEPORT]
    );
    expect(r.ids).toEqual([FLASH, IGNITE]);
  });

  it("tank mage (Galio/Lissandra) → Flash+TP", () => {
    const r = pickCoherentSpells(
      champ({ tags: ["Tank", "Mage"], archetypes: ["engage"] }),
      "MIDDLE",
      [FLASH, IGNITE]
    );
    expect(r.ids).toEqual([FLASH, TELEPORT]);
  });
});

describe("pickCoherentSpells — UTILITY heuristic", () => {
  it("engage support → Flash+Ignite", () => {
    const r = pickCoherentSpells(
      champ({ tags: ["Tank", "Support"], archetypes: ["engage"] }),
      "UTILITY",
      [FLASH, EXHAUST]
    );
    expect(r.ids).toEqual([FLASH, IGNITE]);
  });

  it("peel support → Flash+Exhaust", () => {
    const r = pickCoherentSpells(
      champ({ tags: ["Support"], archetypes: ["peel"] }),
      "UTILITY",
      [FLASH, IGNITE]
    );
    expect(r.ids).toEqual([FLASH, EXHAUST]);
  });
});

describe("pickCoherentSpells — non-jungle never gets Smite", () => {
  it("ignores an op.gg Smite pair when no archetype rule fires", () => {
    const r = pickCoherentSpells(
      champ({ tags: ["Fighter"], archetypes: ["sustain-dps"] }),
      "TOP",
      [FLASH, SMITE]
    );
    expect(r.ids).toEqual([FLASH, TELEPORT]);
    expect(r.overrode).toBe(true);
  });

  it("marks the archetype pick as an override of a Smite pair", () => {
    const r = pickCoherentSpells(champ({ tags: ["Assassin"] }), "MIDDLE", [SMITE, IGNITE]);
    expect(r.ids).toEqual([FLASH, IGNITE]);
    expect(r.overrode).toBe(true);
  });
});

describe("pickCoherentSpells — reason", () => {
  it("is an i18n key, never display text", () => {
    const cases: Array<[Champion | undefined, Role, [number, number] | undefined]> = [
      [champ(), "JUNGLE", undefined],
      [champ({ archetypes: ["peel"] }), "UTILITY", [FLASH, IGNITE]],
      [champ({ tags: ["Fighter"] }), "TOP", [FLASH, IGNITE]],
      [undefined, "MIDDLE", undefined],
    ];
    for (const [c, role, ids] of cases) {
      expect(pickCoherentSpells(c, role, ids).reasonKey).toMatch(/^build.spellReason.[a-zA-Z]+$/);
    }
  });
});

describe("pickCoherentSpells — fallback", () => {
  it("no opgg data and no archetype signal → uses role default", () => {
    const r = pickCoherentSpells(undefined, "BOTTOM", undefined);
    expect(r.ids).toEqual([FLASH, HEAL]);
    expect(r.overrode).toBe(true);
  });

  it("no champion data at all → still safe (no crash)", () => {
    const r = pickCoherentSpells(undefined, "JUNGLE", undefined);
    expect(r.ids).toEqual([FLASH, SMITE]);
  });
});
