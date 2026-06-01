-- AI champion tips cache (v9). The pre-game TipCarousel only had ~9 curated
-- champions + a generic role fallback; everyone else got bland tips. Cache
-- short AI-generated tips per (champion, role, patch) so all ~170 champions
-- get specific, meta-aware advice — generated once, instant thereafter.

CREATE TABLE IF NOT EXISTS ai_champion_tips (
  champion_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  patch TEXT NOT NULL,
  tips_text TEXT NOT NULL,        -- newline-separated tips
  generated_ts_ms INTEGER NOT NULL,
  PRIMARY KEY (champion_id, role, patch)
);
