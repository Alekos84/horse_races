-- Aggiunge la colonna 'chips' alla tabella 'bets'
-- per salvare il numero di fiches acquistate invece di calcolarlo

ALTER TABLE bets
ADD COLUMN IF NOT EXISTS chips INTEGER DEFAULT 0;

-- Aggiorna le righe esistenti calcolando chips da amount
-- (usa prezzo base €0.20 come fallback per dati vecchi)
UPDATE bets
SET chips = ROUND(amount / 0.20)::INTEGER
WHERE chips = 0 OR chips IS NULL;

-- Commento sulla colonna
COMMENT ON COLUMN bets.chips IS 'Numero di fiches acquistate (salvato direttamente, non calcolato)';
