-- Aggiungi campo current_card_index alla tabella games
ALTER TABLE games ADD COLUMN IF NOT EXISTS current_card_index INTEGER DEFAULT 0;

-- Index per query veloci
CREATE INDEX IF NOT EXISTS idx_games_current_card_index ON games(current_card_index);
