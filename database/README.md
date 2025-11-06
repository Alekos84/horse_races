# Database Migration - Aggiunta colonna `chips`

## Problema risolto
Prima il numero di fiches veniva **calcolato** dividendo l'importo per il prezzo corrente della fiche.
Questo causava **inconsistenze** quando il prezzo cambiava durante il gioco (perché il cavallo si muoveva).

Ora il numero di fiches viene **salvato direttamente** nel database.

## Come applicare la migrazione

### Opzione 1: SQL Editor di Supabase (consigliata)

1. Vai su [Supabase Dashboard](https://supabase.com/dashboard)
2. Seleziona il progetto
3. Nel menu laterale clicca su **"SQL Editor"**
4. Clicca **"New query"**
5. Copia e incolla il contenuto di `add_chips_column.sql`
6. Clicca **"Run"**

### Opzione 2: Database Settings

1. Vai su Settings → Database
2. Trova la sezione "Connection string" e connettiti via psql
3. Esegui il file SQL:
   ```bash
   psql "connection_string" -f database/add_chips_column.sql
   ```

## Verifica

Dopo aver eseguito la migrazione, verifica che:
- La colonna `chips` esista nella tabella `bets`
- I valori esistenti siano stati aggiornati con un valore calcolato

```sql
SELECT * FROM bets LIMIT 5;
```

Dovresti vedere una colonna `chips` con valori numerici.

## Note

- ✅ Il codice ha un **fallback**: se la colonna non esiste, calcola il numero di fiches (come prima)
- ✅ È **backward compatible**: funziona anche senza la migrazione (ma con i bug)
- ⚠️ **IMPORTANTE**: Esegui la migrazione prima di giocare nuove partite per evitare inconsistenze
