import { supabase } from './main.js';

// Crea una nuova partita
export async function createGame(numHorses, maxPlayers, initialChips, maxBet, prizeDistribution, entryFee, isPrivate) {
  const user = await supabase.auth.getUser();
  if (!user.data.user) throw new Error('Devi essere loggato');

  const { data, error } = await supabase
    .from('games')
    .insert({
      created_by: user.data.user.id,
      num_horses: numHorses,
      max_players: maxPlayers,
      initial_chips: initialChips,
      max_bet: maxBet,
      prize_distribution: prizeDistribution,
      entry_fee: entryFee,
      is_private: isPrivate,
      status: 'waiting'
      // timer_started verrà settato automaticamente a false dal DEFAULT del database
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Ottieni tutte le partite in attesa (solo pubbliche)
export async function getWaitingGames() {
  const { data, error } = await supabase
    .from('games')
    .select('*, profiles!games_created_by_profiles_fkey(username)')
    .eq('status', 'waiting')
    .eq('is_private', false)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Ottieni una partita tramite codice invito
export async function getGameByInviteCode(inviteCode) {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('invite_code', inviteCode)
    .eq('status', 'waiting')
    .single();

  if (error) throw error;
  return data;
}

// Piazza una puntata
export async function placeBet(gameId, horseNumber, amount, chips = 1) {
  const user = await supabase.auth.getUser();
  if (!user.data.user) throw new Error('Devi essere loggato');

  // Verifica saldo (più avanti implementeremo il wallet)

  console.log('User ID da JWT:', user.data.user.id);
  console.log('Dati da inserire:', {
    game_id: gameId,
    user_id: user.data.user.id,
    horse_number: horseNumber,
    amount: amount,
    chips: chips
  });

  // Prima recupera la puntata esistente per questo cavallo (se esiste)
  const { data: existingBet } = await supabase
    .from('bets')
    .select('*')
    .eq('game_id', gameId)
    .eq('user_id', user.data.user.id)
    .eq('horse_number', horseNumber)
    .single();

  // Se esiste, somma al totale esistente
  const newAmount = existingBet ? existingBet.amount + amount : amount;
  const newChips = existingBet ? (existingBet.chips || 0) + chips : chips;

  console.log(`📊 Aggiorno puntata: €${newAmount.toFixed(2)} (${newChips} fiches)`);

  // Usa UPSERT per aggiornare/creare la puntata per questo cavallo
  const { data, error } = await supabase
    .from('bets')
    .upsert({
      game_id: gameId,
      user_id: user.data.user.id,
      horse_number: horseNumber,
      amount: newAmount,
      chips: newChips
    }, {
      onConflict: 'game_id,user_id,horse_number'
    })
    .select()
    .single();

  if (error) {
    console.error('Errore upsert bets:', error);
    throw error;
  }

  console.log('Puntata salvata con successo:', data);
  return data;
}

// Ottieni le puntate di una partita
export async function getGameBets(gameId) {
  const { data, error } = await supabase
    .from('bets')
    .select('*, profiles!bets_user_id_profiles_fkey(username)')
    .eq('game_id', gameId);

  if (error) throw error;
  return data;
}

// Inizia la partita (solo il creatore)
export async function startGame(gameId) {
  const { data, error } = await supabase
    .from('games')
    .update({
      status: 'running',
      started_at: new Date().toISOString()
    })
    .eq('id', gameId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Termina la partita e assegna vincite
export async function finishGame(gameId, winnerHorse) {
  const { data, error } = await supabase
    .from('games')
    .update({
      status: 'finished',
      winner_horse: winnerHorse,
      finished_at: new Date().toISOString()
    })
    .eq('id', gameId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Subscribe a una partita per ricevere aggiornamenti in tempo reale
export function subscribeToGame(gameId, onUpdate) {
  return supabase
    .channel(`game:${gameId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
      onUpdate
    )
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'bets', filter: `game_id=eq.${gameId}` },
      onUpdate
    )
    .subscribe();
}
