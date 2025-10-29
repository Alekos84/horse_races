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
