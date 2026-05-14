-- AI memory and lesson plans persistence (v5)

CREATE TABLE IF NOT EXISTS ai_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,             -- 'observation' | 'advice' | 'pattern' | 'goal'
  category TEXT,                  -- 'farming' | 'vision' | 'macro' | 'mental' | etc.
  content TEXT NOT NULL,          -- the memory itself
  match_id TEXT,                  -- optional: linked to a specific match
  champion_id INTEGER,            -- optional: linked to a specific champion
  created_ts_ms INTEGER NOT NULL,
  expires_ts_ms INTEGER            -- optional: auto-delete after this date
);
CREATE INDEX IF NOT EXISTS idx_ai_memory_created ON ai_memory(created_ts_ms DESC);
CREATE INDEX IF NOT EXISTS idx_ai_memory_kind ON ai_memory(kind);

CREATE TABLE IF NOT EXISTS ai_advice_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id INTEGER NOT NULL,
  helpful INTEGER NOT NULL,       -- -1 ignored, 0 neutral, 1 helpful
  ts_ms INTEGER NOT NULL,
  FOREIGN KEY (memory_id) REFERENCES ai_memory(id)
);

CREATE TABLE IF NOT EXISTS lesson_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_ts_ms INTEGER NOT NULL,
  weakest_area TEXT,
  archetype TEXT,
  plan_text TEXT NOT NULL,         -- full markdown of the plan
  completed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ai_champion_guides (
  champion_id INTEGER NOT NULL,
  patch TEXT NOT NULL,
  guide_text TEXT NOT NULL,
  generated_ts_ms INTEGER NOT NULL,
  PRIMARY KEY (champion_id, patch)
);
