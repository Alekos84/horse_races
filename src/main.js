// src/main.js
import { createClient } from '@supabase/supabase-js';
import { initAuth } from './auth-ui.js';
import { showLobby, joinRoom } from './lobby-ui.js';
import { initI18n } from './i18n.js';
import './style.css';

// Legge le variabili dal file .env (dev) / da Netlify (prod)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Crea il client Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Esponi supabase, showLobby e joinRoom globalmente per il codice inline dell'HTML
window.supabase = supabase;
window.showLobby = showLobby;
window.joinRoom = joinRoom;

window.addEventListener('DOMContentLoaded', async () => {
  console.log('Vite pronto. Supabase URL:', (supabaseUrl || '').slice(0, 40) + '...');

  // Chiamata innocua per verificare che l'SDK risponda
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error('⚠️ Supabase: errore di connessione/auth:', error);
  } else {
    console.log('✅ Supabase OK. Sessione utente:', data?.session ? 'presente' : 'assente');
  }

  // Inizializza sistema traduzioni
  initI18n();

  // Inizializza autenticazione
  initAuth();
});
