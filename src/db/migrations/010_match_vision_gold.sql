-- Capture per-match vision score + gold earned so cross-game leak analysis can
-- rank vision and economy alongside CS / KDA / deaths. Both are nullable on
-- purpose: rows synced before this migration stay NULL and the leak engine
-- skips NULLs (never treats missing data as a real 0 — that would invent a
-- fake leak). New syncs populate them from match-v5 / LCU participant stats.
ALTER TABLE matches ADD COLUMN vision_score INTEGER;
ALTER TABLE matches ADD COLUMN gold_earned INTEGER;
