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
  titleFromFirstMessage,
  createConversation,
  appendMessage,
  listConversations,
  loadMessages,
  searchConversations,
  deleteConversation,
} from "./chatRepo";

describe("titleFromFirstMessage", () => {
  it("uses the message as-is when short", () => {
    expect(titleFromFirstMessage("¿Cómo gano vs Yasuo?")).toBe("¿Cómo gano vs Yasuo?");
  });

  it("collapses whitespace/newlines to a single line", () => {
    expect(titleFromFirstMessage("  analiza   mis\núltimas  partidas ")).toBe(
      "analiza mis últimas partidas"
    );
  });

  it("truncates long messages with an ellipsis", () => {
    const long = "a".repeat(100);
    const out = titleFromFirstMessage(long);
    expect(out.length).toBe(58); // 57 chars + ellipsis
    expect(out.endsWith("…")).toBe(true);
  });

  it("keeps exactly 60 chars intact and truncates from 61", () => {
    expect(titleFromFirstMessage("b".repeat(60))).toBe("b".repeat(60));
    expect(titleFromFirstMessage("b".repeat(61))).toBe(`${"b".repeat(57)}…`);
  });

  it("falls back to a default for empty input", () => {
    expect(titleFromFirstMessage("   ")).toBe("Conversación");
    expect(titleFromFirstMessage("")).toBe("Conversación");
  });
});

describe("chat persistence (SQLite)", () => {
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    tauri = true;
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    selectMock.mockReset().mockResolvedValue([]);
    executeMock.mockReset().mockResolvedValue({ lastInsertId: 7, rowsAffected: 1 });
    getDbMock.mockReset().mockResolvedValue({ select: selectMock, execute: executeMock });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is a no-op outside Tauri (0 id, empty lists, DB never opened)", async () => {
    tauri = false;
    expect(await createConversation("hola")).toBe(0);
    await appendMessage(3, "user", "x");
    expect(await listConversations()).toEqual([]);
    expect(await loadMessages(3)).toEqual([]);
    expect(await searchConversations("yasuo")).toEqual([]);
    await deleteConversation(3);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("createConversation stores a derived title + timestamps and returns the new id", async () => {
    const id = await createConversation("  ¿Cómo   juego\nAhri? ");
    expect(id).toBe(7);
    const [sql, params] = executeMock.mock.calls[0];
    expect(sql).toContain("INSERT INTO chat_conversations");
    expect(params).toEqual(["¿Cómo juego Ahri?", NOW]);
  });

  it("createConversation returns 0 when the driver gives no insert id", async () => {
    executeMock.mockResolvedValue({ rowsAffected: 1 });
    expect(await createConversation("x")).toBe(0);
  });

  it("appendMessage inserts the message then bumps updated_ts_ms", async () => {
    await appendMessage(5, "assistant", "Juega seguro hasta nivel 6");
    expect(executeMock).toHaveBeenCalledTimes(2);
    const [insertSql, insertParams] = executeMock.mock.calls[0];
    const [updateSql, updateParams] = executeMock.mock.calls[1];
    expect(insertSql).toContain("INSERT INTO chat_messages");
    expect(insertParams).toEqual([5, "assistant", "Juega seguro hasta nivel 6", NOW]);
    expect(updateSql).toContain("UPDATE chat_conversations SET updated_ts_ms = $1 WHERE id = $2");
    expect(updateParams).toEqual([NOW, 5]);
  });

  it("appendMessage / loadMessages / deleteConversation ignore non-positive ids", async () => {
    await appendMessage(0, "user", "x");
    expect(await loadMessages(0)).toEqual([]);
    expect(await loadMessages(-1)).toEqual([]);
    await deleteConversation(0);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("listConversations maps rows and passes the limit (default 50)", async () => {
    selectMock.mockResolvedValue([
      { id: 2, title: "Draft vs Zed", updated_ts_ms: NOW },
      { id: 1, title: "Runas", updated_ts_ms: NOW - 1000 },
    ]);
    const out = await listConversations();
    expect(selectMock.mock.calls[0][0]).toContain("ORDER BY updated_ts_ms DESC LIMIT $1");
    expect(selectMock.mock.calls[0][1]).toEqual([50]);
    expect(out).toEqual([
      { id: 2, title: "Draft vs Zed", updatedTsMs: NOW },
      { id: 1, title: "Runas", updatedTsMs: NOW - 1000 },
    ]);
    await listConversations(10);
    expect(selectMock.mock.calls[1][1]).toEqual([10]);
  });

  it("loadMessages keeps order and coerces any non-user role to assistant", async () => {
    selectMock.mockResolvedValue([
      { role: "user", content: "¿Qué pickeo?" },
      { role: "assistant", content: "Ahri" },
      { role: "system", content: "legacy row" },
    ]);
    const out = await loadMessages(4);
    expect(selectMock.mock.calls[0][1]).toEqual([4]);
    expect(out).toEqual([
      { role: "user", content: "¿Qué pickeo?" },
      { role: "assistant", content: "Ahri" },
      { role: "assistant", content: "legacy row" },
    ]);
  });

  it("searchConversations with a blank query falls back to the recent list", async () => {
    selectMock.mockResolvedValue([{ id: 1, title: "Runas", updated_ts_ms: NOW }]);
    const out = await searchConversations("   ", 20);
    const [sql, params] = selectMock.mock.calls[0];
    expect(sql).not.toContain("LIKE");
    expect(params).toEqual([20]);
    expect(out).toEqual([{ id: 1, title: "Runas", updatedTsMs: NOW }]);
  });

  it("searchConversations matches title or message content with a trimmed LIKE", async () => {
    selectMock.mockResolvedValue([{ id: 9, title: "Yasuo mid", updated_ts_ms: NOW }]);
    const out = await searchConversations("  yasuo ");
    const [sql, params] = selectMock.mock.calls[0];
    expect(sql).toContain("WHERE title LIKE $1");
    expect(sql).toContain("SELECT conversation_id FROM chat_messages WHERE content LIKE $1");
    expect(params).toEqual(["%yasuo%", 50]);
    expect(out).toEqual([{ id: 9, title: "Yasuo mid", updatedTsMs: NOW }]);
  });

  it("deleteConversation removes messages before the conversation (manual cascade)", async () => {
    await deleteConversation(12);
    expect(executeMock.mock.calls.map(([sql, params]) => [String(sql), params])).toEqual([
      ["DELETE FROM chat_messages WHERE conversation_id = $1", [12]],
      ["DELETE FROM chat_conversations WHERE id = $1", [12]],
    ]);
  });
});
