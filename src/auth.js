import { supabase } from './main.js';

// Registrazione nuovo utente
export async function signUp(email, password, username) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username } // meta opzionali
    }
  });

  if (error) throw error;

  // Dopo signup con conferma email, l'utente riceve email
  // Solo dopo click sul link, data.user.email_confirmed_at sarà valorizzato
  return data;
}

// Login
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  return data;
}

// Logout
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Ottieni utente corrente
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Listener per cambio stato auth
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}

// Richiedi reset password (invia email)
export async function requestPasswordReset(email) {
  // Usa sempre l'URL di produzione per il redirect
  const redirectUrl = window.location.hostname === 'localhost'
    ? 'http://localhost:5173/reset-password.html'  // Dev locale
    : 'https://horse-races.vercel.app/reset-password.html';  // Produzione

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl
  });

  if (error) throw error;
  return data;
}

// Aggiorna password (dopo aver cliccato sul link nell'email)
export async function updatePassword(newPassword) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (error) throw error;
  return data;
}
