// itemMeta: names follow the UI language, and the AI shop list keeps only
// finished items sold on the Rift this patch (no mode copies, no removed ones).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { riftItemNames, getItemMeta, localItemName, ddragonLocale, __testOnly_resetItemMeta } from "./itemMeta";

const items = {
  data: {
    // Removed from the Rift shop; a mode copy (6 digits) is still sold.
    "4644": { name: "Corona de la reina quebrada", gold: { total: 2800, purchasable: false }, maps: { "11": false } },
    "664644": { name: "Corona de la reina quebrada", gold: { total: 2800, purchasable: true }, maps: { "11": true } },
    "4401": { name: "Fuerza de la naturaleza", gold: { total: 2800, purchasable: true }, maps: { "11": true } },
    "3006": { name: "Grebas de berserker", gold: { total: 1100, purchasable: true }, maps: { "11": true }, tags: ["Boots"] },
    "1037": { name: "Pico", gold: { total: 875, purchasable: true }, maps: { "11": true }, into: ["3031"] },
    "2003": { name: "Poción de vida", gold: { total: 50, purchasable: true }, maps: { "11": true }, tags: ["Consumable"] },
    "3340": { name: "Tótem de vigilancia", gold: { total: 0, purchasable: true }, maps: { "11": true }, tags: ["Trinket"] },
  },
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  __testOnly_resetItemMeta();
  fetchMock = vi.fn(async () => new Response(JSON.stringify(items), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("itemMeta", () => {
  it("maps the UI language to the Data Dragon language", () => {
    expect(ddragonLocale("es")).toBe("es_ES");
    expect(ddragonLocale("en")).toBe("en_US");
  });

  it("shop list: finished Rift items only, in the asked language", async () => {
    expect(await riftItemNames("16.23.1", "es")).toEqual(["Fuerza de la naturaleza", "Grebas de berserker"]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://ddragon.leagueoflegends.com/cdn/16.23.1/data/es_ES/item.json");
  });

  it("loads names again when the language changes", async () => {
    await riftItemNames("16.23.1", "es");
    await riftItemNames("16.23.1", "en");
    expect(fetchMock.mock.calls[1][0]).toContain("/en_US/item.json");
  });

  it("localItemName: the loaded language's name, the engine's English name until then", async () => {
    expect(localItemName(4401, "Force of Nature")).toBe("Force of Nature");
    await riftItemNames("16.23.1", "es");
    expect(localItemName(4401, "Force of Nature")).toBe("Fuerza de la naturaleza");
    expect(localItemName(999999, "Unknown")).toBe("Unknown");
  });

  it("getItemMeta answers after the load, with the Rift flag", async () => {
    await riftItemNames("16.23.1", "es");
    expect(getItemMeta("16.23.1", 4644)?.onRift).toBe(false);
    expect(getItemMeta("16.23.1", 4401)).toMatchObject({ name: "Fuerza de la naturaleza", onRift: true });
  });
});
