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

import {
  getCachedMatchupTips,
  generateMatchupTips,
  type GenerateMatchupInput,
} from "./aiMatchupTips";

const NOW = 1_700_000_000_000;

const cachedRow = {
  champion_a: 103,
  champion_b: 157,
  position: "MIDDLE",
  patch: "14.20",
  tips_text: "- Tradea cuando gaste el Q",
  generated_ts_ms: 123,
};

function input(over: Partial<GenerateMatchupInput> = {}): GenerateMatchupInput {
  return {
    provider: "groq",
    apiKey: "",
    championA: 103,
    championAName: "Ahri",
    championB: 157,
    championBName: "Yasuo",
    position: "MIDDLE",
    patch: "14.20",
    ...over,
  };
}

beforeEach(() => {
  tauri = true;
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  selectMock.mockReset().mockResolvedValue([]);
  executeMock.mockReset().mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 });
  getDbMock.mockReset().mockResolvedValue({ select: selectMock, execute: executeMock });
  callAi.mockReset().mockResolvedValue("- tip nuevo");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getCachedMatchupTips", () => {
  it("returns null outside Tauri without opening the DB", async () => {
    tauri = false;
    expect(await getCachedMatchupTips(103, 157, "MIDDLE", "14.20")).toBeNull();
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("returns null on a cache miss", async () => {
    expect(await getCachedMatchupTips(103, 157, "MIDDLE", "14.20")).toBeNull();
    expect(selectMock.mock.calls[0][1]).toEqual([103, 157, "MIDDLE", "14.20"]);
  });

  it("maps a cached row to camelCase", async () => {
    selectMock.mockResolvedValue([cachedRow]);
    expect(await getCachedMatchupTips(103, 157, "MIDDLE", "14.20")).toEqual({
      championA: 103,
      championB: 157,
      position: "MIDDLE",
      patch: "14.20",
      tipsText: "- Tradea cuando gaste el Q",
      generatedTsMs: 123,
    });
  });
});

describe("generateMatchupTips", () => {
  it("returns the cached tips without calling the AI", async () => {
    selectMock.mockResolvedValue([cachedRow]);
    expect(await generateMatchupTips(input())).toBe("- Tradea cuando gaste el Q");
    // Lookup must use (you, enemy, role, patch) in that order.
    expect(selectMock.mock.calls[0][1]).toEqual([103, 157, "MIDDLE", "14.20"]);
    expect(callAi).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("on a miss asks the AI about the exact matchup and caches the answer", async () => {
    const out = await generateMatchupTips(input({ apiKey: "k" }));

    expect(out).toBe("- tip nuevo");
    expect(callAi).toHaveBeenCalledTimes(1);
    const p = callAi.mock.calls[0][0];
    expect(p).toMatchObject({ provider: "groq", apiKey: "k", maxTokens: 400 });
    expect(p.userPrompt).toContain("yo juego Ahri MIDDLE, enemigo es Yasuo MIDDLE. Parche 14.20.");
    expect(p.systemPrompt).toContain("Responde en español.");

    const [sql, params] = executeMock.mock.calls[0];
    expect(sql).toMatch(/INSERT OR REPLACE INTO ai_matchup_tips/);
    expect(params).toEqual([103, 157, "MIDDLE", "14.20", "- tip nuevo", NOW]);
  });

  it("asks for English when language is en", async () => {
    await generateMatchupTips(input({ language: "en" }));
    expect(callAi.mock.calls[0][0].systemPrompt).toContain("Respond in English.");
  });

  it("force=true skips the cache lookup and regenerates", async () => {
    selectMock.mockResolvedValue([cachedRow]);
    const out = await generateMatchupTips(input({ force: true }));
    expect(out).toBe("- tip nuevo");
    expect(selectMock).not.toHaveBeenCalled();
    expect(executeMock.mock.calls[0][1][4]).toBe("- tip nuevo");
  });

  it("still generates outside Tauri but persists nothing", async () => {
    tauri = false;
    expect(await generateMatchupTips(input())).toBe("- tip nuevo");
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("propagates an AI failure and caches nothing", async () => {
    callAi.mockRejectedValue(new Error("rate limited"));
    await expect(generateMatchupTips(input())).rejects.toThrow("rate limited");
    expect(executeMock).not.toHaveBeenCalled();
  });
});
