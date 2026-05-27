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

CREATE TABLE IF NOT EXISTS meta_aggregate (
  champion_id INTEGER NOT NULL,
  position TEXT NOT NULL,
  games INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  win_rate REAL NOT NULL,
  pick_rate REAL NOT NULL,
  ban_rate REAL NOT NULL,
  patch TEXT NOT NULL,
  updated_ts_ms INTEGER NOT NULL,
  PRIMARY KEY (champion_id, position, patch)
);

CREATE TABLE IF NOT EXISTS counter_aggregate (
  champion_id INTEGER NOT NULL,
  vs_champion_id INTEGER NOT NULL,
  position TEXT NOT NULL,
  games INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  win_rate REAL NOT NULL,
  patch TEXT NOT NULL,
  updated_ts_ms INTEGER NOT NULL,
  PRIMARY KEY (champion_id, vs_champion_id, position, patch)
);

CREATE TABLE IF NOT EXISTS build_aggregate (
  champion_id INTEGER NOT NULL,
  position TEXT NOT NULL,
  item_ids TEXT NOT NULL,
  games INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  patch TEXT NOT NULL,
  updated_ts_ms INTEGER NOT NULL,
  PRIMARY KEY (champion_id, position, item_ids, patch)
);

CREATE TABLE IF NOT EXISTS rune_aggregate (
  champion_id INTEGER NOT NULL,
  position TEXT NOT NULL,
  primary_style INTEGER NOT NULL,
  sub_style INTEGER NOT NULL,
  perks TEXT NOT NULL,
  shards TEXT NOT NULL,
  games INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  patch TEXT NOT NULL,
  updated_ts_ms INTEGER NOT NULL,
  PRIMARY KEY (champion_id, position, primary_style, sub_style, perks, patch)
);

CREATE TABLE IF NOT EXISTS skill_order_aggregate (
  champion_id INTEGER NOT NULL,
  position TEXT NOT NULL,
  first_three TEXT NOT NULL,
  max_order TEXT NOT NULL,
  games INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  patch TEXT NOT NULL,
  updated_ts_ms INTEGER NOT NULL,
  PRIMARY KEY (champion_id, position, first_three, max_order, patch)
);

CREATE TABLE IF NOT EXISTS aggregation_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
