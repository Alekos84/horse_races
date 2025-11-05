import { getCurrentUser } from './auth.js';
import { placeBet, getGameBets } from './game-multiplayer.js';

// Flag per prevenire acquisti simultanei
let isPurchasing = false;

// Crea interfaccia betting per multiplayer (solo giocatore corrente)
export async function createMultiplayerBettingInterface() {
  // Reset flag acquisto quando si apre una nuova finestra
  isPurchasing = false;

  const user = await getCurrentUser();
  if (!user) return;

  const container = document.getElementById('participantsBetting');
  container.innerHTML = '';

  const gameId = window.gameState.currentGameId;
  const username = user.user_metadata?.username || user.email.split('@')[0];

  // Crea pannello singolo giocatore
  const playerDiv = document.createElement('div');
  playerDiv.className = 'participant-betting';
  playerDiv.style.maxWidth = '600px';
  playerDiv.style.margin = '0 auto';

  let playerHtml = `
    <div class="participant-header">
      <span>👤 ${username}</span>
      <div class="participant-summary">
        <span id="player-status">Seleziona un cavallo per scommettere</span>
      </div>
    </div>
    <div class="horse-options" id="player-horses">
  `;

  // Mostra tutti i cavalli
  window.gameState.horses.forEach((horse, horseIndex) => {
    const chipPrice = getChipPrice(horse.position);
    playerHtml += `
      <div class="horse-option" id="option-${horseIndex}" onclick="selectMultiplayerHorse(${horseIndex})">
        <div class="horse-option-header">
          <div class="horse-color" style="background-color: ${horse.color};"></div>
          <span>${horse.name} <img src="${horse.imagePath}cavallo.png" style="width: 16px; height: auto; vertical-align: middle;"></span>
        </div>
        <div class="horse-option-info">
          <span>Posizione: ${horse.position}/10</span>
          <span>Prezzo: €${chipPrice.toFixed(2)}</span>
        </div>
        <div class="horse-option-controls">
          <button onclick="event.stopPropagation(); buyMultiplayerChip(${horseIndex});" class="chip-btn">
            💰 Compra Fiche (€${chipPrice.toFixed(2)})
          </button>
          <span class="chips-bought" id="chips-${horseIndex}">0 fiches</span>
        </div>
      </div>
    `;
  });

  playerHtml += '</div>';
  playerDiv.innerHTML = playerHtml;
  container.appendChild(playerDiv);
}

// Seleziona cavallo (evidenzia visivamente)
window.selectMultiplayerHorse = function(horseIndex) {
  // Rimuovi selezione precedente
  document.querySelectorAll('.horse-option').forEach(el => {
    el.classList.remove('selected');
  });

  // Seleziona nuovo cavallo
  const option = document.getElementById(`option-${horseIndex}`);
  if (option) {
    option.classList.add('selected');
  }
};

// Compra una fiche
window.buyMultiplayerChip = async function(horseIndex) {
  // PROTEZIONE 0: Verifica che la finestra scommesse sia ancora aperta
  const bettingPanel = document.getElementById('bettingPanel');
  if (!bettingPanel || bettingPanel.style.display === 'none') {
    console.log('⚠️ Finestra scommesse chiusa, acquisto bloccato');
    alert('⚠️ La finestra scommesse è chiusa!');
    return;
  }

  // PROTEZIONE 1: Previeni click multipli simultanei
  if (isPurchasing) {
    console.log('⚠️ Acquisto già in corso, ignoro il click');
    return;
  }

  isPurchasing = true;

  // PROTEZIONE 2: Disabilita tutti i bottoni di acquisto
  const allBuyButtons = document.querySelectorAll('.chip-btn');
  allBuyButtons.forEach(btn => btn.disabled = true);

  try {
    const gameId = window.gameState.currentGameId;
    const horse = window.gameState.horses[horseIndex];
    const chipPrice = getChipPrice(horse.position);
    const maxBet = window.gameState.gameConfig.maxAmountPerWindow || 2.00;
    const user = await getCurrentUser();

    // PROTEZIONE 3: Verifica totale già speso in questa finestra
    const bets = await getGameBets(gameId);
    const userBets = bets.filter(b => b.user_id === user.id);
    const totalSpent = userBets.reduce((sum, bet) => sum + bet.amount, 0);

    console.log(`💰 Totale già speso: €${totalSpent.toFixed(2)} / Max: €${maxBet.toFixed(2)}`);

    if (totalSpent + chipPrice > maxBet) {
      alert(`❌ Non puoi superare il limite di €${maxBet.toFixed(2)} per finestra.\nHai già speso: €${totalSpent.toFixed(2)}`);
      return;
    }

    // Salva la puntata nel database
    await placeBet(gameId, horseIndex + 1, chipPrice); // horseIndex+1 perché il DB usa 1-based

    // Aggiorna UI locale
    const chipsDisplay = document.getElementById(`chips-${horseIndex}`);
    const currentChips = parseInt(chipsDisplay.textContent) || 0;
    chipsDisplay.textContent = `${currentChips + 1} fiches`;

    // Aggiorna totale cavallo
    horse.totalBets += chipPrice;
    horse.totalChips += 1;

    console.log(`✅ Puntata salvata: €${chipPrice} su ${horse.name}`);
  } catch (error) {
    alert('Errore piazzando scommessa: ' + error.message);
  } finally {
    // PROTEZIONE 4: Riabilita i bottoni e resetta il flag
    const allBuyButtons = document.querySelectorAll('.chip-btn');
    allBuyButtons.forEach(btn => btn.disabled = false);
    isPurchasing = false;
  }
};

// Calcola prezzo fiche in base alla posizione
function getChipPrice(position) {
  const basePrice = window.gameState.gameConfig.initialChipValue || 0.20;

  // 🚫 Posizione 8-9-10: NON acquistabile
  if (position >= 8) return 0;

  // 💰 Fasce di prezzo:
  // Pos 7: €0.60 (×3)
  if (position >= 7) return basePrice * 3;
  // Pos 5-6: €0.40 (×2)
  if (position >= 5) return basePrice * 2;
  // Pos 3-4: €0.30 (×1.5)
  if (position >= 3) return basePrice * 1.5;
  // Pos 0-1-2: €0.20 (×1)
  return basePrice;
}
