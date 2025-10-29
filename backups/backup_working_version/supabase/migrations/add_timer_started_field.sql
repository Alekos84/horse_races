-- Aggiungi campo timer_started alla tabella games per gestire il trigger del timer nel round 1
ALTER TABLE games ADD COLUMN IF NOT EXISTS timer_started BOOLEAN DEFAULT false;
ALTER TABLE games ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMP WITH TIME ZONE;

-- Index per query veloci
CREATE INDEX IF NOT EXISTS idx_games_timer_started ON games(timer_started);
