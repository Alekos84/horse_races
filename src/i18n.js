// Sistema di internazionalizzazione (i18n)
import translationsIT from './i18n/it.json';
import translationsEN from './i18n/en.json';

const translations = {
  it: translationsIT,
  en: translationsEN
};

// Lingua corrente (default: italiano)
let currentLanguage = localStorage.getItem('language') || 'it';

// Listeners per cambio lingua
const languageChangeListeners = [];

/**
 * Ottiene la lingua corrente
 * @returns {string} - 'it' o 'en'
 */
export function getCurrentLanguage() {
  return currentLanguage;
}

/**
 * Imposta la lingua
 * @param {string} lang - 'it' o 'en'
 */
export function setLanguage(lang) {
  if (!translations[lang]) {
    console.error(`Lingua non supportata: ${lang}`);
    return;
  }

  currentLanguage = lang;
  localStorage.setItem('language', lang);

  // Notifica tutti i listeners
  languageChangeListeners.forEach(callback => callback(lang));

  console.log(`✅ Lingua cambiata: ${lang}`);
}

/**
 * Registra un listener per cambio lingua
 * @param {Function} callback - Funzione da chiamare quando cambia la lingua
 */
export function onLanguageChange(callback) {
  languageChangeListeners.push(callback);
}

/**
 * Traduce una chiave
 * @param {string} key - Chiave della traduzione (es: 'auth.login.title')
 * @param {Object} params - Parametri per sostituire placeholder (es: {name: 'Mario'})
 * @returns {string} - Testo tradotto
 */
export function t(key, params = {}) {
  const keys = key.split('.');
  let value = translations[currentLanguage];

  // Naviga nell'oggetto traduzioni
  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
    } else {
      console.warn(`Traduzione non trovata per chiave: ${key} (lingua: ${currentLanguage})`);
      return key; // Ritorna la chiave stessa se non trovata
    }
  }

  // Se il valore finale non è una stringa, ritorna la chiave
  if (typeof value !== 'string') {
    console.warn(`Traduzione non valida per chiave: ${key}`);
    return key;
  }

  // Sostituisci i placeholder {variable} con i parametri
  let result = value;
  Object.keys(params).forEach(param => {
    result = result.replace(new RegExp(`\\{${param}\\}`, 'g'), params[param]);
  });

  return result;
}

/**
 * Switch tra italiano e inglese
 */
export function toggleLanguage() {
  const newLang = currentLanguage === 'it' ? 'en' : 'it';
  setLanguage(newLang);
}

/**
 * Ottiene l'emoji della bandiera per la lingua corrente
 * @returns {string} - Emoji bandiera
 */
export function getLanguageFlag() {
  return currentLanguage === 'it' ? '🇮🇹' : '🇬🇧';
}

/**
 * Ottiene il nome della lingua corrente
 * @returns {string} - Nome della lingua
 */
export function getLanguageName() {
  return currentLanguage === 'it' ? 'Italiano' : 'English';
}
