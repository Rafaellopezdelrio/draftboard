-- AI coach chat history (v8). The chat was ephemeral (component state only) —
-- persist conversations + messages so the user can search past chats and
-- resume a topic.

CREATE TABLE IF NOT EXISTS chat_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  created_ts_ms INTEGER NOT NULL,
  updated_ts_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated
  ON chat_conversations(updated_ts_ms DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL,            -- 'user' | 'assistant'
  content TEXT NOT NULL,
  ts_ms INTEGER NOT NULL
);
-- Load a conversation's messages in order; also covers the search subquery.
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv
  ON chat_messages(conversation_id, ts_ms);
