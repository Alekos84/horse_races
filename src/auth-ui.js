import { signUp, signIn, signOut, getCurrentUser, onAuthStateChange, requestPasswordReset } from './auth.js';
import { supabase } from './main.js';
import { t, getCurrentLanguage, setLanguage, toggleLanguage, getLanguageFlag, onLanguageChange } from './i18n.js';

let authModal = null;

// Crea il modal HTML
export function createAuthModal() {
  authModal = document.createElement('div');
  authModal.id = 'auth-modal';
  updateAuthModalContent();
  document.body.appendChild(authModal);
  attachAuthHandlers();

  // Listener per cambio lingua - ricarica il contenuto
  onLanguageChange(() => {
    updateAuthModalContent();
    attachAuthHandlers();
  });
}

// Aggiorna il contenuto del modal con le traduzioni
function updateAuthModalContent() {
  if (!authModal) return;

  authModal.innerHTML = `
    <div class="auth-modal-overlay">
      <div class="auth-modal-content">
        <h2>${t('auth.title')}</h2>
        <p class="auth-subtitle">${t('auth.subtitle')}</p>

        <div id="auth-forms">
          <!-- Form Login -->
          <div id="login-form" class="auth-form active">
            <h3>${t('auth.login.title')}</h3>
            <input type="email" id="login-email" placeholder="${t('auth.login.email')}" required />
            <div style="position: relative; width: 100%; margin-bottom: 15px;">
              <input type="password" id="login-password" placeholder="${t('auth.login.password')}" required style="width: 100%; padding-right: 45px; margin-bottom: 0;" />
              <button type="button" id="toggle-login-password" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: transparent; border: none; cursor: pointer; font-size: 18px; padding: 5px; z-index: 10; width: auto; height: auto;">👁️</button>
            </div>
            <button id="login-btn">${t('auth.login.button')}</button>
            <p class="auth-switch">${t('auth.login.noAccount')} <a href="#" id="show-signup">${t('auth.login.signupLink')}</a></p>
            <p class="auth-switch"><a href="#" id="show-forgot-password">${t('auth.login.forgotPassword')}</a></p>
            <div id="login-message" class="auth-message"></div>
          </div>

          <!-- Form Registrazione -->
          <div id="signup-form" class="auth-form">
            <h3>${t('auth.signup.title')}</h3>
            <input type="text" id="signup-username" placeholder="${t('auth.signup.username')}" required />
            <input type="email" id="signup-email" placeholder="${t('auth.signup.email')}" required />
            <div style="position: relative; width: 100%; margin-bottom: 15px;">
              <input type="password" id="signup-password" placeholder="${t('auth.signup.password')}" required style="width: 100%; padding-right: 45px; margin-bottom: 0;" />
              <button type="button" id="toggle-signup-password" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: transparent; border: none; cursor: pointer; font-size: 18px; padding: 5px; z-index: 10; width: auto; height: auto;">👁️</button>
            </div>
            <button id="signup-btn">${t('auth.signup.button')}</button>
            <p class="auth-switch">${t('auth.signup.hasAccount')} <a href="#" id="show-login">${t('auth.signup.loginLink')}</a></p>
            <div id="signup-message" class="auth-message"></div>
          </div>

          <!-- Form Recupero Password -->
          <div id="forgot-password-form" class="auth-form">
            <h3>${t('auth.forgotPassword.title')}</h3>
            <p style="color: #ccc; font-size: 14px; margin-bottom: 15px;">${t('auth.forgotPassword.description')}</p>
            <input type="email" id="forgot-email" placeholder="${t('auth.forgotPassword.email')}" required />
            <button id="forgot-btn">${t('auth.forgotPassword.button')}</button>
            <p class="auth-switch"><a href="#" id="back-to-login">${t('auth.forgotPassword.backToLogin')}</a></p>
            <div id="forgot-message" class="auth-message"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Gestori eventi
function attachAuthHandlers() {
  // Toggle password visibility per login
  document.getElementById('toggle-login-password').addEventListener('click', () => {
    const passwordInput = document.getElementById('login-password');
    const toggleBtn = document.getElementById('toggle-login-password');
    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      toggleBtn.textContent = '🙈';
    } else {
      passwordInput.type = 'password';
      toggleBtn.textContent = '👁️';
    }
  });

  // Toggle password visibility per signup
  document.getElementById('toggle-signup-password').addEventListener('click', () => {
    const passwordInput = document.getElementById('signup-password');
    const toggleBtn = document.getElementById('toggle-signup-password');
    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      toggleBtn.textContent = '🙈';
    } else {
      passwordInput.type = 'password';
      toggleBtn.textContent = '👁️';
    }
  });

  // Switch tra login e signup
  document.getElementById('show-signup').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-form').classList.remove('active');
    document.getElementById('signup-form').classList.add('active');
    clearMessages();
  });

  document.getElementById('show-login').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('signup-form').classList.remove('active');
    document.getElementById('forgot-password-form').classList.remove('active');
    document.getElementById('login-form').classList.add('active');
    clearMessages();
  });

  document.getElementById('show-forgot-password').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-form').classList.remove('active');
    document.getElementById('signup-form').classList.remove('active');
    document.getElementById('forgot-password-form').classList.add('active');
    clearMessages();
  });

  document.getElementById('back-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('forgot-password-form').classList.remove('active');
    document.getElementById('login-form').classList.add('active');
    clearMessages();
  });

  // Login
  document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const messageEl = document.getElementById('login-message');

    if (!email || !password) {
      showMessage(messageEl, t('auth.login.fillAll'), 'error');
      return;
    }

    try {
      await signIn(email, password);
      showMessage(messageEl, t('auth.login.success'), 'success');
    } catch (error) {
      showMessage(messageEl, t('auth.login.error', { message: error.message }), 'error');
    }
  });

  // Signup
  document.getElementById('signup-btn').addEventListener('click', async () => {
    const username = document.getElementById('signup-username').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const messageEl = document.getElementById('signup-message');

    if (!username || !email || !password) {
      showMessage(messageEl, t('auth.signup.fillAll'), 'error');
      return;
    }

    if (username.length < 3 || username.length > 30) {
      showMessage(messageEl, t('auth.signup.usernameLength'), 'error');
      return;
    }

    if (password.length < 6) {
      showMessage(messageEl, t('auth.signup.passwordLength'), 'error');
      return;
    }

    try {
      await signUp(email, password, username);
      showMessage(messageEl, t('auth.signup.success'), 'success');
    } catch (error) {
      showMessage(messageEl, t('auth.signup.error', { message: error.message }), 'error');
    }
  });

  // Recupero password
  document.getElementById('forgot-btn').addEventListener('click', async () => {
    const email = document.getElementById('forgot-email').value.trim();
    const messageEl = document.getElementById('forgot-message');

    if (!email) {
      showMessage(messageEl, t('auth.forgotPassword.fillEmail'), 'error');
      return;
    }

    try {
      await requestPasswordReset(email);
      showMessage(messageEl, t('auth.forgotPassword.success'), 'success');
      document.getElementById('forgot-email').value = '';
    } catch (error) {
      showMessage(messageEl, t('auth.forgotPassword.error', { message: error.message }), 'error');
    }
  });
}

function clearMessages() {
  document.getElementById('login-message').textContent = '';
  document.getElementById('login-message').className = 'auth-message';
  document.getElementById('signup-message').textContent = '';
  document.getElementById('signup-message').className = 'auth-message';
  const forgotMessage = document.getElementById('forgot-message');
  if (forgotMessage) {
    forgotMessage.textContent = '';
    forgotMessage.className = 'auth-message';
  }
}

function showMessage(element, message, type) {
  element.textContent = message;
  element.className = `auth-message ${type}`;
}

function showAuthModal() {
  if (authModal) authModal.style.display = 'block';
  document.body.classList.add('auth-required');
  hideUserInfo();
}

function hideAuthModal() {
  if (authModal) authModal.style.display = 'none';
  document.body.classList.remove('auth-required');
  showGameModeSelection();
}

function showGameModeSelection() {
  const gameModeSelection = document.getElementById('gameModeSelection');
  if (gameModeSelection) {
    gameModeSelection.style.display = 'block';
  }
}

function showUserInfo(email) {
  const userInfo = document.getElementById('userInfo');
  const userEmail = document.getElementById('userEmail');
  if (userInfo && userEmail) {
    userEmail.textContent = `👤 ${email}`;
    userInfo.style.display = 'flex';
  }
}

function updateLanguageSwitch() {
  const langIT = document.getElementById('langIT');
  const langEN = document.getElementById('langEN');
  const currentLang = getCurrentLanguage();

  if (langIT && langEN) {
    if (currentLang === 'it') {
      // IT attivo
      langIT.style.background = '#2196F3';
      langIT.style.color = 'white';
      langEN.style.background = 'transparent';
      langEN.style.color = 'rgba(255,255,255,0.5)';
    } else {
      // EN attivo
      langEN.style.background = '#2196F3';
      langEN.style.color = 'white';
      langIT.style.background = 'transparent';
      langIT.style.color = 'rgba(255,255,255,0.5)';
    }
  }
}

function hideUserInfo() {
  const userInfo = document.getElementById('userInfo');
  if (userInfo) {
    userInfo.style.display = 'none';
  }
}

export async function initAuth() {
  createAuthModal();

  // Gestione cambio lingua con switch IT|EN
  const langIT = document.getElementById('langIT');
  const langEN = document.getElementById('langEN');

  if (langIT && langEN) {
    // Imposta lo stato iniziale
    updateLanguageSwitch();

    // Click su IT
    langIT.addEventListener('click', () => {
      if (getCurrentLanguage() !== 'it') {
        setLanguage('it');
        updateLanguageSwitch();
      }
    });

    // Click su EN
    langEN.addEventListener('click', () => {
      if (getCurrentLanguage() !== 'en') {
        setLanguage('en');
        updateLanguageSwitch();
      }
    });
  }

  // Gestione logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      console.log('🔘 Logout button clicked');
      if (confirm(t('auth.logout.confirm'))) {
        console.log('🔘 User confirmed logout');
        try {
          console.log('🔘 Calling signOut...');

          // Timeout per il logout
          const logoutPromise = signOut();
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Logout timeout')), 5000)
          );

          await Promise.race([logoutPromise, timeoutPromise]);
          console.log('✅ Logout effettuato');

          // Forza il reload della pagina dopo logout
          console.log('🔘 Reloading page...');
          window.location.reload();
        } catch (error) {
          console.error('❌ Errore durante il logout:', error);
          // Forza comunque il reload anche in caso di errore
          console.log('🔘 Force reloading after error...');
          window.location.reload();
        }
      } else {
        console.log('🔘 User cancelled logout');
      }
    });
  } else {
    console.error('❌ Logout button not found!');
  }

  // Controlla subito se c'è già una sessione
  const user = await getCurrentUser();
  if (user) {
    hideAuthModal();
    showUserInfo(user.email);
    console.log('✅ Utente già loggato:', user.email);

    // Controlla se esiste il profilo
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError && profileError.code === 'PGRST116') {
      // Profilo non esiste, crealo
      const username = user.user_metadata?.username || user.email.split('@')[0];
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          username: username
        });

      if (insertError) {
        console.error('❌ Errore creazione profilo:', insertError);
      } else {
        console.log('✅ Profilo creato:', username);
      }
    }
  } else {
    showAuthModal();
    console.log('⚠️ Nessun utente loggato');
  }

  // Ascolta i cambiamenti di stato
  onAuthStateChange(async (event, session) => {
    if (session) {
      hideAuthModal();
      const user = await getCurrentUser();
      showUserInfo(user.email);
      console.log('✅ Utente loggato:', user.email);

      // Controlla se esiste il profilo
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError && profileError.code === 'PGRST116') {
        // Profilo non esiste, crealo
        const username = user.user_metadata?.username || user.email.split('@')[0];
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            username: username
          });

        if (insertError) {
          console.error('❌ Errore creazione profilo:', insertError);
        } else {
          console.log('✅ Profilo creato:', username);
        }
      }
    } else {
      showAuthModal();
      console.log('⚠️ Nessun utente loggato');
    }
  });
}
