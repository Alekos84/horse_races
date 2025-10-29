-- Tabella per tracciare i partecipanti alle stanze
CREATE TABLE IF NOT EXISTS game_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(game_id, user_id)
);

-- Index per query veloci
CREATE INDEX idx_game_participants_game_id ON game_participants(game_id);
CREATE INDEX idx_game_participants_user_id ON game_participants(user_id);

-- RLS policies
ALTER TABLE game_participants ENABLE ROW LEVEL SECURITY;

-- Tutti possono vedere i partecipanti di una stanza
CREATE POLICY "Anyone can view game participants"
  ON game_participants FOR SELECT
  USING (true);

-- Gli utenti autenticati possono aggiungersi come partecipanti
CREATE POLICY "Authenticated users can join games"
  ON game_participants FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Gli utenti possono rimuoversi (quando escono)
CREATE POLICY "Users can leave games"
  ON game_participants FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
