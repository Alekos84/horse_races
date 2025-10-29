import { supabase } from './main.js';

const BETTING_TIMEOUT = 30000; // 30 secondi in millisecondi
let bettingTimer = null;

// Inizia un nuovo round di scommesse
export async function startBettingRound(gameId, roundNumber, startTimer = true) {
  const { error } = await supabase
    .from('games')
    .update({
      current_round: roundNumber,
      betting_phase: true,
      round_started_at: new Date().toISOString()
      // NON resettare cards_drawn - mantieni le carte precedenti
    })
    .eq('id', gameId);

  if (error) throw error;

  // Avvia il timer solo se richiesto (round 2+)
  if (startTimer) {
    startBettingTimer(gameId, roundNumber);
  } else {
    console.log('⏸️ Timer NON avviato - round 1, attendo prima scommessa');
  }
}

// Timer che chiude automaticamente la finestra dopo 30 secondi
export function startBettingTimer(gameId, roundNumber) {
  if (bettingTimer) clearTimeout(bettingTimer);

  console.log('⏰ Timer scommesse avviato: 30 secondi');

  bettingTimer = setTimeout(async () => {
    console.log('⏰ Timeout! Chiudo finestra automaticamente');
    await closeBettingWindow(gameId, roundNumber, true);
  }, BETTING_TIMEOUT);
}

// Triggera il timer per tutti i giocatori (chiamato dal primo che scommette nel round 1)
export async function triggerTimerForAll(gameId, roundNumber) {
  console.log('🚀 Giocatore ha scommesso, verifico se devo triggerare timer...');

  // Controlla se il timer è già stato avviato
  const { data: game } = await supabase
    .from('games')
    .select('timer_started')
    .eq('id', gameId)
    .single();

  if (game && game.timer_started) {
    console.log('⏭️ Timer già avviato da un altro giocatore, skip');
    return;
  }

  console.log('✅ Sono il primo! Triggero timer per tutti...');

  // Salva nel DB che il timer è iniziato
  const { error } = await supabase
    .from('games')
    .update({
      timer_started: true,
      timer_started_at: new Date().toISOString()
    })
    .eq('id', gameId)
    .eq('timer_started', false); // Aggiorna solo se ancora false (evita race condition)

  if (error) {
    console.error('Errore trigger timer:', error);
    return;
  }

  // Avvia anche il timer locale per questo giocatore
  startBettingTimer(gameId, roundNumber);
}

// Chiudi la finestra scommesse per il giocatore corrente
export async function closeBettingWindow(gameId, roundNumber, isTimeout = false) {
  const user = await supabase.auth.getUser();
  if (!user.data.user) return;

  // Salva lo stato "finestra chiusa"
  const { error } = await supabase
    .from('player_states')
    .upsert({
      game_id: gameId,
      user_id: user.data.user.id,
      round_number: roundNumber,
      betting_window_closed: true,
      closed_at: new Date().toISOString()
    }, {
      onConflict: 'game_id,user_id,round_number'
    });

  if (error) {
    console.error('Errore chiusura finestra:', error);
    return;
  }

  console.log(isTimeout ? 'Finestra chiusa per timeout' : 'Finestra chiusa manualmente');

  // Nascondi il pannello localmente
  const bettingPanel = document.getElementById('bettingPanel');
  if (bettingPanel) {
    bettingPanel.style.display = 'none';
  }

  // Ferma il timer locale
  if (bettingTimer) {
    clearTimeout(bettingTimer);
    bettingTimer = null;
  }

  // Ferma anche il countdown visivo
  if (window.bettingInterval) {
    clearInterval(window.bettingInterval);
    window.bettingInterval = null;
  }

  // Verifica se tutti hanno chiuso
  await checkAllPlayersClosed(gameId, roundNumber);
}

// Verifica se tutti i giocatori hanno chiuso la finestra
async function checkAllPlayersClosed(gameId, roundNumber) {
  // Ottieni la partita per vedere chi l'ha creata
  const { data: game } = await supabase
    .from('games')
    .select('created_by')
    .eq('id', gameId)
    .single();

  if (!game) return;

  // Ottieni l'utente corrente
  const user = await supabase.auth.getUser();
  if (!user.data.user) return;

  // Solo il creatore della partita pesca le carte
  const isCreator = user.data.user.id === game.created_by;

  // Ottieni tutti i partecipanti della stanza da game_participants
  const { data: participants, error: participantsError } = await supabase
    .from('game_participants')
    .select('user_id')
    .eq('game_id', gameId);

  if (participantsError || !participants || participants.length === 0) {
    console.log('⚠️ Nessun partecipante trovato nella stanza');
    return;
  }

  const totalParticipants = participants.length;
  console.log(`👥 Totale partecipanti nella stanza: ${totalParticipants}`);

  // Ottieni gli stati delle finestre chiuse
  const { data: states } = await supabase
    .from('player_states')
    .select('*')
    .eq('game_id', gameId)
    .eq('round_number', roundNumber)
    .eq('betting_window_closed', true);

  if (!states) return;

  console.log(`📊 Stati chiusura: ${states.length}/${totalParticipants} giocatori hanno chiuso`);

  // Se tutti i partecipanti hanno chiuso, pesca le carte immediatamente
  if (states.length >= totalParticipants) {
    console.log('✅ Tutti hanno chiuso! Pesco le carte e le salvo nel DB...');

    // Chiunque rilevi che tutti hanno chiuso, chiama drawCards
    // (Supabase gestirà eventuali conflitti con transazioni)
    await drawCards(gameId);
  }
}

// Pesca 5 carte dal mazzo locale e salvale nel DB
async function drawCards(gameId) {
  console.log('🎴 Inizio pescaggio 5 carte...');

  // Verifica se le carte sono già state pescate (evita duplicati) e leggi current_round e current_card_index
  const { data: currentGame } = await supabase
    .from('games')
    .select('cards_drawn, betting_phase, current_round, current_card_index')
    .eq('id', gameId)
    .single();

  if (currentGame && currentGame.cards_drawn && currentGame.cards_drawn.length > 0) {
    console.log('⏭️ Carte già pescate da un altro client, skip');
    return;
  }

  if (currentGame && !currentGame.betting_phase) {
    console.log('⏭️ betting_phase già false, un altro client sta pescando, skip');
    return;
  }

  const currentRound = currentGame?.current_round || 1;
  const currentIndex = currentGame?.current_card_index || 0;  // Leggi dal database!

  if (!window.gameState || !window.gameState.deck) {
    console.error('❌ Mazzo non trovato!');
    return;
  }

  const deck = window.gameState.deck;

  // DEBUG: mostra stato mazzo prima di pescare
  console.log('🔍 DEBUG MAZZO:');
  console.log('- gameState.deck.length:', window.gameState.deck.length);
  console.log('- gameState.currentCardIndex:', window.gameState.currentCardIndex);
  console.log('- Prossime 5 carte che verranno pescate:', window.gameState.deck.slice(currentIndex, currentIndex + 5));

  // Pesca 5 carte dal mazzo
  const drawnCards = [];
  for (let i = 0; i < 5 && currentIndex + i < deck.length; i++) {
    const card = deck[currentIndex + i];
    const horse = window.gameState.horses.find(h => h.suit === card.suit);

    drawnCards.push({
      suit: card.suit,
      value: card.value,
      horseNumber: horse ? (window.gameState.horses.indexOf(horse) + 1) : 1
    });
  }

  // Aggiorna l'indice locale
  window.gameState.currentCardIndex = currentIndex + drawnCards.length;

  console.log('Carte pescate:', drawnCards);

  // Salva nel database (sovrascrivi, non appendere - il client terrà traccia)
  console.log('🎴 Tento UPDATE su games con gameId:', gameId);
  console.log('🎴 Dati da salvare:', { betting_phase: false, cards_drawn: drawnCards });

  const nextRound = currentRound + 1;

  // Prima salva le carte estratte con betting_phase: false e aggiorna current_card_index
  // Usa .eq('betting_phase', true) per evitare race condition: solo UN client può aggiornare
  const newCardIndex = currentIndex + drawnCards.length;
  const { data, error } = await supabase
    .from('games')
    .update({
      betting_phase: false,
      cards_drawn: drawnCards,
      current_round: currentRound,  // Mantieni il round corrente per ora
      current_card_index: newCardIndex  // Aggiorna l'indice nel database
    })
    .eq('id', gameId)
    .eq('betting_phase', true);  // Solo se è ancora true (protezione race condition)

  console.log('🎴 Risposta UPDATE - data:', data, 'error:', error);

  if (error) {
    console.error('❌ Errore salvataggio carte:', error);
    return;
  }

  console.log('✅ Carte salvate nel database');

  // Dopo un delay, se ci sono altri round, apri il prossimo round
  if (nextRound <= 8) {
    console.log(`🔄 Preparazione round ${nextRound}...`);

    // Aspetta che i client abbiano processato le carte (delay di 8 secondi = 5 carte * 1.5s + margine)
    setTimeout(async () => {
      console.log(`🎯 Apro round ${nextRound} di scommesse...`);

      await supabase
        .from('games')
        .update({
          betting_phase: true,
          cards_drawn: [],  // Resetta le carte per il prossimo round
          current_round: nextRound
        })
        .eq('id', gameId);

      console.log(`✅ Round ${nextRound} aperto per le scommesse`);
    }, 8000);
  }
}

// Sottoscrivi agli aggiornamenti di una partita
export function subscribeToGameUpdates(gameId, callbacks) {
  console.log('📡 Creazione subscription per game:', gameId);

  const channel = supabase
    .channel(`game_updates:${gameId}`)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
      (payload) => {
        console.log('📨 Ricevuto evento UPDATE su games:', payload);
        if (callbacks.onGameUpdate) callbacks.onGameUpdate(payload.new);
      }
    )
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'player_states', filter: `game_id=eq.${gameId}` },
      (payload) => {
        console.log('📨 Ricevuto evento su player_states:', payload);
        if (callbacks.onPlayerStateUpdate) callbacks.onPlayerStateUpdate(payload);
      }
    )
    .subscribe();

  console.log('✅ Channel creato:', channel);

  return channel;
}

// Mostra quanti giocatori hanno chiuso la finestra
export async function getPlayersStatus(gameId, roundNumber) {
  const { data: states } = await supabase
    .from('player_states')
    .select('user_id, betting_window_closed, profiles!player_states_user_id_profiles_fkey(username)')
    .eq('game_id', gameId)
    .eq('round_number', roundNumber);

  return states || [];
}
