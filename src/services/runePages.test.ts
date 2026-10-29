import { describe, it, expect } from "vitest";
import { isLegalRunePage, opggRunesToPage, RUNE_TREES, runePageName } from "./runePages";
import { lookupPerkId } from "../data/runePerkIds";
import type { OpggRunes } from "./opggBuilds";

// Real op.gg payload for Kayn jungle (2026-10-29).
const KAYN: OpggRunes = {
  primaryPage: "Domination",
  primaryRunes: ["Dark Harvest", "Sudden Impact", "Grisly Mementos", "Treasure Hunter"],
  secondaryPage: "Inspiration",
  secondaryRunes: ["Magical Footwear", "Cosmic Insight"],
  statMods: ["5008", "5008", "5001"],
  play: 25708,
  pickRate: 0.25,
};

describe("opggRunesToPage", () => {
  it("maps names to a full 9-perk page with the Draftboard prefix", () => {
    expect(opggRunesToPage(KAYN, "Kayn JUNGLE")).toEqual({
      name: "Draftboard · Kayn JUNGLE",
      primaryStyleId: 8100,
      subStyleId: 8300,
      selectedPerkIds: [8128, 8143, 8140, 8135, 8304, 8347, 5008, 5008, 5001],
    });
  });

  it("accepts op.gg's Spanish tree and rune names", () => {
    const es = { ...KAYN, primaryPage: "Precisión", primaryRunes: ["Conquistador", "Triunfo", "Leyenda: Tenacidad", "Golpe de Gracia"] };
    expect(opggRunesToPage(es, "x")?.primaryStyleId).toBe(8000);
  });

  it("knows the newest Sorcery keystone (Deathfire Touch)", () => {
    const page = opggRunesToPage({ ...KAYN, primaryPage: "Sorcery", primaryRunes: ["Deathfire Touch", "Manaflow Band", "Transcendence", "Scorch"] }, "x");
    expect(page?.selectedPerkIds[0]).toBe(8992);
  });

  it("accepts stat shards sent by name as well as by id", () => {
    const page = opggRunesToPage({ ...KAYN, statMods: ["Adaptive Force", "5008", "Health Scaling"] }, "x");
    expect(page?.selectedPerkIds.slice(6)).toEqual([5008, 5008, 5001]);
  });

  it("returns null instead of a partial page", () => {
    expect(opggRunesToPage({ ...KAYN, primaryRunes: ["Dark Harvest", "Unknown Rune", "Grisly Mementos", "Treasure Hunter"] }, "x")).toBeNull();
    expect(opggRunesToPage({ ...KAYN, secondaryRunes: ["Magical Footwear"] }, "x")).toBeNull();
    expect(opggRunesToPage({ ...KAYN, statMods: ["5008", "abc", "5001"] }, "x")).toBeNull();
    expect(opggRunesToPage({ ...KAYN, primaryPage: "Nope" }, "x")).toBeNull();
    expect(opggRunesToPage({ ...KAYN, secondaryPage: "Domination" }, "x")).toBeNull();
  });

  it("names pages with the shared prefix", () => {
    expect(runePageName("Aatrox · Pros")).toBe("Draftboard · Aatrox · Pros");
  });
});

// Every rune name DDragon 16.21.1 ships (en_US), with its id. op.gg sends
// these names; any one missing or mismapped breaks auto-runes for every
// champion that runs it (Legend: Haste, Stormraider's Surge, Absorb Life and
// a mismapped Axiom Arcanist were all live bugs).
const DDRAGON_RUNES: [string, number][] = [["Electrocute",8112],["Dark Harvest",8128],["Hail of Blades",9923],["Cheap Shot",8126],["Taste of Blood",8139],["Sudden Impact",8143],["Sixth Sense",8137],["Grisly Mementos",8140],["Deep Ward",8141],["Treasure Hunter",8135],["Relentless Hunter",8105],["Ultimate Hunter",8106],["Glacial Augment",8351],["Unsealed Spellbook",8360],["First Strike",8369],["Hextech Flashtraption",8306],["Magical Footwear",8304],["Cash Back",8321],["Triple Tonic",8313],["Time Warp Tonic",8352],["Biscuit Delivery",8345],["Cosmic Insight",8347],["Approach Velocity",8410],["Jack Of All Trades",8316],["Press the Attack",8005],["Lethal Tempo",8008],["Fleet Footwork",8021],["Conqueror",8010],["Absorb Life",9101],["Triumph",9111],["Presence of Mind",8009],["Legend: Alacrity",9104],["Legend: Haste",9105],["Legend: Bloodline",9103],["Coup de Grace",8014],["Cut Down",8017],["Last Stand",8299],["Grasp of the Undying",8437],["Aftershock",8439],["Guardian",8465],["Demolish",8446],["Font of Life",8463],["Shield Bash",8401],["Conditioning",8429],["Second Wind",8444],["Bone Plating",8473],["Overgrowth",8451],["Revitalize",8453],["Unflinching",8242],["Summon Aery",8214],["Arcane Comet",8229],["Stormraider's Surge",8230],["Deathfire Touch",8992],["Axiom Arcanist",8224],["Manaflow Band",8226],["Nimbus Cloak",8275],["Transcendence",8210],["Celerity",8234],["Absolute Focus",8233],["Scorch",8237],["Waterwalking",8232],["Gathering Storm",8236]];

describe("rune name map vs DDragon", () => {
  it.each(DDRAGON_RUNES)("%s → %i", (name, id) => {
    expect(lookupPerkId(name)).toBe(id);
  });

  it("RUNE_TREES holds exactly the DDragon rune ids", () => {
    const treeIds = Object.values(RUNE_TREES).flat(2).sort();
    expect(treeIds).toEqual(DDRAGON_RUNES.map(([, id]) => id).sort());
  });
});

describe("isLegalRunePage", () => {
  it("rejects a secondary keystone from a third tree (the Axiom Arcanist bug)", () => {
    // Domination primary, Sorcery secondary, but 8369 is First Strike (Inspiration).
    expect(isLegalRunePage(8100, 8200, [8112, 8143, 8140, 8135, 8369, 8234])).toBe(false);
    expect(isLegalRunePage(8100, 8200, [8112, 8143, 8140, 8135, 8224, 8234])).toBe(true);
  });

  it("rejects two secondary runes from the same row", () => {
    expect(isLegalRunePage(8000, 8400, [8010, 9111, 9104, 8014, 8444, 8473])).toBe(false);
  });

  it("accepts secondaries in either row order", () => {
    expect(isLegalRunePage(8100, 8300, [8128, 8143, 8140, 8135, 8347, 8304])).toBe(true);
  });
});
