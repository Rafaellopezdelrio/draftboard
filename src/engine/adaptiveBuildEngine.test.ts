// Tests for the enemy-comp profiler + build adaptation engine. These pin
// down the heuristics that drive BuildPanel's "vs this comp build X" hints.
// A wrong threshold here = users buy wrong items vs their actual matchup.

import { describe, it, expect } from "vitest";
import {
  profileEnemyComp,
  suggestBuildAdaptations,
} from "./adaptiveBuildEngine";
import type { Champion, ChampionDb } from "../types/champion";

const mkChamp = (over: Partial<Champion> & Pick<Champion, "id" | "key" | "tags">): Champion => ({
  name: over.id,
  title: "",
  iconUrl: "",
  splashUrl: "",
  roles: [],
  archetypes: [],
  ...over,
});

const mkDb = (champs: Champion[]): ChampionDb => ({
  patch: "26.10",
  champions: Object.fromEntries(champs.map((c) => [c.key, c])),
  counters: [],
  meta: [],
  fetchedAt: 0,
});

// Common cast we reuse across tests. Keys = numeric stringified, mirroring
// the LCU/DDragon convention.
const aatrox = mkChamp({ id: "Aatrox", key: "266", tags: ["Fighter", "Tank"] });
const ahri = mkChamp({ id: "Ahri", key: "103", tags: ["Mage", "Assassin"] });
const leona = mkChamp({ id: "Leona", key: "89", tags: ["Tank", "Support"] });
const lux = mkChamp({ id: "Lux", key: "99", tags: ["Mage", "Support"] });
const malphite = mkChamp({ id: "Malphite", key: "54", tags: ["Tank", "Fighter"] });
const ekko = mkChamp({ id: "Ekko", key: "245", tags: ["Assassin", "Fighter"] });
const ezreal = mkChamp({ id: "Ezreal", key: "81", tags: ["Marksman", "Mage"] });
const kha = mkChamp({ id: "Khazix", key: "121", tags: ["Assassin"] });
const morgana = mkChamp({ id: "Morgana", key: "25", tags: ["Mage", "Support"] });

describe("profileEnemyComp", () => {
  it("empty enemy list returns neutral profile", () => {
    const db = mkDb([]);
    const p = profileEnemyComp(db, []);
    expect(p).toEqual({
      apShare: 0,
      adShare: 0,
      hardCC: 0,
      burstThreats: 0,
      divers: 0,
      healers: 0,
    });
  });

  it("heavy AP comp -> apShare clears the 0.55 'heavy AP' trigger", () => {
    // The engine treats apShare ≥ 0.55 as "heavy AP comp". Each champion's
    // tags increment AP or AD at most ONCE per category (Mage||Support and
    // Marksman||Fighter are short-circuit ORs), so a 4-champ AP comp lands
    // around 0.6 — clears the 0.55 trigger comfortably.
    const db = mkDb([ahri, lux, ekko, morgana, malphite]);
    const p = profileEnemyComp(db, ["103", "99", "25", "54"]);
    expect(p.apShare).toBeGreaterThanOrEqual(0.55);
    expect(p.adShare).toBeLessThan(p.apShare);
  });

  it("AD-heavy comp (Marksman + Fighter) -> adShare > apShare", () => {
    const db = mkDb([ezreal, aatrox, malphite]);
    // Aatrox tagged Fighter+Tank -> AD. Malphite Tank+Fighter -> AD via Fighter tag.
    const p = profileEnemyComp(db, ["81", "266", "54"]);
    expect(p.adShare).toBeGreaterThan(p.apShare);
  });

  it("Ekko classified as AP assassin (AP_ASSASSINS list)", () => {
    const db = mkDb([ekko]);
    const p = profileEnemyComp(db, ["245"]);
    // Ekko is tagged Assassin+Fighter. The Fighter tag adds 1 to AD, then
    // the assassin path adds 1 to AP (Ekko in AP_ASSASSINS). Net: 1 AP, 1 AD.
    expect(p.apShare).toBeGreaterThan(0);
    expect(p.burstThreats).toBe(1);
  });

  it("Kha'Zix classified as AD assassin (NOT in AP_ASSASSINS)", () => {
    const db = mkDb([kha]);
    const p = profileEnemyComp(db, ["121"]);
    expect(p.adShare).toBe(1);
    expect(p.burstThreats).toBe(1);
  });

  it("counts hard CC champions (Leona, Morgana, Malphite)", () => {
    const db = mkDb([leona, morgana, malphite]);
    const p = profileEnemyComp(db, ["89", "25", "54"]);
    expect(p.hardCC).toBe(3);
  });

  it("counts divers correctly (Tank tag or DIVERS list)", () => {
    const db = mkDb([leona, malphite]); // both Tank-tagged
    const p = profileEnemyComp(db, ["89", "54"]);
    expect(p.divers).toBe(2);
  });

  it("missing championKey is skipped silently (defensive against DB gaps)", () => {
    const db = mkDb([leona]);
    const p = profileEnemyComp(db, ["89", "99999"]); // 99999 unknown
    expect(p.hardCC).toBe(1); // Leona still counted, unknown ignored
  });

  it("apShare + adShare = 1 (modulo Assassin double-count)", () => {
    // Simple non-assassin comp: shares should sum to 1.
    const db = mkDb([ahri, ezreal]); // Mage + Marksman, no assassin
    const p = profileEnemyComp(db, ["103", "81"]);
    expect(p.apShare + p.adShare).toBeCloseTo(1, 5);
  });
});

describe("suggestBuildAdaptations", () => {
  const me = mkChamp({ id: "Lux", key: "99", tags: ["Mage", "Support"] });
  const meSquishyMage = me;
  const meTank = mkChamp({ id: "Sion", key: "14", tags: ["Tank", "Fighter"] });
  const meAdc = mkChamp({ id: "Caitlyn", key: "51", tags: ["Marksman"] });

  it("no enemies -> no adaptations", () => {
    const db = mkDb([me]);
    const out = suggestBuildAdaptations({ db, champion: me, enemyKeys: [] });
    expect(out).toEqual([]);
  });

  it("heavy AP comp -> Force of Nature core + Zhonya's situational for squishy", () => {
    const db = mkDb([meSquishyMage, ahri, lux, ekko, morgana]);
    const out = suggestBuildAdaptations({
      db,
      champion: meSquishyMage,
      enemyKeys: ["103", "99", "245", "25"],
    });
    const fon = out.find((a) => a.itemName === "Force of Nature");
    expect(fon).toBeDefined();
    expect(fon?.priority).toBe("core");
    expect(out.some((a) => a.itemName === "Zhonya's Hourglass")).toBe(true);
  });

  it("heavy AD comp -> Randuin's core + Plated Steelcaps for AD scaling", () => {
    const db = mkDb([meAdc, aatrox, ezreal, mkChamp({ id: "Renekton", key: "58", tags: ["Fighter"] })]);
    const out = suggestBuildAdaptations({
      db,
      champion: meAdc,
      enemyKeys: ["266", "81", "58"],
    });
    expect(out.some((a) => a.itemName === "Randuin's Omen" && a.priority === "core")).toBe(true);
    expect(out.some((a) => a.itemName === "Plated Steelcaps")).toBe(true);
  });

  it("3+ hard CC -> Silvermere Dawn (full QSS upgrade) suggested", () => {
    const db = mkDb([meSquishyMage, leona, morgana, malphite]);
    const out = suggestBuildAdaptations({
      db,
      champion: meSquishyMage,
      enemyKeys: ["89", "25", "54"],
    });
    expect(out.some((a) => a.itemName === "Silvermere Dawn" && a.priority === "core")).toBe(true);
  });

  it("exactly 2 hard CC -> Quicksilver Sash (not Silvermere)", () => {
    const db = mkDb([meSquishyMage, leona, morgana]);
    const out = suggestBuildAdaptations({
      db,
      champion: meSquishyMage,
      enemyKeys: ["89", "25"],
    });
    expect(out.some((a) => a.itemName === "Quicksilver Sash")).toBe(true);
    expect(out.some((a) => a.itemName === "Silvermere Dawn")).toBe(false);
  });

  it("AP+CC stacked -> Mercury's Treads as core boot choice", () => {
    const db = mkDb([meSquishyMage, ahri, lux, leona, morgana]);
    const out = suggestBuildAdaptations({
      db,
      champion: meSquishyMage,
      enemyKeys: ["103", "99", "89", "25"],
    });
    expect(out.some((a) => a.itemName === "Mercury's Treads" && a.priority === "core")).toBe(true);
  });

  it("3+ divers vs squishy -> Stopwatch suggested", () => {
    const divers = ["JarvanIV", "Camille", "Wukong"].map((id, i) =>
      mkChamp({ id, key: `5${i}`, tags: ["Fighter"] })
    );
    const db = mkDb([meSquishyMage, ...divers]);
    const out = suggestBuildAdaptations({
      db,
      champion: meSquishyMage,
      enemyKeys: divers.map((d) => d.key),
    });
    expect(out.some((a) => a.itemName === "Stopwatch")).toBe(true);
  });

  it("tank champion gets no Death's Dance (only squishies do)", () => {
    const db = mkDb([meTank, aatrox, ezreal, mkChamp({ id: "Renekton", key: "58", tags: ["Fighter"] })]);
    const out = suggestBuildAdaptations({
      db,
      champion: meTank,
      enemyKeys: ["266", "81", "58"],
    });
    expect(out.some((a) => a.itemName === "Death's Dance")).toBe(false);
    // But Randuin's still suggested vs heavy AD
    expect(out.some((a) => a.itemName === "Randuin's Omen")).toBe(true);
  });

  it("magic-scaling champion vs AP comp -> Abyssal Mask suggested", () => {
    const db = mkDb([meSquishyMage, ahri, lux, ekko, morgana]);
    const out = suggestBuildAdaptations({
      db,
      champion: meSquishyMage,
      enemyKeys: ["103", "99", "245", "25"],
    });
    expect(out.some((a) => a.itemName === "Abyssal Mask")).toBe(true);
  });

  it("balanced comp under thresholds -> minimal adaptations", () => {
    // 1 AP + 1 AD, no CC, no divers — shouldn't trigger any core item.
    const db = mkDb([meSquishyMage, ahri, ezreal]);
    const out = suggestBuildAdaptations({
      db,
      champion: meSquishyMage,
      enemyKeys: ["103", "81"],
    });
    // Each share is 0.5 (below the 0.55 threshold) — no FoN, no Randuin core.
    expect(out.find((a) => a.itemName === "Force of Nature")).toBeUndefined();
    expect(out.find((a) => a.itemName === "Randuin's Omen")).toBeUndefined();
  });

  it("counts healers (Aatrox, Soraka) for anti-heal detection", () => {
    const soraka = mkChamp({ id: "Soraka", key: "16", tags: ["Support", "Mage"] });
    const db = mkDb([aatrox, soraka]);
    const p = profileEnemyComp(db, ["266", "16"]);
    expect(p.healers).toBe(2);
  });

  it("1 healer -> situational Grievous component for the shopper's dmg type", () => {
    const soraka = mkChamp({ id: "Soraka", key: "16", tags: ["Support", "Mage"] });
    const db = mkDb([meAdc, soraka, ahri]);
    const out = suggestBuildAdaptations({ db, champion: meAdc, enemyKeys: ["16", "103"] });
    expect(out.some((a) => a.itemName === "Executioner's Calling" && a.priority === "situational")).toBe(true);
  });

  it("2+ healers vs AD shopper -> Mortal Reminder core", () => {
    const soraka = mkChamp({ id: "Soraka", key: "16", tags: ["Support", "Mage"] });
    const db = mkDb([meAdc, soraka, aatrox]);
    const out = suggestBuildAdaptations({ db, champion: meAdc, enemyKeys: ["16", "266"] });
    expect(out.some((a) => a.itemName === "Mortal Reminder" && a.priority === "core")).toBe(true);
  });

  it("2+ healers vs AP shopper -> Morellonomicon core", () => {
    const soraka = mkChamp({ id: "Soraka", key: "16", tags: ["Support", "Mage"] });
    const vlad = mkChamp({ id: "Vladimir", key: "8", tags: ["Mage"] });
    const db = mkDb([meSquishyMage, soraka, vlad]);
    const out = suggestBuildAdaptations({ db, champion: meSquishyMage, enemyKeys: ["16", "8"] });
    expect(out.some((a) => a.itemName === "Morellonomicon" && a.priority === "core")).toBe(true);
  });

  it("2+ healers vs tank shopper -> Thornmail", () => {
    const vlad = mkChamp({ id: "Vladimir", key: "8", tags: ["Mage"] });
    const aatroxHeal = mkChamp({ id: "Aatrox", key: "266", tags: ["Fighter", "Tank"] });
    const db = mkDb([meTank, vlad, aatroxHeal]);
    const out = suggestBuildAdaptations({ db, champion: meTank, enemyKeys: ["8", "266"] });
    expect(out.some((a) => a.itemName === "Thornmail")).toBe(true);
  });

  it("no healers -> no anti-heal item", () => {
    const db = mkDb([meAdc, ahri, ezreal]);
    const out = suggestBuildAdaptations({ db, champion: meAdc, enemyKeys: ["103", "81"] });
    expect(out.some((a) => /Mortal Reminder|Morellonomicon|Executioner|Oblivion|Thornmail/.test(a.itemName))).toBe(false);
  });

  it("every adaptation has a non-empty reason string for UI display", () => {
    const db = mkDb([meSquishyMage, ahri, lux, ekko, morgana, leona]);
    const out = suggestBuildAdaptations({
      db,
      champion: meSquishyMage,
      enemyKeys: ["103", "99", "245", "25", "89"],
    });
    expect(out.length).toBeGreaterThan(0);
    for (const a of out) {
      expect(a.reason).toBeTruthy();
      expect(a.reason.length).toBeGreaterThan(5);
      expect(a.itemId).toBeGreaterThan(0);
      expect(a.itemName).toBeTruthy();
    }
  });
});
