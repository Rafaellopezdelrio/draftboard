-- AI matchup tips cache (v6)
-- One row per (champion_a, champion_b, role). champion_a is "you", champion_b is enemy.

CREATE TABLE IF NOT EXISTS ai_matchup_tips (
  champion_a INTEGER NOT NULL,
  champion_b INTEGER NOT NULL,
  position TEXT NOT NULL,
  patch TEXT NOT NULL,
  tips_text TEXT NOT NULL,
  generated_ts_ms INTEGER NOT NULL,
  PRIMARY KEY (champion_a, champion_b, position, patch)
);
CREATE INDEX IF NOT EXISTS idx_ai_matchup_tips_a ON ai_matchup_tips(champion_a, position);
