// Sistema audio per il gioco
// Gestisce tutti i suoni del gioco (sia locale che multiplayer)

/**
 * Riproduce un file audio
 * @param {string} soundFile - Nome del file (es. 'card_flip.wav')
 * @param {number} volume - Volume base (0.0 - 1.0)
 * @param {number} gain - Moltiplicatore volume (default 4.0)
 */
export function playSound(soundFile, volume = 1.0, gain = 4.0) {
  try {
    const audio = new Audio('/sounds/' + soundFile);
    // Amplifica il volume ma non superare mai 1.0 (limite browser)
    audio.volume = Math.min(volume * gain, 1.0);
    audio.play().catch(error => {
      console.log('Errore riproduzione audio:', error);
    });
  } catch (error) {
    console.log('Audio non supportato:', error);
  }
}

/**
 * Suoni specifici del gioco
 */
export const GameSounds = {
  // Carta estratta
  cardFlip: () => playSound('card_flip.wav'),

  // Movimento cavalli
  horseMove: () => playSound('horse_move.wav'),

  // Asso (movimento -1)
  aceSound: () => playSound('ace_sound.wav'),

  // Re o Fante (movimento +2)
  powerMove: () => playSound('power_move.wav'),

  // Tensione (cavallo vicino al traguardo, posizione 8-10)
  tension: () => playSound('tension.wav'),

  // Vittoria (cavallo supera il traguardo)
  victory: () => playSound('victory.wav')
};

/**
 * Riproduce il suono appropriato in base al movimento del cavallo
 * @param {string} cardValue - Valore della carta (es. 'Asso', 'Re', 'Fante', 'numero')
 * @param {number} oldPosition - Posizione precedente del cavallo
 * @param {number} newPosition - Nuova posizione del cavallo
 */
export function playSoundForCardAndMovement(cardValue, oldPosition, newPosition) {
  // Suono specifico per tipo di carta
  if (cardValue === 'Asso') {
    GameSounds.aceSound();
  } else if (cardValue === 'Re' || cardValue === 'Fante') {
    GameSounds.powerMove();
  } else {
    GameSounds.horseMove();
  }

  // Suono tensione se cavallo entra nella zona critica (8-10)
  if (oldPosition < 8 && newPosition >= 8 && newPosition <= 10) {
    setTimeout(() => {
      GameSounds.tension();
    }, 300); // Ritardo per non sovrapporre con movimento
  }
}

/**
 * Riproduce suono vittoria quando cavallo supera traguardo
 * @param {number} position - Posizione del cavallo
 */
export function playSoundIfVictory(position) {
  if (position > 10) {
    GameSounds.victory();
  }
}

// Esponi GameSounds globalmente per retrocompatibilità con index.html
if (typeof window !== 'undefined') {
  window.playSound = playSound;
  window.GameSounds = GameSounds;
}
