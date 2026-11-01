// Cache-or-generate paths of championTips (pure helpers are covered in
// championTips.test.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const selectMock = vi.fn();
const executeMock = vi.fn();
const getDbMock = vi.fn();
let tauri = true;
vi.mock("../db/client", () => ({
  isTauri: () => tauri,
  getDb: () => getDbMock(),
}));

const callAi = vi.fn();
vi.mock("./aiProvider", () => ({
  callAi: (...a: unknown[]) => callAi(...a),
}));

import { getCachedTips, getChampionTips, type ChampionTipsInput } from "./championTips";

const NOW = 1_700_000_000_000;

function input(over: Partial<ChampionTipsInput> = {}): ChampionTipsInput {
  return {
    provider: "groq",
    apiKey: "k",
    championId: 64,
    championName: "Lee Sin",
    role: "JUNGLE",
    patch: "16.11",
    ...over,
  };
}

beforeEach(() => {
  tauri = true;
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  selectMock.mockReset().mockResolvedValue([]);
  executeMock.mockReset().mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });
  getDbMock.mockReset().mockResolvedValue({ select: selectMock, execute: executeMock });
  callAi.mockReset().mockResolvedValue("1. Tip uno\n2. Tip dos");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getCachedTips", () => {
  it("returns null outside Tauri without touching the DB", async () => {
    tauri = false;
    expect(await getCachedTips(64, "JUNGLE", "16.11")).toBeNull();
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("queries by champion/role/patch and returns null on a cache miss", async () => {
    expect(await getCachedTips(64, "JUNGLE", "16.11")).toBeNull();
    expect(selectMock).toHaveBeenCalledWith(
      expect.stringContaining("FROM ai_champion_tips"),
      [64, "JUNGLE", "16.11"]
    );
  });

  it("parses the cached blob into tips", async () => {
    selectMock.mockResolvedValue([{ tips_text: "- Uno\n- Dos" }]);
    expect(await getCachedTips(64, "JUNGLE", "16.11")).toEqual(["Uno", "Dos"]);
  });

  it("treats a cached blob with no usable lines as a miss", async () => {
    selectMock.mockResolvedValue([{ tips_text: "\n   \n" + "x".repeat(200) }]);
    expect(await getCachedTips(64, "JUNGLE", "16.11")).toBeNull();
  });
});

describe("getChampionTips", () => {
  it("returns cached tips without calling the AI", async () => {
    selectMock.mockResolvedValue([{ tips_text: "Cacheado" }]);
    expect(await getChampionTips(input())).toEqual(["Cacheado"]);
    expect(callAi).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("generates on miss (Spanish by default) and saves the joined tips", async () => {
    const tips = await getChampionTips(input());
    expect(tips).toEqual(["Tip uno", "Tip dos"]);
    expect(callAi).toHaveBeenCalledWith({
      provider: "groq",
      apiKey: "k",
      systemPrompt: expect.stringContaining("coach pro"),
      userPrompt: "4 tips para Lee Sin JUNGLE, parche 16.11.",
      maxTokens: 200,
    });
    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT OR REPLACE INTO ai_champion_tips"),
      [64, "JUNGLE", "16.11", "Tip uno\nTip dos", NOW]
    );
  });

  it("builds English prompts when language is en", async () => {
    await getChampionTips(input({ language: "en" }));
    expect(callAi).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("pro League of Legends coach"),
        userPrompt: "4 tips for Lee Sin JUNGLE, patch 16.11.",
      })
    );
  });

  it("does not save when the AI returns nothing usable", async () => {
    callAi.mockResolvedValue("\n\n");
    expect(await getChampionTips(input())).toEqual([]);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("outside Tauri generates but never touches the DB", async () => {
    tauri = false;
    expect(await getChampionTips(input())).toEqual(["Tip uno", "Tip dos"]);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("swallows AI failures and returns []", async () => {
    callAi.mockRejectedValue(new Error("429"));
    expect(await getChampionTips(input())).toEqual([]);
  });

  it("returns [] when saving freshly generated tips fails", async () => {
    executeMock.mockRejectedValue(new Error("disk full"));
    expect(await getChampionTips(input())).toEqual([]);
    expect(callAi).toHaveBeenCalledTimes(1);
  });

  it("swallows DB failures and returns []", async () => {
    getDbMock.mockRejectedValue(new Error("db locked"));
    expect(await getChampionTips(input())).toEqual([]);
    expect(callAi).not.toHaveBeenCalled();
  });
});
