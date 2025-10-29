import { createGame, getWaitingGames, placeBet, getGameBets, startGame, subscribeToGame } from './game-multiplayer.js';
import { getCurrentUser } from './auth.js';
import { supabase } from './main.js';
import { startBettingRound, closeBettingWindow, subscribeToGameUpdates, getPlayersStatus, startBettingTimer } from './betting-sync.js';
import { openMultiplayerBetting, updatePlayersStatus, startBettingCountdown, updateTotalPool } from './multiplayer-betting.js';

let currentGameId = null;
let gameSubscription = null;
let bettingSubscription = null;

// Mostra la lobby (lista stanze)
export async function showLobby() {
  const lobbyContainer = document.getElementById('lobby-container');
  if (!lobbyContainer) {
    console.error('Container lobby non trovato');
    return;
  }

  lobbyContainer.innerHTML = `
    <button onclick="backToModeSelection()" class="btn-secondary" style="margin-bottom: 20px;">← Indietro</button>
    <div class="lobby-header">
      <h2>Stanze Multiplayer</h2>
      <button id="create-room-btn" class="btn-primary">Crea Nuova Stanza</button>
      <button id="refresh-rooms-btn" class="btn-secondary">Aggiorna</button>
    </div>
    <div id="rooms-list" class="rooms-list">
      <p>Caricamento stanze...</p>
    </div>
  `;

  document.getElementById('create-room-btn').addEventListener('click', showCreateRoomForm);
  document.getElementById('refresh-rooms-btn').addEventListener('click', loadRooms);

  await loadRooms();
}

// Carica lista stanze disponibili
async function loadRooms() {
  const roomsList = document.getElementById('rooms-list');
  roomsList.innerHTML = '<p>Caricamento...</p>';

  try {
    const currentUser = await getCurrentUser();
    const currentUserId = currentUser?.id;

    // Mostra sia stanze in attesa che stanze in corso
    const { data: games, error } = await supabase
      .from('games')
      .select('*, profiles!games_created_by_profiles_fkey(username)')
      .in('status', ['waiting', 'running'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!games || games.length === 0) {
      roomsList.innerHTML = '<p class="no-rooms">Nessuna stanza disponibile. Creane una!</p>';
      return;
    }

    roomsList.innerHTML = games.map(game => {
      const isOwner = game.created_by === currentUserId;
      const isStarted = game.status !== 'waiting';

      return `
        <div class="room-card">
          <div class="room-info">
            <h3>Stanza #${game.id.slice(0, 8)}</h3>
            <p>Creata da: ${game.profiles?.username || 'Sconosciuto'}</p>
            <p>Cavalli: ${game.num_horses} | Max giocatori: ${game.max_players}</p>
            ${game.entry_fee > 0 ? `<p>Entry fee: ${game.entry_fee} coins</p>` : '<p>Gratuita</p>'}
            ${isStarted ? '<p style="color: #ff6b35; font-weight: bold;">🏁 In corso</p>' : '<p style="color: #4a7c59;">⏳ In attesa</p>'}
          </div>
          <div class="room-actions">
            <button class="btn-join" onclick="window.joinRoom('${game.id}')">
              ${isStarted ? 'Rientra' : 'Entra'}
            </button>
            ${isOwner && !isStarted ? `
              <button class="btn-delete" onclick="window.deleteRoom('${game.id}')">
                Elimina
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    roomsList.innerHTML = `<p class="error">Errore caricamento stanze: ${error.message}</p>`;
  }
}

// Esponi deleteRoom globalmente con logging
window.deleteRoom = async function(gameId) {
  if (!confirm('Sei sicuro di voler eliminare questa stanza?')) return;

  console.log('🗑️ Tentativo eliminazione stanza:', gameId);

  const { data, error } = await supabase
    .from('games')
    .delete()
    .eq('id', gameId);

  console.log('🗑️ Risposta delete - data:', data, 'error:', error);

  if (error) {
    console.error('❌ Errore eliminazione:', error);
    alert('Errore eliminazione: ' + error.message);
  } else {
    console.log('✅ Stanza eliminata con successo');
    alert('Stanza eliminata!');
    await loadRooms();
  }
};

// Form per creare una stanza
function showCreateRoomForm() {
  const lobbyContainer = document.getElementById('lobby-container');
  lobbyContainer.innerHTML = `
    <div class="create-room-form">
      <h2>Configura Stanza Multiplayer</h2>

      <label>Numero Cavalli:
        <select id="room-horses">
          <option value="4" selected>4 Cavalli</option>
          <option value="5">5 Cavalli</option>
          <option value="6">6 Cavalli</option>
          <option value="7">7 Cavalli</option>
          <option value="8">8 Cavalli</option>
        </select>
      </label>

      <label>Max Giocatori:
        <input type="number" id="room-max-players" min="2" max="10" value="3">
      </label>

      <label>Valore Iniziale Fiches (€):
        <input type="number" id="room-initial-chips" step="0.01" min="0.10" value="0.20">
      </label>

      <label>Importo Max per Finestra (€):
        <input type="number" id="room-max-bet" step="0.01" min="0.50" value="2.00">
      </label>

      <label>Distribuzione Premi:
        <select id="room-prize-distribution">
          <option value="winner-takes-all" selected>Solo 1° posto</option>
          <option value="top-2" disabled>1° e 2° posto (min 5 cavalli)</option>
          <option value="top-3" disabled>1°, 2° e 3° posto (8 cavalli)</option>
        </select>
      </label>

      <label>Entry Fee (coins virtuali):
        <input type="number" id="room-entry-fee" min="0" value="0">
      </label>

      <label class="checkbox-label">
        <span>Stanza privata (solo invito)</span>
        <label class="switch">
          <input type="checkbox" id="room-is-private">
          <span class="slider"></span>
        </label>
      </label>

      <div class="form-actions">
        <button id="create-room-confirm" class="btn-primary">Crea Stanza</button>
        <button id="create-room-cancel" class="btn-secondary">Annulla</button>
      </div>
      <div id="create-room-message"></div>
    </div>
  `;

  // Funzione per aggiornare le opzioni di distribuzione premi in base al numero di cavalli
  function updatePrizeDistributionOptions() {
    const numHorses = parseInt(document.getElementById('room-horses').value);
    const select = document.getElementById('room-prize-distribution');

    // Abilita tutte le opzioni
    for (let i = 0; i < select.options.length; i++) {
      select.options[i].disabled = false;
    }

    // Disabilita in base al numero di cavalli
    if (numHorses < 5) {
      select.options[1].disabled = true; // top-2
      select.options[2].disabled = true; // top-3
      select.value = 'winner-takes-all';
    } else if (numHorses < 8) {
      select.options[2].disabled = true; // top-3
      if (select.value === 'top-3') select.value = 'top-2';
    }
  }

  // Aggiungi listener per aggiornare le opzioni quando cambia il numero di cavalli
  document.getElementById('room-horses').addEventListener('change', updatePrizeDistributionOptions);

  // Chiama subito per inizializzare
  updatePrizeDistributionOptions();

  document.getElementById('create-room-confirm').addEventListener('click', createRoomHandler);
  document.getElementById('create-room-cancel').addEventListener('click', showLobby);
}

async function createRoomHandler() {
  const horses = parseInt(document.getElementById('room-horses').value);
  const maxPlayers = parseInt(document.getElementById('room-max-players').value);
  const initialChips = parseFloat(document.getElementById('room-initial-chips').value);
  const maxBet = parseFloat(document.getElementById('room-max-bet').value);
  const prizeDistribution = document.getElementById('room-prize-distribution').value;
  const entryFee = parseInt(document.getElementById('room-entry-fee').value);
  const isPrivate = document.getElementById('room-is-private').checked;
  const messageEl = document.getElementById('create-room-message');

  try {
    const game = await createGame(horses, maxPlayers, initialChips, maxBet, prizeDistribution, entryFee, isPrivate);

    if (game.is_private) {
      const inviteLink = window.location.origin + '?join=' + game.invite_code;
      messageEl.innerHTML = `
        <p class="success">Stanza privata creata!</p>
        <p>Condividi questo link con gli amici:</p>
        <input type="text" value="${inviteLink}" readonly onclick="this.select()" style="width:100%; padding:8px; margin:10px 0;">
        <button onclick="window.joinRoom('${game.id}')" class="btn-primary">Entra nella Stanza</button>
      `;
    } else {
      messageEl.innerHTML = '<p class="success">Stanza creata!</p>';
      setTimeout(() => joinRoom(game.id), 1000);
    }
  } catch (error) {
    messageEl.innerHTML = `<p class="error">${error.message}</p>`;
  }
}

// Entra in una stanza
export async function joinRoom(gameId) {
  console.log('⚠️ joinRoom() chiamata - questo dovrebbe succedere SOLO quando entri nella stanza la prima volta!');
  console.log('⚠️ Stack trace:', new Error().stack);

  currentGameId = gameId;

  // Ottieni l'utente corrente
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    alert('Devi essere loggato');
    return;
  }

  // Registra l'utente come partecipante nella tabella game_participants
  const { error: participantError } = await supabase
    .from('game_participants')
    .upsert({
      game_id: gameId,
      user_id: currentUser.id
    }, {
      onConflict: 'game_id,user_id'
    });

  if (participantError) {
    console.error('Errore registrazione partecipante:', participantError);
  } else {
    console.log('✅ Partecipante registrato nella stanza');
  }

  // 1. Nascondi lobby
  document.getElementById('lobby-container').style.display = 'none';

  // 2. Carica dati stanza e imposta gameState
  const { data: game, error } = await supabase.from('games').select('*').eq('id', gameId).single();
  if (error) {
    alert('Errore caricamento stanza: ' + error.message);
    return;
  }

  // Converti prize_distribution da stringa a numero per compatibilità
  let prizeDistValue = 1;
  if (game.prize_distribution === 'top-2') prizeDistValue = 2;
  else if (game.prize_distribution === 'top-3') prizeDistValue = 3;

  window.gameState.gameConfig = {
    numHorses: game.num_horses,
    numParticipants: game.max_players,
    initialChipValue: game.initial_chips,
    maxAmountPerWindow: game.max_bet,
    prizeDistribution: prizeDistValue
  };

  console.log('🎮 Game config impostata:', window.gameState.gameConfig);

  // Flag per modalità multiplayer
  window.gameState.isMultiplayer = true;
  window.gameState.currentGameId = gameId;

  // 3. NASCONDI elementi del gioco finché non inizia la partita
  document.getElementById('racetrack').style.display = 'none';
  document.getElementById('bettingPanel').style.display = 'none';
  document.getElementById('gameLog').style.display = 'none';

  // Nascondi anche la sezione carte
  const cardsSection = document.getElementById('cardsSection');
  if (cardsSection) {
    cardsSection.style.display = 'none';
    console.log('✅ cardsSection nascosto in joinRoom (sarà mostrato all\'avvio)');
  }

  // 4. Inizializza il gioco (chiama funzioni globali dall'index.html)
  // Resetta horses e deck per partire da zero
  window.gameState.horses = [];
  window.gameState.deck = [];
  window.gameState.currentCardIndex = 0;
  window.gameState.totalCardsProcessed = 0;  // Reset contatore carte

  // Reset display contatori
  const cardsDrawnEl = document.getElementById('cardsDrawn');
  if (cardsDrawnEl) cardsDrawnEl.textContent = '0';

  const currentWindowEl = document.getElementById('currentWindow');
  if (currentWindowEl) currentWindowEl.textContent = '1';

  const totalPoolEl = document.getElementById('totalPool');
  if (totalPoolEl) totalPoolEl.textContent = '0.00';

  console.log('🐴 Reset gameState.horses e deck prima di initializeHorses');

  window.initializeHorses();
  console.log('🐴 Dopo initializeHorses, horses.length:', window.gameState.horses.length);

  // Tutti i client creano lo stesso mazzo usando gameId come seed
  // Converte gameId (UUID) in un numero per il seed
  const seed = parseInt(gameId.replace(/-/g, '').substring(0, 8), 16);
  window.createNeapolitanDeck(seed);
  console.log('🃏 Mazzo creato con seed:', seed, 'deck.length:', window.gameState.deck.length);

  window.createHorseTracks(); // Crea le piste con le immagini dei cavalli
  window.setupUI();

  // Nascondi bottone "Inizia Partita" del gioco locale
  const startLocalButton = document.querySelector('button[onclick="startGame()"]');
  if (startLocalButton) startLocalButton.style.display = 'none';

  // Nascondi bottone "Pesca Carta" (già dovrebbe essere nascosto, ma forziamolo)
  const drawButton = document.getElementById('drawButton');
  if (drawButton) drawButton.style.display = 'none';

  // Nascondi bottone "Chiudi Finestra Scommesse" del gioco locale
  const closeBettingBtn = document.getElementById('closeBettingBtn');
  if (closeBettingBtn) closeBettingBtn.style.display = 'none';

  // Rimuovi il bottone "Inizia Corsa" se esiste già
  let existingStartBtn = document.getElementById('start-race-btn');
  if (existingStartBtn) existingStartBtn.remove();

  // Crea header della stanza
  const container = document.querySelector('.container');
  let roomHeader = document.getElementById('room-header');
  if (!roomHeader) {
    roomHeader = document.createElement('div');
    roomHeader.id = 'room-header';
    roomHeader.style.cssText = 'background: rgba(0,0,0,0.3); padding: 15px; border-radius: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;';
    container.insertBefore(roomHeader, document.getElementById('racetrack'));
  }

  roomHeader.innerHTML = `
    <h2 style="margin: 0; color: white;">🌐 Stanza Multiplayer #${gameId.slice(0, 8)}</h2>
    <button id="leave-room-btn" class="btn-secondary">Esci dalla Stanza</button>
  `;

  // Crea sezione giocatori
  let playersSection = document.getElementById('players-section');
  if (!playersSection) {
    playersSection = document.createElement('div');
    playersSection.id = 'players-section';
    playersSection.style.cssText = 'background: rgba(0,0,0,0.3); padding: 20px; border-radius: 10px; margin-bottom: 15px;';
    container.insertBefore(playersSection, document.getElementById('bettingPanel'));
  }

  playersSection.innerHTML = `
    <h3 style="color: white; margin-bottom: 15px;">👥 Giocatori in Stanza</h3>
    <div id="players-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;"></div>
  `;

  document.getElementById('leave-room-btn').addEventListener('click', leaveRoom);

  // Mostra modal di attesa giocatori PRIMA di creare la subscription
  showWaitingRoomModal(gameId, game.created_by, currentUser.id);

  // Sottoscrivi agli aggiornamenti in tempo reale
  bettingSubscription = subscribeToGameUpdates(gameId, {
    onGameUpdate: async (game) => {
      console.log('🎴 CALLBACK TRIGGERATO - Ricevuto aggiornamento game:', game);
      console.log('🔍 betting_phase:', game.betting_phase, 'current_round:', game.current_round);
      console.log('🔍 status:', game.status);
      console.log('🔍 Confronto status: game.status === "running"?', game.status === 'running');

      // Se lo status passa a running, chiudi sala d'attesa e apri finestra scommesse
      if (game.status === 'running') {
        console.log('✅ Status è running, procedo con apertura partita...');
        const waitingOverlay = document.getElementById('waiting-room-overlay');
        if (waitingOverlay) {
          console.log('🎮 Partita avviata, chiudo sala d\'attesa');
          waitingOverlay.remove();

          // MOSTRA tutti gli elementi del gioco
          document.getElementById('racetrack').style.display = 'block';
          document.getElementById('bettingPanel').style.display = 'block';
          document.getElementById('gameLog').style.display = 'block';
          const cardsSection = document.getElementById('cardsSection');
          if (cardsSection) cardsSection.style.display = 'block';

          // Ottieni username corrente
          const currentUser = await getCurrentUser();
          const username = currentUser?.user_metadata?.username || currentUser?.email.split('@')[0] || 'Giocatore';

          // Apri finestra scommesse per tutti (round 1 SENZA timer)
          openMultiplayerBetting(
            gameId,
            1,
            username,
            window.gameState.gameConfig.initialChipValue,
            window.gameState.gameConfig.maxAmountPerWindow,
            false  // NO timer automatico nel round 1
          );

          // Solo il creatore avvia il round (SENZA timer)
          const isCreator = game.created_by === currentUser.id;
          if (isCreator) {
            console.log('🎮 Sono il creatore, avvio il primo round di scommesse...');
            await startBettingRound(gameId, 1, false);  // NO timer automatico
          }

          await loadRoomData(gameId);
          subscribeToRoom(gameId);
        }
      }

      // Quando il timer viene triggerato dal primo giocatore (round 1)
      if (game.timer_started && game.current_round === 1) {
        console.log('⏰ Timer triggerato dal primo giocatore, avvio countdown e timer server-side...');

        // Avvia il countdown visivo
        startBettingCountdown(gameId, 1);

        // Avvia anche il timer che chiude la finestra dopo 10 secondi
        startBettingTimer(gameId, 1);

        // Resetta il flag per evitare re-trigger
        await supabase.from('games').update({ timer_started: false }).eq('id', gameId);
      }

      // Quando inizia un nuovo round di scommesse (round 2+)
      if (game.betting_phase && game.current_round > 1 && (!game.cards_drawn || game.cards_drawn.length === 0)) {
        console.log(`🎯 Nuovo round di scommesse: ${game.current_round}`);

        // Verifica che la finestra non sia già aperta
        const bettingPanel = document.getElementById('bettingPanel');
        if (bettingPanel && bettingPanel.style.display === 'none') {
          const currentUser = await getCurrentUser();
          const username = currentUser?.user_metadata?.username || currentUser?.email.split('@')[0] || 'Giocatore';

          // Apri finestra scommesse per il round corrente (CON timer automatico per round 2+)
          openMultiplayerBetting(
            gameId,
            game.current_round,
            username,
            window.gameState.gameConfig.initialChipValue,
            window.gameState.gameConfig.maxAmountPerWindow,
            true  // Timer automatico per round 2+
          );

          // TUTTI i giocatori avviano il timer server-side (10 secondi)
          // La protezione race condition in drawCards() eviterà duplicati
          console.log(`⏰ Avvio timer per round ${game.current_round}...`);
          startBettingTimer(gameId, game.current_round);
        }
      }

      // Quando la fase di scommesse finisce, processa le carte dal database
      if (!game.betting_phase && game.current_round && game.cards_drawn && game.cards_drawn.length > 0) {
        console.log(`🎴 Fine scommesse round ${game.current_round}, processo carte dal database...`);
        console.log('🎴 Carte ricevute:', game.cards_drawn);

        // Inizializza il contatore totale carte se non esiste
        if (!window.gameState.totalCardsProcessed) {
          window.gameState.totalCardsProcessed = 0;
        }

        // Mappa dei movimenti delle carte
        const CARD_MOVEMENT = {
          'Asso': -1,
          '2': 1, '3': 1, '4': 1, '5': 1, '6': 1, '7': 1,
          'Donna': 3,
          'Fante': 3,  // Aggiunto per compatibilità con createNeapolitanDeck
          'Cavallo': 3,
          'Re': 3
        };

        // Processa ogni carta dal database
        for (let i = 0; i < game.cards_drawn.length; i++) {
          const card = game.cards_drawn[i];
          console.log(`🎴 Processando carta ${i + 1}:`, card);

          await new Promise(resolve => setTimeout(resolve, 1500));

          // Trova il cavallo corrispondente al seme della carta
          const horse = window.gameState.horses.find(h => h.suit === card.suit);
          if (!horse) {
            console.warn('⚠️ Cavallo non trovato per seme:', card.suit);
            continue;
          }

          const horseIndex = window.gameState.horses.indexOf(horse);

          // Calcola il movimento
          const movement = CARD_MOVEMENT[card.value] || 0;
          const oldPosition = horse.position;
          const newPosition = Math.max(0, Math.min(20, oldPosition + movement));

          console.log('Carta:', card, 'Cavallo da muovere:', horseIndex, 'Posizione vecchia:', oldPosition, 'Nuova posizione:', newPosition);

          // Aggiorna la posizione nel gameState
          horse.position = newPosition;

          // Anima il cavallo usando la funzione del gioco locale
          if (typeof window.animateHorse === 'function') {
            window.animateHorse(horseIndex, newPosition);
          }

          // Mostra la carta estratta
          if (typeof window.displayCurrentCard === 'function') {
            window.displayCurrentCard(card);
          }

          // Aggiungi la carta all'array drawnCards PRIMA di aggiungerla allo stack
          if (!window.gameState.drawnCards) {
            window.gameState.drawnCards = [];
          }
          window.gameState.drawnCards.push(card);

          // Aggiungi carta allo stack
          if (typeof window.addCardToStack === 'function') {
            window.addCardToStack(card);
          }

          // Aggiungi al log
          if (typeof window.addLogEntry === 'function') {
            window.addLogEntry(`🎴 Estratta ${card.value} di ${card.suit}: ${horse.name} si muove di ${movement}`);
          }

          // Aggiorna il contatore delle carte
          window.gameState.totalCardsProcessed++;
          const cardsDrawnEl = document.getElementById('cardsDrawn');
          if (cardsDrawnEl) {
            cardsDrawnEl.textContent = window.gameState.totalCardsProcessed;
          }

          // Controlla se la corsa è finita
          if (typeof window.isRaceFinished === 'function' && window.isRaceFinished()) {
            console.log('🏁 La corsa è finita!');
            setTimeout(() => {
              if (typeof window.endGame === 'function') {
                window.endGame();
              }
            }, 1000);
            return;
          }
        }

        // Dopo aver processato tutte le carte, apri la prossima finestra se non siamo alla fine
        const currentRound = game.current_round || 1;
        const nextRound = currentRound + 1;

        if (nextRound <= 8) {
          console.log(`🎯 Fine round ${currentRound}, preparazione round ${nextRound}...`);

          setTimeout(async () => {
            console.log(`🔄 Fine round ${currentRound}, attendo che il server prepari round ${nextRound}...`);

            // NON fare update qui! Lascia che drawCards() aggiorni atomicamente:
            // - betting_phase: true
            // - cards_drawn: []
            // - current_round: nextRound

            // Il server triggererà un update Realtime che aprirà la finestra per tutti
          }, 2000);
        }

        return;
      }
    },
    onPlayerStateUpdate: async (payload) => {
      // Aggiorna la lista giocatori quando qualcuno chiude la finestra
      console.log('Stato giocatore aggiornato:', payload);
      await loadRoomData(gameId);
    }
  });

  console.log('✅ Subscription attiva:', bettingSubscription);
}

async function startRaceHandler() {
  try {
    await startGame(currentGameId);
    alert('Corsa iniziata!');
  } catch (error) {
    alert('Errore: ' + error.message);
  }
}

async function loadRoomData(gameId) {
  try {
    // Leggi TUTTI i partecipanti della stanza
    const { data: participants, error: participantsError } = await supabase
      .from('game_participants')
      .select('user_id, profiles!game_participants_user_id_profiles_fkey(username)')
      .eq('game_id', gameId);

    console.log('🔍 DEBUG participants:', JSON.stringify(participants, null, 2));
    console.log('🔍 DEBUG participantsError:', participantsError);

    // Verifica manualmente se i profili esistono
    for (const p of participants) {
      const { data: profileCheck } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', p.user_id)
        .single();
      console.log(`🔍 Profilo per user ${p.user_id}:`, profileCheck);
    }

    if (participantsError) throw participantsError;

    // Leggi TUTTE le puntate della partita
    const { data: allBets, error: betsError } = await supabase
      .from('bets')
      .select('*')
      .eq('game_id', gameId);

    if (betsError) throw betsError;

    // Mostra lista giocatori e loro puntate
    const playersList = document.getElementById('players-list');
    if (playersList) {
      // Crea mappa di puntate per user_id
      const betsMap = {};
      allBets?.forEach(bet => {
        if (!betsMap[bet.user_id]) {
          betsMap[bet.user_id] = {
            bets: [],
            totalSpent: 0
          };
        }
        betsMap[bet.user_id].bets.push(bet);
        betsMap[bet.user_id].totalSpent += bet.amount;
      });

      // Mostra TUTTI i partecipanti
      if (!participants || participants.length === 0) {
        playersList.innerHTML = '<p style="color: #ccc; text-align: center;">Nessun giocatore nella stanza</p>';
      } else {
        playersList.innerHTML = participants.map(participant => {
          const userId = participant.user_id;
          const username = participant.profiles?.username || 'Sconosciuto';
          const playerBets = betsMap[userId];

          if (!playerBets || playerBets.bets.length === 0) {
            // Giocatore senza puntate
            return `
              <div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 8px;">
                <strong style="color: #4CAF50;">👤 ${username}</strong>
                <div style="font-size: 12px; color: #ccc; margin-top: 5px;">
                  Nessuna puntata
                </div>
                <div style="margin-top: 5px; font-weight: bold; color: white;">
                  Totale speso: €0.00
                </div>
              </div>
            `;
          } else {
            // Giocatore con puntate
            const lastBet = playerBets.bets[playerBets.bets.length - 1];
            const horseIndex = lastBet.horse_number - 1;
            const horse = window.gameState.horses[horseIndex];
            const horseName = horse ? horse.name : `Cavallo ${lastBet.horse_number}`;

            return `
              <div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 8px;">
                <strong style="color: #4CAF50;">👤 ${username}</strong>
                <div style="font-size: 12px; color: #ccc; margin-top: 5px;">
                  Ultima puntata: <span style="color: white;">${horseName}</span>
                </div>
                <div style="margin-top: 5px; font-weight: bold; color: white;">
                  Totale speso: €${playerBets.totalSpent.toFixed(2)}
                </div>
              </div>
            `;
          }
        }).join('');
      }
    }

  } catch (error) {
    console.error('Errore caricamento dati stanza:', error);
  }
}

async function placeBetHandler() {
  const horse = parseInt(document.getElementById('bet-horse').value);
  const amount = parseInt(document.getElementById('bet-amount').value);

  try {
    await placeBet(currentGameId, horse, amount);
    alert('Puntata piazzata!');
  } catch (error) {
    alert('Errore: ' + error.message);
  }
}

function updateBetsList(bets) {
  const betsList = document.getElementById('bets-list');
  if (bets.length === 0) {
    betsList.innerHTML = '<p>Nessuna puntata ancora</p>';
    return;
  }

  betsList.innerHTML = '<h4>Puntate:</h4>' + bets.map(bet => `
    <div class="bet-item">
      ${bet.profiles?.username || 'Anonimo'} ha puntato ${bet.amount} su Cavallo ${bet.horse_number}
    </div>
  `).join('');
}

function subscribeToRoom(gameId) {
  if (gameSubscription) gameSubscription.unsubscribe();

  gameSubscription = subscribeToGame(gameId, async (payload) => {
    console.log('Aggiornamento room:', payload);
    await loadRoomData(gameId);
  });
}

function leaveRoom() {
  if (gameSubscription) gameSubscription.unsubscribe();
  if (bettingSubscription) bettingSubscription.unsubscribe();
  currentGameId = null;

  // Nascondi elementi del gioco
  document.getElementById('racetrack').style.display = 'none';
  document.getElementById('bettingPanel').style.display = 'none';
  document.getElementById('gameLog').style.display = 'none';

  // Rimuovi elementi creati
  const roomHeader = document.getElementById('room-header');
  if (roomHeader) roomHeader.remove();

  const playersSection = document.getElementById('players-section');
  if (playersSection) playersSection.remove();

  const startRaceBtn = document.getElementById('start-race-btn');
  if (startRaceBtn) startRaceBtn.remove();

  // Mostra lobby
  document.getElementById('lobby-container').style.display = 'block';
  showLobby();
}

// Helper per calcolare il prezzo delle fiches in base alla posizione
function getChipPriceForHorse(position) {
  const basePrice = window.gameState.gameConfig.initialChipValue || 0.20;
  if (position >= 9) return basePrice * 3;
  if (position >= 7) return basePrice * 2;
  if (position >= 4) return basePrice * 1.5;
  return basePrice;
}

// Helper per ottenere il percorso dell'immagine della carta
function getCardImagePath(card) {
  const valueMap = {
    'Asso': 'asso',
    '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
    'Donna': 'donna',
    'Cavallo': 'cavallo',
    'Re': 're'
  };

  let suit = card.suit.toLowerCase().replace('_sic', '');
  const value = valueMap[card.value];
  const prefix = card.isSicilian ? 'sic_' : '';

  return `/cards/${suit}_${prefix}${value}.png`;
}

// Mostra modal di attesa giocatori
async function showWaitingRoomModal(gameId, creatorId, currentUserId) {
  // Rimuovi overlay precedente se esiste
  const existingOverlay = document.getElementById('waiting-room-overlay');
  if (existingOverlay) existingOverlay.remove();

  const isCreator = creatorId === currentUserId;

  const waitingOverlay = document.createElement('div');
  waitingOverlay.id = 'waiting-room-overlay';
  waitingOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  waitingOverlay.innerHTML = `
    <div class="waiting-room-modal" style="
      background: white;
      padding: 40px;
      border-radius: 12px;
      max-width: 500px;
      width: 90%;
      text-align: center;
    ">
      <h2 style="color: #2c5f2d; margin-bottom: 10px;">Sala d'Attesa</h2>
      <p style="color: #666; margin-bottom: 20px;">In attesa di altri giocatori...</p>
      <div id="waiting-players-list" style="
        background: #f8f9fa;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
        min-height: 100px;
      "></div>
      <button id="start-race-owner" class="btn-primary" style="display: ${isCreator ? 'inline-block' : 'none'}; margin-right: 10px;">
        Inizia Partita
      </button>
      <button id="leave-waiting-room" class="btn-secondary">Esci</button>
    </div>
  `;

  document.body.appendChild(waitingOverlay);

  // Carica lista giocatori
  await updateWaitingPlayersList(gameId);

  // Listener per bottone "Inizia Partita" (solo per il creatore)
  if (isCreator) {
    document.getElementById('start-race-owner').addEventListener('click', async () => {
      console.log('🎮 Creatore ha cliccato "Inizia Partita", verifico numero giocatori...');

      // Verifica che ci siano almeno 2 giocatori
      const { data: participants } = await supabase
        .from('game_participants')
        .select('user_id')
        .eq('game_id', gameId);

      if (!participants || participants.length < 2) {
        alert('⚠️ Servono almeno 2 giocatori per iniziare la partita!');
        return;
      }

      // Aggiorna lo stato del gioco a 'running' - questo triggerà il subscription per tutti
      const { error } = await supabase
        .from('games')
        .update({ status: 'running' })
        .eq('id', gameId);

      if (error) {
        console.error('Errore avvio partita:', error);
        alert('Errore avvio partita: ' + error.message);
        return;
      }

      console.log('✅ Stato gioco aggiornato a running, i client riceveranno l\'update via Realtime');
    });
  }

  // Listener per bottone "Esci"
  document.getElementById('leave-waiting-room').addEventListener('click', () => {
    waitingOverlay.remove();
    leaveRoom();
  });

  // Sottoscrivi agli aggiornamenti per aggiornare la lista giocatori
  subscribeToWaitingRoom(gameId);
}

// Aggiorna la lista dei giocatori nella sala d'attesa
async function updateWaitingPlayersList(gameId) {
  const playersList = document.getElementById('waiting-players-list');
  if (!playersList) return;

  // Ottieni informazioni sulla stanza (per sapere chi è il creatore)
  const { data: game } = await supabase
    .from('games')
    .select('created_by')
    .eq('id', gameId)
    .single();

  if (!game) {
    playersList.innerHTML = '<p style="color: #999;">Errore caricamento dati stanza</p>';
    return;
  }

  console.log('🔍 Caricamento partecipanti per game:', gameId);

  // Prova con il constraint name corretto
  const { data: participants, error } = await supabase
    .from('game_participants')
    .select('user_id, profiles!game_participants_user_id_profiles_fkey(username)')
    .eq('game_id', gameId);

  console.log('🔍 Partecipanti:', participants);
  console.log('🔍 Errore:', error);

  if (error) {
    console.error('Errore caricamento partecipanti:', error);
    playersList.innerHTML = '<p style="color: #999;">Errore caricamento partecipanti</p>';
    return;
  }

  if (!participants || participants.length === 0) {
    playersList.innerHTML = '<p style="color: #999;">Nessun giocatore nella stanza</p>';
    return;
  }

  // Genera HTML per ogni partecipante
  playersList.innerHTML = participants.map(p => {
    const username = p.profiles?.username || 'Giocatore';
    const isCreator = p.user_id === game.created_by;

    return `
      <div style="padding: 10px; background: white; border-radius: 6px; margin-bottom: 5px; color: #333;">
        👤 ${username} ${isCreator ? '<span style="color: #4a7c59; font-weight: bold;">(Creatore)</span>' : ''}
      </div>
    `;
  }).join('');
}

// Sottoscrivi agli aggiornamenti della sala d'attesa
function subscribeToWaitingRoom(gameId) {
  return supabase
    .channel(`waiting_room:${gameId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'game_participants', filter: `game_id=eq.${gameId}` },
      async () => {
        console.log('🔄 Nuovo partecipante entrato, aggiorno lista...');
        await updateWaitingPlayersList(gameId);
      }
    )
    .subscribe();
}

// Esponi joinRoom globalmente per i click inline
window.joinRoom = joinRoom;
