import { closeBettingWindow, getPlayersStatus, triggerTimerForAll } from './betting-sync.js';
import { placeBet, getGameBets } from './game-multiplayer.js';
import { supabase } from './main.js';

// Flag per prevenire acquisti simultanei con click rapidi
let isPurchasing = false;

// Stato locale del giocatore
let playerState = {
  selectedHorse: null,
  bets: [] // { horseIndex, chips, amount, chipPrice }
};

// Aggiorna il montepremi totale con le puntate di tutti i giocatori
export async function updateTotalPool(gameId) {
  console.log('💰 Aggiornamento montepremi per gameId:', gameId);

  const { data: allBets, error } = await supabase
    .from('bets')
    .select('amount, user_id, horse_number')
    .eq('game_id', gameId);

  if (error) {
    console.error('Errore caricamento puntate per montepremi:', error);
    return;
  }

  console.log('💰 Tutte le puntate caricate:', allBets);

  const totalPool = allBets?.reduce((sum, bet) => sum + bet.amount, 0) || 0;

  console.log(`💰 Totale calcolato: €${totalPool.toFixed(2)} da ${allBets?.length || 0} puntate`);

  // Aggiorna il display
  const totalPoolEl = document.getElementById('totalPool');
  if (totalPoolEl) {
    totalPoolEl.textContent = totalPool.toFixed(2);
    console.log(`💰 Display aggiornato a: €${totalPool.toFixed(2)}`);
  } else {
    console.warn('💰 Elemento totalPool non trovato nel DOM');
  }

  // Aggiorna anche gameState per compatibilità
  if (window.gameState) {
    window.gameState.totalPool = totalPool;
  }
}

// Apre la finestra scommesse multiplayer (solo per il giocatore corrente)
export async function openMultiplayerBetting(gameId, roundNumber, username, initialChips, maxBet, startTimer = true) {
  // Reset flag acquisto quando si apre una nuova finestra
  isPurchasing = false;

  // CONTROLLO PRIORITARIO 1: Non aprire finestra scommesse se la corsa è finita (flag)
  if (window.gameState && window.gameState.raceFinished) {
    console.log('🏁⛔ CORSA FINITA (flag locale) - NON apro finestra scommesse');
    return;
  }

  // CONTROLLO PRIORITARIO 2: Verifica DIRETTAMENTE le posizioni dei cavalli
  if (window.gameState && window.gameState.horses && window.gameState.gameConfig) {
    const prizePositions = window.gameState.gameConfig.prizeDistribution || 1;
    const finishedHorses = window.gameState.horses.filter(h => h.position > 10);
    if (finishedHorses.length >= prizePositions) {
      console.log('🏁⛔ CORSA GIÀ FINITA (controllo posizioni dirette in openMultiplayerBetting) - NON apro finestra');
      console.log(`   Cavalli finiti: ${finishedHorses.length}/${prizePositions} necessari`);
      console.log(`   Posizioni: ${finishedHorses.map(h => `${h.name}=${h.position}`).join(', ')}`);

      // Assicurati che il flag sia settato anche qui (backup di sicurezza)
      if (!window.gameState.raceFinished) {
        window.gameState.raceFinished = true;
        console.log('🚨 Flag raceFinished non era settato, lo setto ora come backup di sicurezza');
      }
      return;
    }
  }

  const bettingPanel = document.getElementById('bettingPanel');
  const participantsBetting = document.getElementById('participantsBetting');

  if (!bettingPanel || !participantsBetting) {
    console.error('Pannello scommesse non trovato');
    return;
  }

  // Carica le puntate precedenti dal database invece di resettare
  await loadPreviousBets(gameId);

  // Mostra il pannello
  bettingPanel.style.display = 'block';
  document.getElementById('windowNumber').textContent = roundNumber;

  // Aggiorna il contatore finestre nel tracciato
  const currentWindowEl = document.getElementById('currentWindow');
  if (currentWindowEl) {
    currentWindowEl.textContent = roundNumber;
  }

  // Aggiorna anche gameState.currentWindow per compatibilità
  if (window.gameState) {
    window.gameState.currentWindow = roundNumber;
  }

  // Crea l'interfaccia per il singolo giocatore (stile gioco locale)
  createMultiplayerBettingInterface(username, gameId, roundNumber);

  // Avvia il countdown del timer solo se richiesto (round 2+)
  if (startTimer) {
    startBettingCountdown(gameId, roundNumber);
  } else {
    console.log('⏸️ Timer non avviato - round 1, attendo prima scommessa');
    // Mostra messaggio invece del timer
    const timerElement = document.getElementById('betting-timer-multiplayer');
    if (timerElement) {
      timerElement.innerHTML = '<p style="color: #ffc107;">⏳ In attesa che qualcuno scommetta...</p>';
    }
  }

  // Carica e mostra lo stato degli altri giocatori
  updatePlayersStatus(gameId, roundNumber);

  // Aggiorna il montepremi totale
  await updateTotalPool(gameId);
}

// Crea l'interfaccia betting stile gioco locale
function createMultiplayerBettingInterface(username, gameId, roundNumber) {
  const container = document.getElementById('participantsBetting');

  console.log('🐴 gameState.horses.length:', window.gameState.horses.length);
  console.log('🐴 gameState.gameConfig.numHorses:', window.gameState.gameConfig.numHorses);

  // Header
  const selectedHorses = getSelectedHorsesCount();
  const headerHtml = `
    <div class="participant-header">
      <span>👤 ${username}</span>
      <div class="participant-summary">
        <span id="player-summary">Cavalli scommessi: ${selectedHorses}/3</span>
      </div>
    </div>
  `;

  // Riepilogo fiches
  console.log('🔍 createMultiplayerBettingInterface - playerState.bets:', playerState.bets);

  let summaryHtml = `
    <div class="participant-chips-summary">
      <h5>🎯 Riepilogo Fiches:</h5>
  `;

  window.gameState.horses.forEach((horse, horseIndex) => {
    const playerChips = getPlayerChipsForHorse(horseIndex);
    console.log(`🔍 Riepilogo - ${horse.name} (index ${horseIndex}): ${playerChips} fiches`);
    summaryHtml += `
      <div class="chips-row">
        <span>
          <div class="horse-color" style="background-color: ${horse.color}; width: 12px; height: 12px; border-radius: 50%; display: inline-block; margin-right: 5px;"></div>
          ${horse.name}
        </span>
        <span class="chips-count">${playerChips}</span>
      </div>
    `;
  });

  const totalSpent = getTotalSpent();
  console.log('🔍 Riepilogo - Totale speso:', totalSpent);
  summaryHtml += `<div class="total-spent">Totale speso: €${totalSpent.toFixed(2)}</div></div>`;

  // Opzioni cavalli (card)
  let optionsHtml = '<div class="horse-options" id="player-horses">';

  window.gameState.horses.forEach((horse, horseIndex) => {
    const chipPrice = getChipPrice(horse.position);
    const canBet = canBetOnHorse(horse, horseIndex);
    const hasAlreadyBet = hasAlreadyBetOnHorse(horseIndex);
    // Non permettere scommesse su cavalli >= 8, anche se hai già scommesso prima
    const shouldEnable = (canBet || hasAlreadyBet) && horse.position < 8;

    optionsHtml += `
      <div class="horse-option ${shouldEnable ? '' : 'blocked'}"
           id="horse-option-${horseIndex}"
           onclick="${shouldEnable ? `selectMultiplayerHorse(${horseIndex})` : ''}">
        <div class="horse-option-header">
          <div class="horse-color" style="background-color: ${horse.color};"></div>
          <span>${horse.name} <img src="${horse.imagePath}cavallo.png" style="width: 16px; height: auto; vertical-align: middle;"></span>
        </div>
        <div class="horse-option-info">
          <span>Posizione: ${horse.position}/10</span>
          <span>Prezzo: €${chipPrice.toFixed(2)}</span>
        </div>
      </div>
    `;
  });

  optionsHtml += '</div>';

  // Controlli acquisto
  const controlsHtml = `
    <div class="chips-control">
      <label>Fiches:</label>
      <input type="number" class="chips-input" id="chips-input" min="1" max="50" placeholder="N°" oninput="updateMultiplayerAmount()">
      <div class="amount-display" id="amount-display">€0.00</div>
      <button class="btn-small" id="buy-btn" onclick="buyMultiplayerChips('${gameId}', ${roundNumber})" disabled>Compra</button>
    </div>
  `;

  // Timer e bottone chiudi
  const actionsHtml = `
    <div class="betting-actions">
      <button id="close-betting-multiplayer" class="btn" disabled>
        Chiudi Finestra Scommesse
      </button>
      <div id="betting-timer">Tempo rimanente: 2:00</div>
    </div>
  `;

  // Status giocatori
  const statusHtml = `
    <div id="players-status" style="margin-top: 20px; background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px;">
      <h4 style="color: white;">Stato giocatori:</h4>
      <div id="players-status-list"></div>
    </div>
  `;

  container.innerHTML = headerHtml + summaryHtml + optionsHtml + controlsHtml + actionsHtml + statusHtml;

  // Aggiorna stato bottone chiudi in base alle puntate esistenti
  updateCloseButtonState();

  // Listener per chiudere
  document.getElementById('close-betting-multiplayer').addEventListener('click', async () => {
    await closeMultiplayerBetting(gameId, roundNumber);
  });
}

// Seleziona un cavallo
window.selectMultiplayerHorse = function(horseIndex) {
  playerState.selectedHorse = horseIndex;

  // Rimuovi selezione precedente
  window.gameState.horses.forEach((h, i) => {
    const option = document.getElementById(`horse-option-${i}`);
    if (option) option.classList.remove('selected');
  });

  // Seleziona nuovo cavallo
  const option = document.getElementById(`horse-option-${horseIndex}`);
  if (option) option.classList.add('selected');

  updateMultiplayerAmount();
  updatePlayerSummary();
};

// Aggiorna l'importo quando cambia il numero di fiches
window.updateMultiplayerAmount = function() {
  const chipsInput = document.getElementById('chips-input');
  const amountDisplay = document.getElementById('amount-display');
  const buyButton = document.getElementById('buy-btn');

  if (playerState.selectedHorse === null) {
    amountDisplay.textContent = 'Seleziona cavallo';
    buyButton.disabled = true;
    return;
  }

  const chips = parseInt(chipsInput.value) || 0;
  const horse = window.gameState.horses[playerState.selectedHorse];
  const chipPrice = getChipPrice(horse.position);
  const amount = chips * chipPrice;

  amountDisplay.textContent = '€' + amount.toFixed(2);

  const maxBet = window.gameState.gameConfig.maxAmountPerWindow;
  const exceedsLimit = amount > maxBet;
  const hasAlreadyBet = hasAlreadyBetOnHorse(playerState.selectedHorse);
  const canPurchase = hasAlreadyBet || canBetOnHorse(horse, playerState.selectedHorse);

  buyButton.disabled = chips <= 0 || exceedsLimit || !canPurchase;

  if (exceedsLimit) {
    amountDisplay.style.color = '#ff4444';
    amountDisplay.textContent += ' (LIMITE!)';
  } else if (!canPurchase) {
    amountDisplay.style.color = '#ff4444';
    amountDisplay.textContent += ' (NON DISPONIBILE!)';
  } else {
    amountDisplay.style.color = '#fff';
  }
};

// Compra fiches
window.buyMultiplayerChips = async function(gameId, roundNumber) {
  // 🛡️ PROTEZIONE 1: Previeni click multipli simultanei
  if (isPurchasing) {
    console.log('⚠️ Acquisto già in corso, ignoro il click');
    return;
  }

  if (playerState.selectedHorse === null) {
    alert('Seleziona prima un cavallo!');
    return;
  }

  const chipsInput = document.getElementById('chips-input');
  const chips = parseInt(chipsInput.value) || 0;

  if (chips <= 0) {
    alert('Inserisci un numero di fiches valido!');
    return;
  }

  const horse = window.gameState.horses[playerState.selectedHorse];

  // 🚫 CONTROLLO SICUREZZA: Blocca acquisto se cavallo >= posizione 8
  if (horse.position >= 8) {
    alert('⚠️ Non puoi scommettere su questo cavallo: è troppo avanti! (posizione >= 8)');
    return;
  }

  const chipPrice = getChipPrice(horse.position);
  const amount = chips * chipPrice;

  // 🛡️ PROTEZIONE 2: Setta il flag e disabilita il bottone
  isPurchasing = true;
  const buyButton = document.getElementById('buy-btn');
  if (buyButton) buyButton.disabled = true;

  // Salva puntata nel database
  try {
    console.log('💾 Salvataggio puntata nel DB:', { gameId, horse: playerState.selectedHorse + 1, amount });
    await placeBet(gameId, playerState.selectedHorse + 1, amount); // +1 perché DB usa 1-based
    console.log('✅ Puntata salvata nel DB');

    // Aggiorna localmente: cerca se esiste già una puntata per questo cavallo
    const existingBet = playerState.bets.find(bet => bet.horseIndex === playerState.selectedHorse);

    if (existingBet) {
      // Somma al totale esistente
      existingBet.chips += chips;
      existingBet.amount += amount;
      console.log(`✅ Aggiunte ${chips} fiches su ${horse.name} (totale: ${existingBet.chips} fiches, €${existingBet.amount.toFixed(2)})`);
    } else {
      // Crea nuova entry
      playerState.bets.push({
        horseIndex: playerState.selectedHorse,
        chips: chips,
        amount: amount,
        chipPrice: chipPrice
      });
      console.log(`✅ Acquistate ${chips} fiches su ${horse.name} (€${amount.toFixed(2)})`);
    }

    // Aggiorna stato cavallo locale
    horse.totalChips += chips;
    horse.totalBets += amount;

    // Aggiorna il montepremi totale (somma di tutte le puntate nel DB)
    await updateTotalPool(gameId);

    console.log('🎯 Acquisto completato, chiudo automaticamente finestra scommesse');

    // CHIUDI SEMPRE la finestra dopo ogni acquisto (previene acquisti multipli)
    // Nel round 1, triggera anche il timer per gli altri
    if (roundNumber === 1) {
      console.log('🎯 Round 1: triggero timer per gli altri giocatori');
      await triggerTimerForAll(gameId, roundNumber);
    }

    // Chiudi la finestra di questo giocatore (SEMPRE, in tutti i round)
    await closeMultiplayerBetting(gameId, roundNumber);
  } catch (error) {
    alert('Errore acquisto fiches: ' + error.message);
  } finally {
    // 🛡️ PROTEZIONE 3: Resetta SEMPRE il flag e riabilita il bottone
    isPurchasing = false;
    const buyButton = document.getElementById('buy-btn');
    if (buyButton) buyButton.disabled = false;
    console.log('✅ Flag isPurchasing resettato, bottone riabilitato');
  }
};

// Funzioni helper
function getChipPrice(position) {
  const basePrice = window.gameState.gameConfig.initialChipValue || 0.20;
  if (position >= 9) return basePrice * 3;
  if (position >= 7) return basePrice * 2;
  if (position >= 4) return basePrice * 1.5;
  return basePrice;
}

function canBetOnHorse(horse, horseIndex) {
  // 🚫 BLOCCO PRIORITARIO: Non si può scommettere su cavalli >= posizione 8
  if (horse.position >= 8) {
    return false;
  }

  // Controlla se ci sono già 3 cavalli scommessi
  const uniqueHorses = [...new Set(playerState.bets.map(b => b.horseIndex))];
  const hasAlreadyBet = hasAlreadyBetOnHorse(horseIndex);

  // Se ha già scommesso su questo cavallo, può continuare (solo se position < 8)
  if (hasAlreadyBet) return true;

  // Altrimenti controlla il limite di 3 cavalli
  return uniqueHorses.length < 3;
}

function hasAlreadyBetOnHorse(horseIndex) {
  return playerState.bets.some(bet => bet.horseIndex === horseIndex);
}

function getPlayerChipsForHorse(horseIndex) {
  return playerState.bets
    .filter(bet => bet.horseIndex === horseIndex)
    .reduce((total, bet) => total + bet.chips, 0);
}

function getTotalSpent() {
  return playerState.bets.reduce((total, bet) => total + bet.amount, 0);
}

function getSelectedHorsesCount() {
  const uniqueHorses = [...new Set(playerState.bets.map(b => b.horseIndex))];
  return uniqueHorses.length;
}

function updatePlayerSummary() {
  const summary = document.getElementById('player-summary');
  if (!summary) return;

  const selectedHorses = getSelectedHorsesCount();
  if (playerState.selectedHorse !== null) {
    const horse = window.gameState.horses[playerState.selectedHorse];
    const chipPrice = getChipPrice(horse.position);
    summary.textContent = `${horse.name} selezionato - €${chipPrice.toFixed(2)}/fiches`;
  } else {
    summary.textContent = `Cavalli scommessi: ${selectedHorses}/3`;
  }
}

// Chiude la finestra e sincronizza con il server
async function closeMultiplayerBetting(gameId, roundNumber) {
  console.log('Chiusura finestra scommesse - Puntate effettuate:', playerState.bets);

  // Verifica che l'utente corrente abbia effettuato almeno una puntata
  if (!playerState.bets || playerState.bets.length === 0 || playerState.bets.every(b => b.amount <= 0)) {
    alert('Devi acquistare fiches prima di chiudere');
    return;
  }

  // Se è il primo round, controlla che ci sia almeno una puntata nel database
  if (roundNumber === 1) {
    const { data: bets } = await supabase
      .from('bets')
      .select('*')
      .eq('game_id', gameId);

    if (!bets || bets.length === 0) {
      alert('⚠️ Impossibile chiudere: almeno un giocatore deve effettuare una puntata per iniziare la partita!');
      return;
    }
  }

  // Chiude la finestra nel server
  await closeBettingWindow(gameId, roundNumber);

  // Nasconde il pannello localmente
  document.getElementById('bettingPanel').style.display = 'none';

  // Ferma il timer locale
  if (window.bettingInterval) {
    clearInterval(window.bettingInterval);
    window.bettingInterval = null;
  }

  console.log('✅ Finestra chiusa, in attesa degli altri giocatori...');
}

// Aggiorna lo stato del bottone "Chiudi Finestra Scommesse"
function updateCloseButtonState() {
  const closeBtn = document.getElementById('close-betting-multiplayer');
  if (!closeBtn) return;

  // Abilita il bottone solo se ci sono puntate con amount > 0
  const hasBets = playerState.bets && playerState.bets.length > 0 && playerState.bets.some(b => b.amount > 0);
  closeBtn.disabled = !hasBets;
}

// Timer countdown 30 secondi
export function startBettingCountdown(gameId, roundNumber) {
  const timerEl = document.getElementById('betting-timer');
  let secondsLeft = 30;

  const interval = setInterval(() => {
    secondsLeft--;
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    timerEl.textContent = `Tempo rimanente: ${minutes}:${seconds.toString().padStart(2, '0')}`;

    if (secondsLeft <= 0) {
      clearInterval(interval);
      timerEl.textContent = 'Tempo scaduto!';
    }
  }, 1000);

  // Salva l'interval per poterlo fermare
  window.bettingInterval = interval;
}

// Mostra chi ha chiuso la finestra e chi no
async function updatePlayersStatus(gameId, roundNumber) {
  const states = await getPlayersStatus(gameId, roundNumber);
  const statusList = document.getElementById('players-status-list');

  if (!statusList) {
    console.warn('⚠️ players-status-list non trovato nel DOM');
    return;
  }

  // Carica tutte le puntate del gioco
  const allBets = await getGameBets(gameId);
  console.log('📊 updatePlayersStatus - Puntate totali caricate:', allBets.length);

  statusList.innerHTML = await Promise.all(states.map(async state => {
    const username = state.profiles?.username || 'Giocatore';
    const status = state.betting_window_closed ? '✅ Pronto' : '⏳ In scommessa';

    // Filtra le puntate di questo giocatore
    const playerBets = allBets.filter(bet => bet.user_id === state.user_id);
    console.log(`📊 ${username} - Puntate:`, playerBets.length);

    // Raggruppa per cavallo e calcola totale
    const betsByHorse = {};
    let totalSpent = 0;
    let lastBet = 0;

    playerBets.forEach(bet => {
      const horseIndex = bet.horse_number - 1;
      if (!betsByHorse[horseIndex]) {
        betsByHorse[horseIndex] = { amount: 0, chips: 0 };
      }
      betsByHorse[horseIndex].amount += bet.amount;
      totalSpent += bet.amount;
      lastBet = bet.amount; // Ultima puntata singola (approssimazione)
    });

    // Calcola numero fiches DOPO aver sommato tutti gli importi
    Object.entries(betsByHorse).forEach(([horseIndex, data]) => {
      const horse = window.gameState?.horses?.[parseInt(horseIndex)];
      if (horse) {
        const chipPrice = getChipPrice(horse.position);
        data.chips = Math.round(data.amount / chipPrice);
        console.log(`  📊 ${horse.name}: ${data.chips} fiches (€${data.amount.toFixed(2)} / €${chipPrice.toFixed(2)})`);
      }
    });

    // Crea riepilogo fiches per cavallo
    let chipsHtml = '';
    if (Object.keys(betsByHorse).length > 0) {
      chipsHtml = '<div style="margin-top: 8px; font-size: 12px;">';
      chipsHtml += '<strong>Fiches:</strong> ';
      Object.entries(betsByHorse).forEach(([horseIndex, data], index) => {
        const horse = window.gameState.horses[parseInt(horseIndex)];
        if (horse) {
          chipsHtml += `<span style="display: inline-block; margin: 2px 4px; padding: 2px 6px; background: ${horse.color}; color: ${horse.color === '#FFFFFF' || horse.color === '#FFD700' ? '#000' : '#fff'}; border-radius: 8px; font-size: 11px;">`;
          chipsHtml += `${horse.name}: ${data.chips} 🎯</span>`;
        }
      });
      chipsHtml += '</div>';
    }

    return `
      <div class="player-status-item" style="background: rgba(255,255,255,0.05); padding: 10px; margin: 5px 0; border-radius: 6px;">
        <div><strong>${username}</strong>: ${status}</div>
        ${playerBets.length > 0 ? `
          <div style="font-size: 12px; margin-top: 4px; color: #aaa;">
            Ultima puntata: €${lastBet.toFixed(2)} | Totale: €${totalSpent.toFixed(2)}
          </div>
          ${chipsHtml}
        ` : '<div style="font-size: 12px; color: #888;">Nessuna puntata</div>'}
      </div>
    `;
  })).then(items => items.join(''));
}

// Carica le puntate precedenti del giocatore dal database
async function loadPreviousBets(gameId) {
  try {
    const user = await supabase.auth.getUser();
    if (!user.data.user) return;

    console.log('🔍 loadPreviousBets - gameId:', gameId);
    console.log('🔍 loadPreviousBets - currentUserId:', user.data.user.id);

    // Carica lo stato della partita per controllare il round
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('current_round')
      .eq('id', gameId)
      .single();

    if (gameError) {
      console.error('Errore caricamento game:', gameError);
      return;
    }

    console.log('🔍 loadPreviousBets - current_round:', game.current_round);

    // Se siamo al round 1 e non ci sono carte pescate → è l'inizio, riepilogo vuoto
    const isFirstRound = !game.current_round || game.current_round === 1;
    const totalCardsDrawn = window.gameState?.currentCardIndex || 0;

    console.log('🔍 loadPreviousBets - isFirstRound:', isFirstRound, 'totalCardsDrawn:', totalCardsDrawn);

    if (isFirstRound && totalCardsDrawn === 0) {
      console.log('📦 Round 1 senza carte pescate → riepilogo vuoto (corsa non iniziata)');
      playerState.bets = [];
      return;
    }

    // Altrimenti carica le puntate precedenti
    const bets = await getGameBets(gameId);
    console.log('🔍 loadPreviousBets - tutte le puntate dal DB:', bets);

    // Filtra solo le puntate del giocatore corrente
    const myBets = bets.filter(bet => bet.user_id === user.data.user.id);
    console.log('🔍 loadPreviousBets - solo le mie puntate:', myBets);

    // SEMPRE ricaricare dal database per avere il totale aggiornato
    if (myBets.length > 0) {
      // Raggruppa le puntate per cavallo e somma gli importi
      const betsByHorse = {};
      myBets.forEach(bet => {
        const horseIndex = bet.horse_number - 1;
        console.log('🔍 Processando puntata:', bet, 'horseIndex:', horseIndex);
        if (!betsByHorse[horseIndex]) {
          betsByHorse[horseIndex] = {
            horseIndex: horseIndex,
            amount: 0,
            chips: 0,
            chipPrice: 0.20
          };
        }
        betsByHorse[horseIndex].amount += bet.amount;
        betsByHorse[horseIndex].chips += Math.round(bet.amount / 0.20);
      });

      // Converti in array
      playerState.bets = Object.values(betsByHorse);

      console.log('📦 Puntate precedenti caricate (raggruppate per cavallo):', playerState.bets);
    } else {
      // Nessuna puntata trovata, resetta
      console.log('📦 Nessuna puntata precedente trovata, resetto playerState.bets');
      playerState.bets = [];
    }
  } catch (error) {
    console.error('Errore caricamento puntate precedenti:', error);
  }
}

export { updatePlayersStatus };
