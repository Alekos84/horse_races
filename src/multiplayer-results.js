import { supabase } from './main.js';
import { getGameBets } from './game-multiplayer.js';

// Percentuali di distribuzione del montepremi
const PRIZE_DISTRIBUTIONS = {
  1: [100],        // Solo 1° posto: 100%
  2: [70, 30],     // 1° e 2°: 70% + 30%
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

  // Calcola info dettagliate per ogni cavallo vincente
  const winnersDetailed = winningHorses.map((horse, index) => {
    const horseIndex = window.gameState.horses.findIndex(h => h.suit === horse.suit);
    const horseNumber = horseIndex + 1;

    // Totale puntato su questo cavallo da TUTTI
    const totalBetsOnHorse = bets
      .filter(bet => bet.horse_number === horseNumber)
      .reduce((sum, bet) => sum + bet.amount, 0);

    // Totale fiches su questo cavallo da TUTTI
    const totalChipsOnHorse = bets
      .filter(bet => bet.horse_number === horseNumber)
      .reduce((sum, bet) => sum + (bet.chips || 0), 0);

    // Premio per questa posizione
    const positionPrize = totalPool * (percentages[index] / 100);

    // Info per ogni giocatore su questo cavallo (con calcolo vincita)
    const playerChipsOnHorse = {};
    bets.filter(bet => bet.horse_number === horseNumber).forEach(bet => {
      const username = bet.profiles?.username || 'Sconosciuto';
      if (!playerChipsOnHorse[username]) {
        playerChipsOnHorse[username] = { chips: 0, amount: 0 };
      }
      playerChipsOnHorse[username].chips += (bet.chips || 0);
      playerChipsOnHorse[username].amount += bet.amount;
    });

    // Calcola vincita per ogni giocatore su questo cavallo
    Object.keys(playerChipsOnHorse).forEach(username => {
      const playerData = playerChipsOnHorse[username];
      if (totalBetsOnHorse > 0) {
        const proportion = playerData.amount / totalBetsOnHorse;
        playerData.winnings = positionPrize * proportion;
      } else {
        playerData.winnings = 0;
      }
    });

    return {
      position: index + 1,
      horse: horse,
      horseNumber: horseNumber,
      percentage: percentages[index],
      positionPrize: positionPrize,
      totalBetsOnHorse: totalBetsOnHorse,
      totalChipsOnHorse: totalChipsOnHorse,
      playerChipsOnHorse: playerChipsOnHorse
    };
  });

  return {
    totalPool,
    winners: winnersDetailed,
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
 * Mostra i risultati nell'interfaccia con dettaglio fiches per cavallo
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

  // 1. PODIO CON CAVALLI VINCENTI DISTANZIATI
  let winnerHtml = '<h4 style="text-align: center; color: #FFD700; margin-bottom: 20px;">🏁 PODIO 🏁</h4>';

  if (results.winners.length === 0) {
    winnerHtml += '<p style="text-align: center; color: #FFA500;">Nessun cavallo ha completato la corsa</p>';
  } else {
    // Container per podio con cavalli distanziati
    winnerHtml += '<div style="display: flex; justify-content: space-around; align-items: flex-start; background: rgba(255,215,0,0.15); padding: 20px; border-radius: 12px; border: 2px solid #FFD700; margin-bottom: 20px;">';

    results.winners.forEach(winner => {
      const { position, horse, percentage, positionPrize, totalChipsOnHorse, playerChipsOnHorse } = winner;
      const medalEmoji = position === 1 ? '🥇' : position === 2 ? '🥈' : '🥉';

      winnerHtml += `
        <div style="flex: 1; text-align: center; padding: 10px;">
          <!-- Cavallo vincente -->
          <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 10px; border: 3px solid ${horse.color}; margin-bottom: 10px;">
            <div style="font-size: 32px; margin-bottom: 5px;">${medalEmoji}</div>
            <div style="font-weight: bold; font-size: 18px; color: white;">${position}° ${horse.name}</div>
            <div style="margin: 5px 0;"><img src="${horse.imagePath}cavallo.png" style="width: 30px; height: auto;"></div>
          </div>

          <!-- Quota montepremi -->
          <div style="background: rgba(76,175,80,0.3); padding: 10px; border-radius: 8px; margin-bottom: 10px;">
            <div style="font-size: 14px; color: #FFD700; font-weight: bold;">${percentage}% del montepremi</div>
            <div style="font-size: 20px; color: #4CAF50; font-weight: bold;">€${positionPrize.toFixed(2)}</div>
            <div style="font-size: 11px; color: #ccc; margin-top: 5px;">Totale fiches: ${totalChipsOnHorse}</div>
          </div>

          <!-- Fiches per giocatore su questo cavallo -->
          <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; min-height: 60px;">
            <div style="font-size: 12px; color: #FFD700; margin-bottom: 8px; font-weight: bold;">Fiches giocatori:</div>
            ${Object.entries(playerChipsOnHorse).map(([username, data]) => `
              <div style="font-size: 11px; color: white; margin: 5px 0; padding: 6px; background: rgba(255,255,255,0.15); border-radius: 4px; border-left: 3px solid #4CAF50;">
                <div style="margin-bottom: 3px;"><strong>${username}</strong></div>
                <div style="font-size: 10px; color: #ccc;">🎯 ${data.chips}/${totalChipsOnHorse} fiches (${((data.chips / totalChipsOnHorse) * 100).toFixed(1)}%)</div>
                <div style="font-size: 11px; color: #4CAF50; font-weight: bold; margin-top: 2px;">💰 Vince: €${data.winnings.toFixed(2)}</div>
              </div>
            `).join('')}
            ${Object.keys(playerChipsOnHorse).length === 0 ? '<div style="font-size: 11px; color: #999;">Nessuna puntata</div>' : ''}
          </div>
        </div>
      `;
    });

    winnerHtml += '</div>';
  }

  winnerInfo.innerHTML = winnerHtml;

  // 2. MONTEPREMI TOTALE
  let payoutHtml = `<div style="background: rgba(76,175,80,0.2); padding: 12px; margin: 15px 0; border-radius: 8px; text-align: center; border: 2px solid #4CAF50;">
    <strong style="font-size: 18px; color: #4CAF50;">💰 Montepremi Totale: €${results.totalPool.toFixed(2)}</strong>
  </div>`;

  // 3. CLASSIFICA GIOCATORI PER PROFITTO
  payoutHtml += '<h4 style="text-align: center; margin-top: 25px; margin-bottom: 15px;">📊 Classifica Finale</h4>';

  if (results.playerResults.length === 0) {
    console.log('⚠️ Nessun giocatore nei risultati!');
    payoutHtml += '<p style="text-align: center; color: #FFA500;">⚠️ Nessuna puntata trovata</p>';
  } else {
    results.playerResults.forEach((player, index) => {
      const isProfit = player.profit > 0;
      const bgColor = isProfit ? 'rgba(76,175,80,0.2)' : 'rgba(244,67,54,0.2)';
      const borderColor = isProfit ? '#4CAF50' : '#F44336';
      const profitColor = isProfit ? '#4CAF50' : '#F44336';

      payoutHtml += `
        <div style="background: ${bgColor}; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 5px solid ${borderColor};">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="font-size: 16px;">${index + 1}. ${player.username}</strong>
              ${isProfit ? ' 🏆' : ' 💸'}
            </div>
            <div style="text-align: right;">
              <div style="font-size: 13px; color: #ccc;">Speso: €${player.totalSpent.toFixed(2)}</div>
              <div style="font-size: 13px; color: #ccc;">Vinto: €${player.totalWon.toFixed(2)}</div>
              <div style="font-weight: bold; font-size: 18px; color: ${profitColor}; margin-top: 5px;">
                ${isProfit ? '▲' : '▼'} €${player.profit >= 0 ? '+' : ''}${player.profit.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      `;
    });
  }

  payoutInfo.innerHTML = payoutHtml;

  console.log('✅ Risultati visualizzati');
}
