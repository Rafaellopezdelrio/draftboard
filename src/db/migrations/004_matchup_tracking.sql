ALTER TABLE matches ADD COLUMN opponent_champion_id INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_matches_position ON matches(position);
CREATE INDEX IF NOT EXISTS idx_matches_opponent ON matches(position, opponent_champion_id);
