import { supabase } from './main.js';
import { getGameBets } from './game-multiplayer.js';

// Percentuali di distribuzione del montepremi
const PRIZE_DISTRIBUTIONS = {
  1: [100],        // Solo 1° posto: 100%
  2: [60, 40],     // 1° e 2°: 60% + 40%
  3: [50, 30, 20]  // 1°, 2° e 3°: 50% + 30% + 20%
};

/**
 * Calcola i risultati finali di una partita multiplayer
 * @param {string} gameId - ID della partita
 * @returns {Promise<Object>} - Risultati con vincitori, montepremi, dettagli giocatori
 */
export async function calculateMultiplayerResults(gameId) {
  console.log('💰 ============ INIZIO CALCOLO RISULTATI ============');
  console.log('💰 Game ID:', gameId);

  // 1. Leggi configurazione partita
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('prize_distribution, num_horses')
    .eq('id', gameId)
    .single();

  if (gameError) {
    console.error('❌ Errore lettura configurazione:', gameError);
    throw gameError;
  }

  console.log('✅ Configurazione partita:', game);

  // Converti stringa prize_distribution in numero
  let prizePositions = 1;
  const prizeDistString = game.prize_distribution || 'winner-takes-all';
  if (prizeDistString === 'top-2') prizePositions = 2;
  else if (prizeDistString === 'top-3') prizePositions = 3;

  console.log(`🏆 Distribuzione premi: ${prizeDistString} → ${prizePositions} posizioni vincenti`);

  // 2. Leggi tutte le puntate della partita
  console.log('📊 Leggo puntate dal database...');
  const bets = await getGameBets(gameId);
  console.log(`📊 Puntate totali: ${bets.length}`);
  console.log('📊 Dettaglio puntate:', bets);

  // 3. Calcola il montepremi totale
  const totalPool = bets.reduce((sum, bet) => sum + bet.amount, 0);
  console.log(`💰 Montepremi totale: €${totalPool.toFixed(2)}`);

  // 4. Ottieni la classifica finale dei cavalli
  const rankedHorses = getRankedHorses();
  const finishedHorses = rankedHorses.filter(horse => horse.position > 10);
  console.log(`🏁 Cavalli arrivati: ${finishedHorses.length}`);

  if (finishedHorses.length === 0) {
    console.log('⚠️ Nessun cavallo ha finito la corsa');
    return {
      totalPool,
      winners: [],
      playerResults: [],
      prizePositions
    };
  }

  // 5. Calcola totale fiches per ogni cavallo vincitore
  const percentages = PRIZE_DISTRIBUTIONS[prizePositions];
  const winningHorses = finishedHorses.slice(0, Math.min(prizePositions, finishedHorses.length));

  console.log('🏆 Cavalli vincitori:');
  console.log('🔍 Array originale cavalli:', window.gameState.horses.map((h, i) => `#${i+1}: ${h.name} (suit="${h.suit}")`));

  winningHorses.forEach((horse, index) => {
    console.log(`\n🐴 Analizzo vincitore #${index + 1}: ${horse.name} (suit="${horse.suit}")`);

    // Trova l'indice del cavallo nell'array originale usando il suit
    const horseIndex = window.gameState.horses.findIndex(h => h.suit === horse.suit);
    console.log(`  🔍 findIndex(suit="${horse.suit}"): ${horseIndex}`);

    const horseNumber = horseIndex + 1;  // Il DB usa 1-based indexing
    console.log(`  📍 horse_number nel DB: ${horseNumber}`);

    const horseBets = bets.filter(bet => bet.horse_number === horseNumber);
    console.log(`  💰 Puntate su questo cavallo (horse_number=${horseNumber}):`, horseBets);

    const totalBetsOnHorse = horseBets.reduce((sum, bet) => sum + bet.amount, 0);
    console.log(`  💵 Totale puntato: €${totalBetsOnHorse.toFixed(2)}`);
  });

  // 6. Calcola vincite per ogni giocatore
  const playerResults = calculatePlayerWinnings(bets, winningHorses, totalPool, percentages);

  // 7. Ordina giocatori per profitto (vincita - spesa)
  playerResults.sort((a, b) => b.profit - a.profit);

  console.log('📊 Risultati giocatori:');
  playerResults.forEach(result => {
    console.log(`  ${result.username}: Speso €${result.totalSpent.toFixed(2)} - Vinto €${result.totalWon.toFixed(2)} - Profitto €${result.profit.toFixed(2)}`);
  });

  return {
    totalPool,
    winners: winningHorses.map((horse, index) => {
      const horseIndex = window.gameState.horses.findIndex(h => h.suit === horse.suit);
      return {
        position: index + 1,
        horse: horse,
        horseNumber: horseIndex + 1,
        percentage: percentages[index]
      };
    }),
    playerResults,
    prizePositions
  };
}

/**
 * Calcola le vincite di ogni giocatore
 */
function calculatePlayerWinnings(bets, winningHorses, totalPool, percentages) {
  // Raggruppa puntate per giocatore
  const playerBetsMap = {};

  bets.forEach(bet => {
    if (!playerBetsMap[bet.user_id]) {
      playerBetsMap[bet.user_id] = {
        user_id: bet.user_id,
        username: bet.profiles?.username || 'Sconosciuto',
        bets: []
      };
    }
    playerBetsMap[bet.user_id].bets.push(bet);
  });

  // Calcola risultati per ogni giocatore
  const results = [];

  Object.values(playerBetsMap).forEach(player => {
    const totalSpent = player.bets.reduce((sum, bet) => sum + bet.amount, 0);
    let totalWon = 0;

    // Per ogni cavallo vincitore, calcola la quota del giocatore
    winningHorses.forEach((horse, index) => {
      console.log(`\n  🐴 Calcolo vincite per ${player.username} su ${horse.name}...`);

      // Trova l'indice del cavallo nell'array originale usando il suit
      const horseIndex = window.gameState.horses.findIndex(h => h.suit === horse.suit);
      console.log(`    🔍 findIndex(suit="${horse.suit}"): ${horseIndex}`);

      const horseNumber = horseIndex + 1;  // Il DB usa 1-based indexing
      console.log(`    📍 horse_number: ${horseNumber}`);

      // Totale puntato su questo cavallo da TUTTI i giocatori
      const totalBetsOnHorse = bets
        .filter(bet => bet.horse_number === horseNumber)
        .reduce((sum, bet) => sum + bet.amount, 0);
      console.log(`    💵 Totale puntato da TUTTI su horse_number ${horseNumber}: €${totalBetsOnHorse.toFixed(2)}`);

      // Quanto ha puntato QUESTO giocatore su questo cavallo
      const playerBetsOnHorse = player.bets
        .filter(bet => bet.horse_number === horseNumber)
        .reduce((sum, bet) => sum + bet.amount, 0);
      console.log(`    💰 Puntato da ${player.username} su horse_number ${horseNumber}: €${playerBetsOnHorse.toFixed(2)}`);

      if (playerBetsOnHorse > 0 && totalBetsOnHorse > 0) {
        // Calcola proporzione del giocatore sul cavallo vincitore
        const proportion = playerBetsOnHorse / totalBetsOnHorse;

        // Calcola premio per questa posizione
        const positionPrize = totalPool * (percentages[index] / 100);

        // Assegna la quota proporzionale al giocatore
        const playerWinFromHorse = positionPrize * proportion;
        totalWon += playerWinFromHorse;

        console.log(`    🎉 ${player.username} vince €${playerWinFromHorse.toFixed(2)} da ${horse.name} (${(proportion * 100).toFixed(2)}% delle puntate)`);
      } else {
        console.log(`    ❌ ${player.username} NON ha puntato su questo cavallo vincitore`);
      }
    });

    results.push({
      user_id: player.user_id,
      username: player.username,
      totalSpent: totalSpent,
      totalWon: totalWon,
      profit: totalWon - totalSpent
    });
  });

  return results;
}

/**
 * Ottiene la classifica dei cavalli ordinata per posizione
 */
function getRankedHorses() {
  if (!window.gameState || !window.gameState.horses) {
    return [];
  }

  const horses = [...window.gameState.horses];

  horses.sort((a, b) => {
    // Prima ordina per chi ha superato il traguardo (position > 10)
    const aFinished = a.position > 10;
    const bFinished = b.position > 10;

    if (aFinished && !bFinished) return -1;
    if (!aFinished && bFinished) return 1;

    // Poi ordina per posizione decrescente
    return b.position - a.position;
  });

  return horses;
}

/**
 * Mostra i risultati nell'interfaccia
 */
export function displayMultiplayerResults(results) {
  console.log('🎨 Mostrando risultati nell\'interfaccia');

  const resultsDiv = document.getElementById('results');
  const winnerInfo = document.getElementById('winnerInfo');
  const payoutInfo = document.getElementById('payoutInfo');

  if (!resultsDiv || !winnerInfo || !payoutInfo) {
    console.error('❌ Elementi UI risultati non trovati');
    return;
  }

  // Mostra la sezione risultati
  resultsDiv.style.display = 'block';

  // 1. CLASSIFICA CAVALLI
  let winnerHtml = '<h4>🏆 Classifica Finale:</h4>';

  if (results.winners.length > 0) {
    winnerHtml += '<div style="background: rgba(255,215,0,0.2); padding: 15px; margin: 10px 0; border-radius: 10px; border: 2px solid #FFD700;">';
    winnerHtml += '<h5 style="text-align: center; color: #FFD700; margin-bottom: 10px;">🏁 PODIO 🏁</h5>';

    results.winners.forEach(winner => {
      const { position, horse, percentage } = winner;
      const medalEmoji = position === 1 ? '🥇' : position === 2 ? '🥈' : '🥉';

      winnerHtml += `
        <div style="display: inline-block; margin: 5px 10px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 8px; text-align: center; border: 3px solid ${horse.color};">
          <div style="font-size: 24px;">${medalEmoji}</div>
          <div style="font-weight: bold;">${position}° ${horse.name}</div>
          <div style="font-size: 20px;"><img src="${horse.imagePath}cavallo.png" style="width: 20px; height: auto; vertical-align: middle;"></div>
          <div style="font-size: 12px; color: #FFD700;">${percentage}% premio</div>
        </div>
      `;
    });

    winnerHtml += '</div>';
  }

  winnerInfo.innerHTML = winnerHtml;

  // 2. RISULTATI GIOCATORI
  console.log('🎨 Creo HTML risultati giocatori...');
  console.log('🎨 PlayerResults:', results.playerResults);

  let payoutHtml = '<h4>💰 Risultati Giocatori:</h4>';
  payoutHtml += `<div style="background: rgba(76,175,80,0.2); padding: 10px; margin: 10px 0; border-radius: 8px; text-align: center;">
    <strong>Montepremi Totale: €${results.totalPool.toFixed(2)}</strong>
  </div>`;

  if (results.playerResults.length === 0) {
    console.log('⚠️ Nessun giocatore nei risultati!');
    payoutHtml += '<p style="text-align: center; color: #FFA500;">⚠️ Nessuna puntata trovata</p>';
  }

  results.playerResults.forEach((player, index) => {
    const isWinner = player.totalWon > 0;
    const isProfit = player.profit > 0;

    const bgColor = isWinner ?
      (isProfit ? 'rgba(76,175,80,0.2)' : 'rgba(255,193,7,0.2)') :
      'rgba(244,67,54,0.2)';

    const borderColor = isWinner ?
      (isProfit ? '#4CAF50' : '#FFC107') :
      '#F44336';

    payoutHtml += `
      <div style="background: ${bgColor}; padding: 12px; margin: 8px 0; border-radius: 8px; border-left: 4px solid ${borderColor};">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong>${index + 1}. ${player.username}</strong>
            ${isWinner && isProfit ? '🏆' : isWinner ? '💰' : '❌'}
          </div>
          <div style="text-align: right;">
            <div>Speso: €${player.totalSpent.toFixed(2)}</div>
            <div>Vinto: €${player.totalWon.toFixed(2)}</div>
            <div style="font-weight: bold; color: ${isProfit ? '#4CAF50' : '#F44336'};">
              Profitto: €${player.profit >= 0 ? '+' : ''}${player.profit.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    `;
  });

  payoutInfo.innerHTML = payoutHtml;

  console.log('✅ Risultati visualizzati');
}
