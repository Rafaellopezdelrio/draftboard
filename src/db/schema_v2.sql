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
