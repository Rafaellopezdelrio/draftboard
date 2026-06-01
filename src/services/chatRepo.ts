// AI coach chat history. The chat used to live only in component state (gone
// on close); this persists conversations + messages (migration 008) so the
// user can search past chats and resume a topic. Mirrors the matchRepo/
// draftsRepo access pattern (getDb + execute/select, no-op outside Tauri).

import { getDb, isTauri } from "../db/client";
import type { ChatMessage } from "./aiChat";

export interface ConversationMeta {
  id: number;
  title: string;
  updatedTsMs: number;
}

/** Derive a short conversation title from the first user message. */
export function titleFromFirstMessage(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine || "Conversación";
}

/** Create a conversation. Returns the new id, or 0 outside Tauri. */
export async function createConversation(title: string): Promise<number> {
  if (!isTauri()) return 0;
  const db = await getDb();
  const now = Date.now();
  const r = await db.execute(
    `INSERT INTO chat_conversations (title, created_ts_ms, updated_ts_ms)
     VALUES ($1, $2, $2)`,
    [titleFromFirstMessage(title), now]
  );
  return Number(r.lastInsertId ?? 0);
}

/** Append one message + bump the conversation's updated_ts (for ordering). */
export async function appendMessage(
  conversationId: number,
  role: ChatMessage["role"],
  content: string
): Promise<void> {
  if (!isTauri() || conversationId <= 0) return;
  const db = await getDb();
  const now = Date.now();
  await db.execute(
    `INSERT INTO chat_messages (conversation_id, role, content, ts_ms)
     VALUES ($1, $2, $3, $4)`,
    [conversationId, role, content, now]
  );
  await db.execute(
    `UPDATE chat_conversations SET updated_ts_ms = $1 WHERE id = $2`,
    [now, conversationId]
  );
}

/** Most-recently-updated conversations first. */
export async function listConversations(limit = 50): Promise<ConversationMeta[]> {
  if (!isTauri()) return [];
  const db = await getDb();
  const rows = await db.select<Array<{ id: number; title: string; updated_ts_ms: number }>>(
    `SELECT id, title, updated_ts_ms FROM chat_conversations
     ORDER BY updated_ts_ms DESC LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({ id: r.id, title: r.title, updatedTsMs: r.updated_ts_ms }));
}

/** Load a conversation's messages in send order. */
export async function loadMessages(conversationId: number): Promise<ChatMessage[]> {
  if (!isTauri() || conversationId <= 0) return [];
  const db = await getDb();
  const rows = await db.select<Array<{ role: string; content: string }>>(
    `SELECT role, content FROM chat_messages
     WHERE conversation_id = $1 ORDER BY ts_ms ASC, id ASC`,
    [conversationId]
  );
  return rows.map((r) => ({
    role: r.role === "user" ? "user" : "assistant",
    content: r.content,
  }));
}

/** Conversations whose TITLE or any MESSAGE matches the query (LIKE, newest
 *  first). Empty query → the plain recent list. */
export async function searchConversations(
  query: string,
  limit = 50
): Promise<ConversationMeta[]> {
  const q = query.trim();
  if (!q) return listConversations(limit);
  if (!isTauri()) return [];
  const db = await getDb();
  const like = `%${q}%`;
  const rows = await db.select<Array<{ id: number; title: string; updated_ts_ms: number }>>(
    `SELECT id, title, updated_ts_ms FROM chat_conversations
       WHERE title LIKE $1
          OR id IN (SELECT conversation_id FROM chat_messages WHERE content LIKE $1)
     ORDER BY updated_ts_ms DESC LIMIT $2`,
    [like, limit]
  );
  return rows.map((r) => ({ id: r.id, title: r.title, updatedTsMs: r.updated_ts_ms }));
}

/** Delete a conversation + its messages (manual cascade — we don't rely on
 *  PRAGMA foreign_keys being on). */
export async function deleteConversation(conversationId: number): Promise<void> {
  if (!isTauri() || conversationId <= 0) return;
  const db = await getDb();
  await db.execute(`DELETE FROM chat_messages WHERE conversation_id = $1`, [conversationId]);
  await db.execute(`DELETE FROM chat_conversations WHERE id = $1`, [conversationId]);
}
