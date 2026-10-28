import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const selectMock = vi.fn();
const executeMock = vi.fn();
const getDbMock = vi.fn();
let tauri = true;
vi.mock("../db/client", () => ({
  isTauri: () => tauri,
  getDb: () => getDbMock(),
}));

import {
  saveMemory,
  recentMemories,
  memoriesByCategory,
  clearOldMemories,
  buildMemoryContext,
} from "./aiMemory";

const NOW = 1_700_000_000_000;

function row(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    kind: "observation",
    category: null,
    content: "x",
    match_id: null,
    champion_id: null,
    created_ts_ms: NOW - 1000,
    expires_ts_ms: null,
    ...over,
  };
}

beforeEach(() => {
  tauri = true;
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  selectMock.mockReset().mockResolvedValue([]);
  executeMock.mockReset().mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });
  getDbMock.mockReset().mockResolvedValue({ select: selectMock, execute: executeMock });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("aiMemory outside Tauri", () => {
  it("is a no-op: nothing saved, empty reads, empty context, DB never opened", async () => {
    tauri = false;
    await saveMemory({ kind: "advice", content: "x" });
    await clearOldMemories();
    expect(await recentMemories()).toEqual([]);
    expect(await memoriesByCategory("deaths")).toEqual([]);
    expect(await buildMemoryContext()).toBe("");
    expect(getDbMock).not.toHaveBeenCalled();
  });
});

describe("saveMemory", () => {
  it("fills optional columns with NULL and stamps the current time", async () => {
    await saveMemory({ kind: "advice", content: "Wardea el río a min 3" });
    const [sql, params] = executeMock.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO ai_memory/);
    expect(params).toEqual(["advice", null, "Wardea el río a min 3", null, null, NOW, null]);
  });

  it("persists every provided field, honouring an explicit timestamp", async () => {
    await saveMemory({
      kind: "pattern",
      category: "deaths",
      content: "Mueres solo tras 15'",
      matchId: "EUW1_1",
      championId: 103,
      createdTsMs: 42,
      expiresTsMs: 99,
    });
    expect(executeMock.mock.calls[0][1]).toEqual([
      "pattern",
      "deaths",
      "Mueres solo tras 15'",
      "EUW1_1",
      103,
      42,
      99,
    ]);
  });
});

describe("recentMemories", () => {
  it("filters expired rows by now, applies the limit and maps NULLs to undefined", async () => {
    selectMock.mockResolvedValue([
      row({
        id: 5,
        kind: "goal",
        category: "farming",
        content: "80 CS a los 10",
        match_id: "EUW1_9",
        champion_id: 157,
        created_ts_ms: 10,
        expires_ts_ms: NOW + 1,
      }),
      row({ id: 6 }),
    ]);

    const out = await recentMemories(12);

    const [sql, params] = selectMock.mock.calls[0];
    expect(sql).toMatch(/expires_ts_ms IS NULL OR expires_ts_ms > \$1/);
    expect(params).toEqual([NOW, 12]);
    expect(out).toEqual([
      {
        id: 5,
        kind: "goal",
        category: "farming",
        content: "80 CS a los 10",
        matchId: "EUW1_9",
        championId: 157,
        createdTsMs: 10,
        expiresTsMs: NOW + 1,
      },
      {
        id: 6,
        kind: "observation",
        category: undefined,
        content: "x",
        matchId: undefined,
        championId: undefined,
        createdTsMs: NOW - 1000,
        expiresTsMs: undefined,
      },
    ]);
  });

  it("defaults to the 30 most recent", async () => {
    await recentMemories();
    expect(selectMock.mock.calls[0][1]).toEqual([NOW, 30]);
  });
});

describe("memoriesByCategory", () => {
  it("queries by category with the default limit and maps the rows", async () => {
    selectMock.mockResolvedValue([
      { id: 3, kind: "advice", category: "vision", content: "Compra pinks", created_ts_ms: 7 },
    ]);
    const out = await memoriesByCategory("vision");
    const [sql, params] = selectMock.mock.calls[0];
    expect(sql).toMatch(/WHERE category = \$1/);
    expect(params).toEqual(["vision", 10]);
    expect(out).toEqual([
      { id: 3, kind: "advice", category: "vision", content: "Compra pinks", createdTsMs: 7 },
    ]);
  });

  it("maps a NULL category to undefined and honours a custom limit", async () => {
    selectMock.mockResolvedValue([
      { id: 4, kind: "pattern", category: null, content: "c", created_ts_ms: 8 },
    ]);
    const out = await memoriesByCategory("vision", 3);
    expect(selectMock.mock.calls[0][1]).toEqual(["vision", 3]);
    expect(out[0].category).toBeUndefined();
  });
});

describe("clearOldMemories", () => {
  it("keeps only the newest 200 memories", async () => {
    await clearOldMemories();
    const [sql] = executeMock.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM ai_memory/);
    expect(sql).toMatch(/ORDER BY created_ts_ms DESC LIMIT 200/);
  });
});

describe("buildMemoryContext", () => {
  it("returns empty string when there are no memories", async () => {
    expect(await buildMemoryContext()).toBe("");
    // Default asks for 8 items.
    expect(selectMock.mock.calls[0][1]).toEqual([NOW, 8]);
  });

  it("renders one labelled line per memory kind, with optional category", async () => {
    selectMock.mockResolvedValue([
      row({ kind: "pattern", category: "deaths", content: "Mueres en el río" }),
      row({ kind: "goal", content: "Llegar a Platino" }),
      row({ kind: "advice", category: "vision", content: "Más pinks" }),
      row({ kind: "observation", content: "Buen farmeo" }),
    ]);

    const ctx = await buildMemoryContext(4);

    expect(selectMock.mock.calls[0][1]).toEqual([NOW, 4]);
    expect(ctx).toBe(
      "\nMEMORIA DE SESIONES PASADAS (refiérete a ella si es relevante):\n" +
        "- [PATRÓN/deaths] Mueres en el río\n" +
        "- [OBJETIVO] Llegar a Platino\n" +
        "- [CONSEJO PASADO/vision] Más pinks\n" +
        "- [OBSERVACIÓN] Buen farmeo"
    );
  });
});
