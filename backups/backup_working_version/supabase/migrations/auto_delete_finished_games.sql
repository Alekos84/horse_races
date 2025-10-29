-- Funzione che cancella automaticamente le partite finite da più di 24 ore
CREATE OR REPLACE FUNCTION delete_old_finished_games()
RETURNS void AS $$
BEGIN
  DELETE FROM games
  WHERE status = 'finished'
  AND finished_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Trigger che viene eseguito ogni volta che viene aggiornato lo status di una partita
-- (opzionale, per esecuzione immediata quando passa 24h)
-- Nota: per esecuzione periodica è meglio usare pg_cron o Supabase Edge Functions

-- Per ora, crea una funzione che può essere chiamata manualmente o da cron
-- Esempio di uso: SELECT delete_old_finished_games();
