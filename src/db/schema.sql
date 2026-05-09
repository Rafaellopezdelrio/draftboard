CREATE TABLE IF NOT EXISTS riot_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  api_key TEXT NOT NULL,
  region TEXT NOT NULL,
  riot_id_name TEXT NOT NULL,
  riot_id_tag TEXT NOT NULL,
  puuid TEXT
);

CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,
  champion_id INTEGER NOT NULL,
  win INTEGER NOT NULL,
  kills INTEGER NOT NULL,
  deaths INTEGER NOT NULL,
  assists INTEGER NOT NULL,
  cs INTEGER NOT NULL,
  duration_sec INTEGER NOT NULL,
  end_ts_ms INTEGER NOT NULL,
  queue_id INTEGER NOT NULL,
  position TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matches_champ ON matches(champion_id);
CREATE INDEX IF NOT EXISTS idx_matches_end ON matches(end_ts_ms DESC);

CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_ms INTEGER NOT NULL,
  ally_keys TEXT NOT NULL,
  enemy_keys TEXT NOT NULL,
  banned_keys TEXT NOT NULL,
  picked_key TEXT,
  suggested_keys TEXT NOT NULL,
  followed_suggestion INTEGER NOT NULL,
  match_id TEXT REFERENCES matches(match_id)
);
CREATE INDEX IF NOT EXISTS idx_drafts_ts ON drafts(ts_ms DESC);
