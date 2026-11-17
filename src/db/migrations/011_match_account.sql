-- Which Riot account (Riot-format puuid) each game belongs to, so a smurf and
-- the main never mix in personal stats. Rows stored before this stay NULL
-- until the app assigns them to the account saved at that time.
ALTER TABLE matches ADD COLUMN account TEXT;
CREATE INDEX IF NOT EXISTS idx_matches_account_end ON matches(account, end_ts_ms);
