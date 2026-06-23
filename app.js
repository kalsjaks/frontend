/* ═══════════════════════════════════════════════════════════
   BloomWell PCOS — Frontend Application Logic (Deploy Trigger)
   Handles: State, Authentication (New/Existing Wizard),
            Multi-tab Router, Logging Modals, and RAG Backend
   ═══════════════════════════════════════════════════════════ */

// ── Supabase & OpenAI Configuration (Serverless RAG Setup) ─────────────────────
const SUPABASE_URL = 'https://xgusmjxwqworgxqoaoyp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhndXNtanh3cXdvcmd4cW9hb3lwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4OTk1NTYsImV4cCI6MjA5MTQ3NTU1Nn0.ZIiBid3BOIvj2GFoQYV0m3Vg2k0nCDz3ANSrXbM_HSk';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const OPENAI_API_KEY = '';
const BACKEND_API_URL = 'http://localhost:8000';
const DEFAULT_GEMINI_KEY = 'AQ.' + 'Ab8RN6J9O5qx4fbiakOOowsUbDMa_gjf8ROd5wBdotw1A1lMAQ';



let isLoading = false;
let suggestionsHidden = false;
let activeModalId = null;

// ── Application State ─────────────────────────────────────────
let state = {
  user: {
    name: 'Lakshmi',
    pcosType: 'Not Sure',
    age: 24,
    cycleLength: 28,
    height: 165,
    weight: 62,
    isLoggedIn: false
  },
  ai: {
    provider: 'gemini',
    apiKey: ''
  },

  logs: {
    period: 'Last log: 28 days ago',
    vitals: 'Update your daily vitals',
    symptoms: 'Log your daily symptoms',
    lab: 'Log your blood work',
    meds: 'Manage your daily dose'
  },
  vitalsData: {
    water: 2.0,
    sleep: 7.5,
    temp: 36.6
  },
  symptomsData: {
    acne: false,
    fatigue: true,
    hairThinning: false,
    cravings: true,
    bloating: false,
    moodSwings: false
  },
  labData: {
    hba1c: '',
    tsh: '',
    lhFsh: ''
  },
  medsData: {
    metformin: false,
    inositol: true,
    omega3: true,
    vitD: false,
    custom: {},
    customList: []
  }
};

// ── DOM References ────────────────────────────────────────────
// Chat Refs
const messagesArea   = document.getElementById('messagesArea');
const questionInput  = document.getElementById('questionInput');
const sendBtn        = document.getElementById('sendBtn');
const suggestionsBar = document.getElementById('suggestionsBar');
const statusDot      = document.getElementById('statusDot');
const statusIndicator= document.getElementById('statusIndicator');
const statusText     = document.getElementById('statusText');
const chatSubtitle   = document.getElementById('chatSubtitle');

// Auth & Layout Refs
const authContainer = document.getElementById('authContainer');
const appContainer  = document.getElementById('appContainer');

// ── Initialization ────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initApp();
  checkBackendHealth();
  setupInputAutoResize();
  setupKeyboardShortcuts();
});

// ── Supabase Log Syncing ──────────────────────────────────────
async function syncUserLogs(userId) {
  try {
    // 1. Fetch profile
    const { data: profile } = await sb.from('profiles').select('*').eq('id', userId).single();
    if (profile) {
      state.user.name = profile.name;
      state.user.pcosType = profile.pcos_type;
      state.user.age = profile.age;
      state.user.cycleLength = profile.cycle_length;
      state.user.height = profile.height || null;
      state.user.weight = profile.weight || null;
    }

    // 2. Fetch latest period log
    const { data: periods } = await sb.from('period_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1);
    if (periods && periods.length > 0) {
      const p = periods[0];
      state.logs.period = `Last log: ${p.start_date} (Flow: ${p.flow_intensity})`;
    } else {
      state.logs.period = 'Last log: 28 days ago';
    }

    // 3. Fetch latest vitals log
    const { data: vitals } = await sb.from('vitals_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1);
    if (vitals && vitals.length > 0) {
      const v = vitals[0];
      state.vitalsData.water = parseFloat(v.water_liters);
      state.vitalsData.sleep = parseFloat(v.sleep_hours);
      state.vitalsData.temp = parseFloat(v.temp_celsius);
      state.logs.vitals = `Sleep: ${state.vitalsData.sleep.toFixed(1)}h | Water: ${state.vitalsData.water.toFixed(1)}L`;
    } else {
      state.logs.vitals = 'Update your daily vitals';
    }

    // 4. Fetch latest symptoms log
    const { data: symptoms } = await sb.from('symptoms_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1);
    if (symptoms && symptoms.length > 0) {
      const s = symptoms[0];
      state.symptomsData.acne = s.acne;
      state.symptomsData.fatigue = s.fatigue;
      state.symptomsData.hairThinning = s.hair_thinning;
      state.symptomsData.cravings = s.cravings;
      state.symptomsData.bloating = s.bloating;
      state.symptomsData.moodSwings = s.mood_swings;

      let activeSymps = [];
      if (s.acne) activeSymps.push('Acne');
      if (s.fatigue) activeSymps.push('Fatigue');
      if (s.hair_thinning) activeSymps.push('Thinning');
      if (s.cravings) activeSymps.push('Cravings');
      if (s.bloating) activeSymps.push('Bloating');
      if (s.mood_swings) activeSymps.push('Mood');
      state.logs.symptoms = activeSymps.length > 0 ? 'Logged: ' + activeSymps.join(', ') : 'No symptoms logged';
    } else {
      state.logs.symptoms = 'Log your daily symptoms';
    }

    // 5. Fetch latest medication log
    const { data: meds } = await sb.from('medication_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1);
    
    // Ensure custom and customList structures exist
    if (!state.medsData.custom) state.medsData.custom = {};
    if (!state.medsData.customList) state.medsData.customList = [];

    if (meds && meds.length > 0) {
      const m = meds[0];
      state.medsData.metformin = m.metformin;
      state.medsData.inositol = m.inositol;
      state.medsData.omega3 = m.omega3;
      state.medsData.vitD = m.vit_d3;

      let medsTaken = [];
      if (m.metformin) medsTaken.push('Metformin');
      if (m.inositol) medsTaken.push('Inositol');
      if (m.omega3) medsTaken.push('Omega-3');
      if (m.vit_d3) medsTaken.push('Vit D3');

      // Parse custom meds from database
      state.medsData.custom = {};
      const customMedsStr = m.custom_meds || '';
      if (customMedsStr) {
        const customTakenList = customMedsStr.split(',').map(s => s.trim()).filter(Boolean);
        customTakenList.forEach(med => {
          state.medsData.custom[med] = true;
          medsTaken.push(med);
        });
      }

      state.logs.meds = medsTaken.length > 0 ? 'Taken: ' + medsTaken.join(', ') : 'No dose taken today';
    } else {
      state.logs.meds = 'Manage your daily dose';
    }

    // Fetch all historical logs to collect all unique custom medications added by the user
    try {
      const { data: allPastMeds } = await sb.from('medication_logs').select('custom_meds').eq('user_id', userId);
      if (allPastMeds && allPastMeds.length > 0) {
        const uniqueCustomMedsSet = new Set(state.medsData.customList);
        allPastMeds.forEach(log => {
          if (log.custom_meds) {
            log.custom_meds.split(',').map(s => s.trim()).filter(Boolean).forEach(medName => {
              uniqueCustomMedsSet.add(medName);
            });
          }
        });
        state.medsData.customList = Array.from(uniqueCustomMedsSet);
      }
    } catch (dbErr) {
      console.warn('Could not query historical custom medications from Supabase:', dbErr);
    }

    saveState();
    updateUIFromState();
  } catch (err) {
    console.error('Error syncing logs from Supabase:', err);
  }
}

async function initApp() {
  loadState();
  
  // Check active Supabase session
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      state.user.isLoggedIn = true;
      state.user.id = session.user.id;
      await syncUserLogs(session.user.id);
      authContainer.classList.add('hidden');
      appContainer.classList.remove('hidden');
      switchView('home');
    } else {
      state.user.isLoggedIn = false;
      authContainer.classList.remove('hidden');
      appContainer.classList.add('hidden');
      showAuthSubScreen('choice'); // Default to landing choice
    }
  } catch (err) {
    console.error('Failed to get Supabase session:', err);
    state.user.isLoggedIn = false;
    authContainer.classList.remove('hidden');
    appContainer.classList.add('hidden');
    showAuthSubScreen('choice');
  }
  updateUIFromState();
}

// ── State Syncing (Local Storage Fallback) ─────────────────────────────
function loadState() {
  const local = localStorage.getItem('bloomwell_state');
  if (local) {
    try {
      state = JSON.parse(local);
      
      // Initialize state.ai if missing
      if (!state.ai) {
        state.ai = { provider: 'gemini', apiKey: '' };
      }
      
      // Initialize medsData if missing
      if (!state.medsData) {
        state.medsData = { metformin: false, inositol: true, omega3: true, vitD: false, custom: {}, customList: [] };
      }
      if (!state.medsData.custom) {
        state.medsData.custom = {};
      }
      if (!state.medsData.customList) {
        state.medsData.customList = [];
      }
      
      // Auto-migrate users from openai to gemini if they don't have a valid custom OpenAI key configured
      if (state.ai.provider === 'openai') {
        const key = state.ai.apiKey || '';
        if (!key || key.includes('U45NKq0smD')) {
          state.ai.provider = 'gemini';
          state.ai.apiKey = ''; // Reset key
          saveState();
        }
      }
    } catch (e) {
      console.error('Failed to parse local storage state', e);
    }
  }
}

function saveState() {
  localStorage.setItem('bloomwell_state', JSON.stringify(state));
}

function updateUIFromState() {
  // Update name greetings
  document.querySelectorAll('.user-display-name').forEach(el => {
    el.textContent = state.user.name;
  });

  // Update card log descriptions
  document.getElementById('periodLogDesc').textContent = state.logs.period;
  document.getElementById('vitalsLogDesc').textContent = state.logs.vitals;
  document.getElementById('symptomsLogDesc').textContent = state.logs.symptoms;
  document.getElementById('labLogDesc').textContent = state.logs.lab;
  document.getElementById('medsLogDesc').textContent = state.logs.meds;

  // Pre-fill profile settings form
  document.getElementById('profileNameInput').value = state.user.name;
  document.getElementById('profilePcosInput').value = state.user.pcosType;
  document.getElementById('profileAgeInput').value = state.user.age;
  document.getElementById('profileCycleInput').value = state.user.cycleLength;
  if (document.getElementById('profileHeightInput')) {
    document.getElementById('profileHeightInput').value = state.user.height || '';
  }
  if (document.getElementById('profileWeightInput')) {
    document.getElementById('profileWeightInput').value = state.user.weight || '';
  }

  // Pre-fill AI configuration settings
  if (document.getElementById('aiProviderSelect')) {
    document.getElementById('aiProviderSelect').value = state.ai?.provider || 'openai';
  }
  if (document.getElementById('aiApiKeyInput')) {
    document.getElementById('aiApiKeyInput').value = state.ai?.apiKey || '';
  }
  toggleApiKeyPlaceholder();

  // Pre-fill modal fields
  document.getElementById('vitalWater').value = state.vitalsData.water;
  document.getElementById('vitalSleep').value = state.vitalsData.sleep;
  document.getElementById('vitalTemp').value = state.vitalsData.temp;

  document.getElementById('sympAcne').checked = state.symptomsData.acne;
  document.getElementById('sympFatigue').checked = state.symptomsData.fatigue;
  document.getElementById('sympHair').checked = state.symptomsData.hairThinning;
  document.getElementById('sympCravings').checked = state.symptomsData.cravings;
  document.getElementById('sympBloating').checked = state.symptomsData.bloating;
  document.getElementById('sympMood').checked = state.symptomsData.moodSwings;

  document.getElementById('labHba1c').value = state.labData.hba1c;
  document.getElementById('labTsh').value = state.labData.tsh;
  document.getElementById('labLhFsh').value = state.labData.lhFsh;

  // Dynamically populate medications dropdown (LOV) options
  const medSelect = document.getElementById('medSelect');
  if (medSelect) {
    medSelect.innerHTML = `
      <option value="" disabled selected>-- Choose medication --</option>
      <option value="Metformin">Metformin (Insulin)</option>
      <option value="Myo-Inositol">Myo-Inositol (Supplement)</option>
      <option value="Omega-3">Omega-3 Fish Oil</option>
      <option value="Vitamin D3">Vitamin D3</option>
    `;
    const customList = state.medsData.customList || [];
    customList.forEach(med => {
      const opt = document.createElement('option');
      opt.value = med;
      opt.textContent = med;
      medSelect.appendChild(opt);
    });
    const optOthers = document.createElement('option');
    optOthers.value = 'Others';
    optOthers.textContent = 'Others (Enter name...)';
    medSelect.appendChild(optOthers);
  }

  // Dynamically build active medications checklist for today (only show checked/active ones)
  const checklistContainer = document.getElementById('medsChecklistContainer');
  if (checklistContainer) {
    checklistContainer.innerHTML = '';
    let itemsAdded = 0;

    const appendCheckbox = (id, labelText, isChecked, onChangeFn) => {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex; align-items:center; gap:10px; font-size:13.5px; font-weight:500; cursor: pointer; padding: 4px 8px; border-radius: var(--radius-sm); transition: background-color var(--duration);';
      label.className = 'med-checkbox-item';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = id;
      checkbox.checked = isChecked;
      checkbox.style.cssText = 'accent-color:var(--brand-pink); width: 16px; height: 16px;';
      checkbox.addEventListener('change', onChangeFn);

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(' ' + labelText));
      
      label.addEventListener('mouseenter', () => label.style.backgroundColor = 'var(--brand-pink-light)');
      label.addEventListener('mouseleave', () => label.style.backgroundColor = 'transparent');

      checklistContainer.appendChild(label);
      itemsAdded++;
    };

    // Standard medications checklist
    if (state.medsData.metformin) {
      appendCheckbox('medMetformin', 'Metformin (Insulin)', true, () => {
        state.medsData.metformin = false;
        saveState();
        updateUIFromState();
      });
    }
    if (state.medsData.inositol) {
      appendCheckbox('medInositol', 'Myo-Inositol (Supplement)', true, () => {
        state.medsData.inositol = false;
        saveState();
        updateUIFromState();
      });
    }
    if (state.medsData.omega3) {
      appendCheckbox('medOmega3', 'Omega-3 Fish Oil', true, () => {
        state.medsData.omega3 = false;
        saveState();
        updateUIFromState();
      });
    }
    if (state.medsData.vitD) {
      appendCheckbox('medVitD', 'Vitamin D3', true, () => {
        state.medsData.vitD = false;
        saveState();
        updateUIFromState();
      });
    }

    // Custom medications checklist
    const customObj = state.medsData.custom || {};
    const customList = state.medsData.customList || [];
    customList.forEach(med => {
      if (customObj[med]) {
        appendCheckbox(`med_${med.replace(/\s+/g, '_')}`, med, true, () => {
          state.medsData.custom[med] = false;
          saveState();
          updateUIFromState();
        });
      }
    });

    if (itemsAdded === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = 'font-size: 13px; color: var(--text-muted); font-style: italic; text-align: center; padding: 12px;';
      emptyMsg.textContent = 'No medications selected. Choose from the list above and click "Add".';
      checklistContainer.appendChild(emptyMsg);
    }
  }

  // Pre-fill health summary modal
  document.getElementById('summaryPcosType').textContent = state.user.pcosType;
  document.getElementById('summaryLastPeriod').textContent = state.logs.period.replace('Last log: ', '');
  document.getElementById('summaryWater').textContent = state.vitalsData.water.toFixed(1) + ' liters';
  document.getElementById('summarySleep').textContent = state.vitalsData.sleep.toFixed(1) + ' hours';

  // Build symptoms list string
  let symps = [];
  if (state.symptomsData.acne) symps.push('Acne');
  if (state.symptomsData.fatigue) symps.push('Fatigue');
  if (state.symptomsData.hairThinning) symps.push('Hair thinning');
  if (state.symptomsData.cravings) symps.push('Cravings');
  if (state.symptomsData.bloating) symps.push('Bloating');
  if (state.symptomsData.moodSwings) symps.push('Mood swings');
  document.getElementById('summarySymptoms').textContent = symps.length > 0 ? symps.join(', ') : 'None logged';
}

function toggleApiKeyPlaceholder() {
  const providerSelect = document.getElementById('aiProviderSelect');
  const apiKeyInput = document.getElementById('aiApiKeyInput');
  if (!providerSelect || !apiKeyInput) return;

  const provider = providerSelect.value;
  if (provider === 'gemini') {
    apiKeyInput.placeholder = 'Paste your Gemini API key here';
  } else {
    apiKeyInput.placeholder = 'Paste your OpenAI API key here';
  }
}

// ── View Switching (Router) ───────────────────────────────────
function switchView(viewName) {
  // Hide ElevenLabs widget when leaving the home view
  const widget = document.querySelector('elevenlabs-convai');
  if (widget && viewName !== 'home') {
    widget.style.display = 'none';
  }

  // Hide all views
  document.querySelectorAll('.app-view').forEach(view => {
    view.classList.remove('active');
  });

  // Remove active state from all tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.remove('active');
  });

  // Activate chosen view & tab
  if (viewName === 'home') {
    document.getElementById('homeView').classList.add('active');
    document.getElementById('tab-home').classList.add('active');
  } else if (viewName === 'chat') {
    document.getElementById('chatView').classList.add('active');
    document.getElementById('tab-chat').classList.add('active');
    setTimeout(() => questionInput.focus(), 200);
  } else if (viewName === 'settings') {
    document.getElementById('settingsView').classList.add('active');
    document.getElementById('tab-settings').classList.add('active');
  } else if (viewName === 'period') {
    document.getElementById('periodView').classList.add('active');
    document.getElementById('tab-home').classList.add('active');
  } else if (viewName === 'symptoms') {
    document.getElementById('symptomsView').classList.add('active');
    document.getElementById('tab-home').classList.add('active');
  } else if (viewName === 'summary') {
    document.getElementById('summaryView').classList.add('active');
    document.getElementById('tab-home').classList.add('active');
    initSummaryPage();
  }
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Auth Wizard Switching ─────────────────────────────────────
function showAuthSubScreen(screenName) {
  document.querySelectorAll('.auth-sub-screen').forEach(screen => {
    screen.classList.add('hidden');
  });

  if (screenName === 'choice') {
    document.getElementById('authChoiceScreen').classList.remove('hidden');
  } else if (screenName === 'existing') {
    const form = document.getElementById('loginForm');
    if (form) form.reset();
    document.getElementById('authLoginScreen').classList.remove('hidden');
  } else if (screenName === 'new') {
    const form = document.getElementById('setupForm');
    if (form) form.reset();
    document.getElementById('authSetupScreen').classList.remove('hidden');
  } else if (screenName === 'forgot') {
    const form = document.getElementById('forgotForm');
    if (form) form.reset();
    document.getElementById('authForgotScreen').classList.remove('hidden');
  }
}

// ── Profile Dropdown Helpers ─────────────────────────────────────
function toggleProfileDropdown(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('profileDropdown');
  if (dropdown) dropdown.classList.toggle('hidden');
}

function closeProfileDropdown() {
  const dropdown = document.getElementById('profileDropdown');
  if (dropdown) dropdown.classList.add('hidden');
}

// Close dropdown when clicking outside
window.addEventListener('click', () => {
  closeProfileDropdown();
});

// Select chip helper
function selectChip(buttonEl, groupName) {
  const group = document.getElementById(groupName);
  group.querySelectorAll('.chip').forEach(chip => {
    chip.classList.remove('selected');
  });
  buttonEl.classList.add('selected');
}

// ── User Logins / Setup ───────────────────────────────────────
// ── User Logins / Setup ───────────────────────────────────────
async function handleExistingLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsernameInput').value.trim();
  const password = document.getElementById('loginPasswordInput').value;

  if (!username || !password) return;

  showToast('Looking up username...', 'info');

  // Search the profiles table to get the registered email for this username
  const { data: profile, error: searchError } = await sb
    .from('profiles')
    .select('email, name')
    .eq('name', username)
    .maybeSingle();

  if (searchError || !profile) {
    showToast('❌ Username not found. Please try again or create a New User profile.', 'error');
    return;
  }

  if (!profile.email) {
    showToast('⚠️ No email linked to this username. Please contact support.', 'error');
    return;
  }

  showToast('Connecting to secure database...', 'info');

  const { data, error } = await sb.auth.signInWithPassword({ email: profile.email, password: password });

  if (error) {
    showToast('❌ Invalid password. Please try again.', 'error');
    return;
  }

  state.user.id = data.user.id;
  state.user.name = profile.name;
  state.user.isLoggedIn = true;

  await syncUserLogs(data.user.id);

  // Transitions
  authContainer.classList.add('hidden');
  appContainer.classList.remove('hidden');
  switchView('home');

  showToast('🌸 Welcome back, ' + state.user.name + '!', 'success');
}

async function handleNewUserSetup(e) {
  e.preventDefault();
  const name = document.getElementById('newUsernameInput').value.trim();
  const email = document.getElementById('newUserEmailInput').value.trim();
  const password = document.getElementById('newUserPasswordInput').value;
  const age = parseInt(document.getElementById('newUserAgeInput').value) || 28;
  const lang = document.getElementById('newUserLangInput').value;
  const voice = document.getElementById('newUserVoiceInput').checked;

  if (!name || !email || !password) return;

  // Fetch selected PCOS status
  let pcosStatus = 'Not Sure';
  document.querySelectorAll('#pcosStatusGroup .chip').forEach(c => {
    if (c.classList.contains('selected')) pcosStatus = c.textContent.trim();
  });

  // Fetch selected Main Goal
  let mainGoal = 'Track periods';
  document.querySelectorAll('#mainGoalGroup .chip').forEach(c => {
    if (c.classList.contains('selected')) mainGoal = c.textContent.trim();
  });

  showToast('Creating profile in cloud database...', 'info');

  const { data, error } = await sb.auth.signUp({ email, password });

  let userId = null;
  if (error) {
    showToast('❌ Profile creation failed: ' + error.message, 'error');
    return;
  } else {
    userId = data.user?.id || (data.user && data.user.id);
    if (!userId && data.session && data.session.user) {
      userId = data.session.user.id;
    }
  }

  if (!userId) {
    showToast('❌ Error: User ID not generated.', 'error');
    return;
  }

  // Save profile in DB (including the email address lookup key)
  const { error: profileError } = await sb.from('profiles').upsert({
    id: userId,
    name: name,
    email: email,
    pcos_type: pcosStatus,
    age: age,
    cycle_length: 28,
    updated_at: new Date().toISOString()
  });

  if (profileError) {
    console.error('Failed to create profile record:', profileError);
  }

  state.user = {
    id: userId,
    name: name,
    pcosType: pcosStatus,
    age: age,
    cycleLength: 28,
    isLoggedIn: true
  };

  // Reset default log values
  state.logs = {
    period: 'Last log: 28 days ago',
    vitals: 'Update your daily vitals',
    symptoms: 'Log your daily symptoms',
    lab: 'Log your blood work',
    meds: 'Manage your daily dose'
  };

  saveState();
  updateUIFromState();

  // Transitions
  authContainer.classList.add('hidden');
  appContainer.classList.remove('hidden');
  switchView('home');

  showToast('🌸 Welcome to BloomWell PCOS, ' + name + '! Profile created successfully.', 'success');
}

function continueAsGuest() {
  state.user = {
    id: null,
    name: 'Guest User',
    pcosType: 'Not Sure',
    age: 24,
    cycleLength: 28,
    isLoggedIn: true
  };

  // Reset default log values
  state.logs = {
    period: 'Last log: 28 days ago',
    vitals: 'Update your daily vitals',
    symptoms: 'Log your daily symptoms',
    lab: 'Log your blood work',
    meds: 'Manage your daily dose'
  };

  saveState();
  updateUIFromState();

  // Transitions
  authContainer.classList.add('hidden');
  appContainer.classList.remove('hidden');
  switchView('home');

  showToast('🌸 Welcome to BloomWell PCOS! You are logged in as a Guest (offline local mode).', 'success');
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const email = document.getElementById('forgotEmailInput').value.trim();

  if (!email) return;

  showToast('Sending password reset email...', 'info');

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });

  if (error) {
    showToast('❌ Failed to send reset link: ' + error.message, 'error');
  } else {
    showToast('📨 Reset link sent successfully! Check your email inbox.', 'success');
    showAuthSubScreen('existing');
  }
}


async function handleLogout() {
  await sb.auth.signOut();
  state.user.isLoggedIn = false;
  state.user.id = null;
  saveState();

  appContainer.classList.add('hidden');
  authContainer.classList.remove('hidden');
  showAuthSubScreen('choice'); // Return to choice select

  showToast('👋 Logged out from BloomWell PCOS successfully.', 'info');
}

async function handleSaveProfile(e) {
  e.preventDefault();
  const name = document.getElementById('profileNameInput').value.trim();
  const pcos = document.getElementById('profilePcosInput').value;
  const age = parseInt(document.getElementById('profileAgeInput').value) || 24;
  const cycle = parseInt(document.getElementById('profileCycleInput').value) || 28;
  const height = parseInt(document.getElementById('profileHeightInput').value) || null;
  const weight = parseInt(document.getElementById('profileWeightInput').value) || null;

  if (!name) return;

  state.user.name = name;
  state.user.pcosType = pcos;
  state.user.age = age;
  state.user.cycleLength = cycle;
  state.user.height = height;
  state.user.weight = weight;

  // Save AI Settings
  state.ai = {
    provider: document.getElementById('aiProviderSelect').value,
    apiKey: document.getElementById('aiApiKeyInput').value.trim()
  };

  saveState();
  updateUIFromState();

  if (state.user.id) {
    const { error } = await sb.from('profiles').upsert({
      id: state.user.id,
      name: name,
      pcos_type: pcos,
      age: age,
      cycle_length: cycle,
      height: height,
      weight: weight,
      updated_at: new Date().toISOString()
    });
    if (error) console.error('Failed to update settings in Supabase:', error);
  }
  
  showToast('✓ Profile settings updated successfully.', 'success');
  switchView('home');
}

// ── Interactive Logging Modals ────────────────────────────────
function openLogPeriodModal() { openModal('modal-period'); }
function openVitalsModal() { openModal('modal-vitals'); }
function openSymptomsModal() { openModal('modal-symptoms'); }
function openLabResultsModal() { openModal('modal-lab'); }
function openMedicationsModal() { openModal('modal-meds'); }
function openHealthSummaryModal() { openModal('modal-summary'); }

function openModal(modalId) {
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.remove('hidden');
  
  // Hide all other modal contents
  overlay.querySelectorAll('.modal-content').forEach(modal => {
    modal.classList.add('hidden');
  });

  const targetModal = document.getElementById(modalId);
  targetModal.classList.remove('hidden');
  activeModalId = modalId;
}

function closeActiveModal() {
  if (!activeModalId) return;
  document.getElementById(activeModalId).classList.add('hidden');
  document.getElementById('modalOverlay').classList.add('hidden');
  activeModalId = null;
}

function closeModalOnOverlay(e) {
  if (e.target.id === 'modalOverlay') {
    closeActiveModal();
  }
}

// Submit logs
async function submitPeriodLog() {
  const start = document.getElementById('periodStartDate').value;
  const flow = document.getElementById('periodFlow').value;

  if (!start) {
    showToast('⚠️ Please select a period start date.', 'error');
    return;
  }

  state.logs.period = `Last log: ${start} (Flow: ${flow})`;
  saveState();
  updateUIFromState();
  closeActiveModal();

  if (state.user.id) {
    const { error } = await sb.from('period_logs').insert({
      user_id: state.user.id,
      start_date: start,
      flow_intensity: flow
    });
    if (error) console.error('Failed to log period to Supabase:', error);
  }

  showToast('🌸 Menstrual period logged successfully!', 'success');
}

async function submitVitalsLog() {
  const water = parseFloat(document.getElementById('vitalWater').value) || 2.0;
  const sleep = parseFloat(document.getElementById('vitalSleep').value) || 7.5;
  const temp = parseFloat(document.getElementById('vitalTemp').value) || 36.6;

  state.vitalsData.water = water;
  state.vitalsData.sleep = sleep;
  state.vitalsData.temp = temp;
  
  state.logs.vitals = `Sleep: ${sleep.toFixed(1)}h | Water: ${water.toFixed(1)}L`;

  saveState();
  updateUIFromState();
  closeActiveModal();

  if (state.user.id) {
    const { error } = await sb.from('vitals_logs').insert({
      user_id: state.user.id,
      water_liters: water,
      sleep_hours: sleep,
      temp_celsius: temp
    });
    if (error) console.error('Failed to log vitals to Supabase:', error);
  }

  showToast('🩺 Daily vitals updated successfully.', 'success');
}

async function submitSymptomsLog() {
  const acne = document.getElementById('sympAcne').checked;
  const fatigue = document.getElementById('sympFatigue').checked;
  const hair = document.getElementById('sympHair').checked;
  const cravings = document.getElementById('sympCravings').checked;
  const bloating = document.getElementById('sympBloating').checked;
  const mood = document.getElementById('sympMood').checked;

  state.symptomsData.acne = acne;
  state.symptomsData.fatigue = fatigue;
  state.symptomsData.hairThinning = hair;
  state.symptomsData.cravings = cravings;
  state.symptomsData.bloating = bloating;
  state.symptomsData.moodSwings = mood;

  let activeSymps = [];
  if (acne) activeSymps.push('Acne');
  if (fatigue) activeSymps.push('Fatigue');
  if (hair) activeSymps.push('Thinning');
  if (cravings) activeSymps.push('Cravings');
  if (bloating) activeSymps.push('Bloating');
  if (mood) activeSymps.push('Mood');

  state.logs.symptoms = activeSymps.length > 0 ? 'Logged: ' + activeSymps.join(', ') : 'No symptoms logged';

  saveState();
  updateUIFromState();
  closeActiveModal();

  if (state.user.id) {
    const { error } = await sb.from('symptoms_logs').insert({
      user_id: state.user.id,
      acne: acne,
      fatigue: fatigue,
      hair_thinning: hair,
      cravings: cravings,
      bloating: bloating,
      mood_swings: mood
    });
    if (error) console.error('Failed to log symptoms to Supabase:', error);
  }

  showToast('📝 Daily symptoms logged successfully.', 'success');
}

function submitLabLog() {
  const hba1c = document.getElementById('labHba1c').value.trim();
  const tsh = document.getElementById('labTsh').value.trim();
  const lhFsh = document.getElementById('labLhFsh').value.trim();

  state.labData.hba1c = hba1c;
  state.labData.tsh = tsh;
  state.labData.lhFsh = lhFsh;

  let markers = [];
  if (hba1c) markers.push(`HbA1c ${hba1c}%`);
  if (tsh) markers.push(`TSH ${tsh}`);
  if (lhFsh) markers.push(`Ratio ${lhFsh}`);

  state.logs.lab = markers.length > 0 ? 'Logged: ' + markers.join(' · ') : 'Log your blood work';

  saveState();
  updateUIFromState();
  closeActiveModal();

  showToast('🔬 Blood lab results recorded.', 'success');
}

// Dropdown selection change handler for medications
function handleMedSelectChange() {
  const select = document.getElementById('medSelect');
  const container = document.getElementById('customMedContainer');
  if (select && container) {
    if (select.value === 'Others') {
      container.classList.remove('hidden');
      const input = document.getElementById('customMedInput');
      if (input) input.focus();
    } else {
      container.classList.add('hidden');
    }
  }
}

// Add medication from the LOV dropdown select or custom input field
function addMedicationFromSelect() {
  const select = document.getElementById('medSelect');
  if (!select) return;

  let medName = select.value;
  if (!medName) {
    showToast('⚠️ Please select a medication or choose "Others".', 'error');
    return;
  }

  if (medName === 'Others') {
    const input = document.getElementById('customMedInput');
    medName = input ? input.value.trim() : '';
    if (!medName) {
      showToast('⚠️ Please enter a medicine name.', 'error');
      return;
    }

    // Normalize standard medications if entered in custom input
    const stdMap = {
      'metformin': 'Metformin',
      'inositol': 'Myo-Inositol',
      'myo-inositol': 'Myo-Inositol',
      'omega-3': 'Omega-3',
      'omega3': 'Omega-3',
      'omega-3 fish oil': 'Omega-3',
      'vitamin d3': 'Vitamin D3',
      'vit d3': 'Vitamin D3',
      'vit d': 'Vitamin D3'
    };
    const norm = medName.toLowerCase();
    if (stdMap[norm]) {
      medName = stdMap[norm];
    }
  }

  // Handle standard medications by updating their state values to true
  if (medName === 'Metformin') {
    state.medsData.metformin = true;
  } else if (medName === 'Myo-Inositol' || medName === 'Inositol') {
    state.medsData.inositol = true;
  } else if (medName === 'Omega-3' || medName === 'Omega-3 Fish Oil') {
    state.medsData.omega3 = true;
  } else if (medName === 'Vitamin D3') {
    state.medsData.vitD = true;
  } else {
    // Handle custom medications
    if (!state.medsData.customList) state.medsData.customList = [];
    if (!state.medsData.custom) state.medsData.custom = {};

    if (!state.medsData.customList.includes(medName)) {
      state.medsData.customList.push(medName);
    }
    state.medsData.custom[medName] = true;
  }

  saveState();
  updateUIFromState();

  // Reset LOV selectors & inputs
  select.value = '';
  const container = document.getElementById('customMedContainer');
  if (container) container.classList.add('hidden');
  const input = document.getElementById('customMedInput');
  if (input) input.value = '';

  showToast(`✓ Added ${medName} to checklist.`, 'success');
}

async function submitMedsLog() {
  const met = !!state.medsData.metformin;
  const ino = !!state.medsData.inositol;
  const ome = !!state.medsData.omega3;
  const vit = !!state.medsData.vitD;

  // Process standard medications taken
  let medsTaken = [];
  if (met) medsTaken.push('Metformin');
  if (ino) medsTaken.push('Inositol');
  if (ome) medsTaken.push('Omega-3');
  if (vit) medsTaken.push('Vit D3');

  // Process custom medications taken
  let customMedsTaken = [];
  const customObj = state.medsData.custom || {};
  for (const [medName, isChecked] of Object.entries(customObj)) {
    if (isChecked) {
      customMedsTaken.push(medName);
      medsTaken.push(medName);
    }
  }

  state.logs.meds = medsTaken.length > 0 ? 'Taken: ' + medsTaken.join(', ') : 'No dose taken today';

  saveState();
  updateUIFromState();
  closeActiveModal();

  if (state.user.id) {
    const customMedsString = customMedsTaken.join(', ');
    
    // Attempt insert with the custom_meds column
    const { error } = await sb.from('medication_logs').insert({
      user_id: state.user.id,
      metformin: met,
      inositol: ino,
      omega3: ome,
      vit_d3: vit,
      custom_meds: customMedsString
    });

    if (error) {
      // Check if it's due to the custom_meds column not existing on remote DB yet
      if (error.message && error.message.includes('custom_meds')) {
        console.warn("custom_meds column does not exist on remote Supabase instance. Falling back to standard columns...");
        
        const { error: fallbackError } = await sb.from('medication_logs').insert({
          user_id: state.user.id,
          metformin: met,
          inositol: ino,
          omega3: ome,
          vit_d3: vit
        });

        if (fallbackError) {
          console.error('Failed to log standard medications to Supabase:', fallbackError);
          showToast('❌ Failed to log medications to cloud.', 'error');
          return;
        } else {
          showToast('💊 Saved locally! Run SQL update in your Supabase dashboard to sync custom meds in the cloud.', 'info');
          return;
        }
      } else {
        console.error('Failed to log medications to Supabase:', error);
        showToast('❌ Failed to log medications to cloud.', 'error');
        return;
      }
    }
  }

  showToast('💊 Daily medications logged.', 'success');
}

// Toast alerts helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast-message ${type === 'success' ? 'toast-success' : ''}`;
  toast.innerHTML = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, -20px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function triggerNotification() {
  showToast('🔔 Tip: Sync your daily exercise with your cycle phase! Ask Dost AI for tips.', 'info');
}

// ── RAG Backend AI Assistant Flow ─────────────────────────────

// Backend health check (modified for direct serverless Supabase RAG)
async function checkBackendHealth() {
  try {
    const { data, error } = await sb.from('profiles').select('id').limit(1);
    if (error) throw error;

    setStatus('online', '● Cloud Connected');
    statusDot.className = 'status-dot';
    chatSubtitle.textContent = '✓ Knowledge base active (Supabase pgvector) — ready to answer';
  } catch (e) {
    console.error("Database connection error:", e);
    setStatus('offline', '● Connection Error');
    statusDot.className = 'status-dot error';
    chatSubtitle.textContent = 'Cannot reach database — check network connection';
    appendSystemMessage(
      '❌ <strong>Database connection failed.</strong> ' +
      'Please check your internet connection and Supabase integration.'
    );
  }
}

function setStatus(stateName, text) {
  statusIndicator.className = `status-indicator ${stateName}`;
  statusText.textContent = text;
}

// Input helpers
function setupInputAutoResize() {
  if (!questionInput) return;
  questionInput.addEventListener('input', () => {
    questionInput.style.height = 'auto';
    questionInput.style.height = Math.min(questionInput.scrollHeight, 100) + 'px';
  });
}

function setupKeyboardShortcuts() {
  if (!questionInput) return;
  questionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading) sendQuestion();
    }
  });
}

// Suggestion chips
function useSuggestion(btn) {
  questionInput.value = btn.textContent;
  questionInput.style.height = 'auto';
  questionInput.dispatchEvent(new Event('input'));
  sendQuestion();
}

function hideSuggestionsBar() {
  if (!suggestionsHidden && suggestionsBar) {
    suggestionsHidden = true;
    suggestionsBar.style.transition = 'max-height 0.3s ease, opacity 0.3s ease, padding 0.3s ease';
    suggestionsBar.style.maxHeight = suggestionsBar.offsetHeight + 'px';
    requestAnimationFrame(() => {
      suggestionsBar.style.maxHeight = '0';
      suggestionsBar.style.opacity = '0';
      suggestionsBar.style.paddingTop = '0';
      suggestionsBar.style.paddingBottom = '0';
    });
    setTimeout(() => { suggestionsBar.style.display = 'none'; }, 300);
  }
}

// ── Serverless RAG Embedding and Generation Helpers ─────────────────────────────
let extractor = null;
let isModelLoading = false;

async function getEmbedding(text) {
  if (!extractor) {
    if (isModelLoading) {
      while (!extractor) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      return output.tolist()[0];
    }
    isModelLoading = true;
    try {
      showToast('📥 Loading local browser semantic analyzer (23MB)...', 'info');
      const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.14.0');
      extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      showToast('✓ Semantic analyzer loaded successfully.', 'success');
    } catch (err) {
      isModelLoading = false;
      showToast('❌ Failed to load semantic analyzer. Using general AI fallback.', 'error');
      throw err;
    }
    isModelLoading = false;
  }
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return output.tolist()[0];
}

async function generateAnswer(question, context, userContext) {
  const provider = state.ai?.provider || 'gemini';
  const userKey = state.ai?.apiKey || (provider === 'gemini' ? DEFAULT_GEMINI_KEY : '');

  const systemPrompt = `You are PCOSCare AI — a compassionate, evidence-based PCOS health assistant.
You help users understand their PCOS, manage symptoms, and make informed lifestyle decisions.

GUIDELINES:
- Always be empathetic and encouraging
- Base answers on the retrieved knowledge base context
- When context is insufficient, say so honestly and suggest consulting a doctor
- Personalize responses when user health data is provided
- Use plain language, avoid excessive medical jargon
- Never diagnose; always recommend professional consultation for medical decisions

CONTEXT FROM PCOS KNOWLEDGE BASE:
${context || 'No relevant documents found in knowledge base.'}

USER HEALTH DATA (if available):
${userContext || ''}
`;

  const externalSystemPrompt = `You are PCOSCare AI — a compassionate, evidence-based PCOS health assistant.
You help users understand their PCOS, manage symptoms, and make informed lifestyle decisions.

NOTE: The internal PCOS knowledge base does not contain specific information about this question.
You are answering from your general medical training knowledge.

GUIDELINES:
- Always be empathetic and encouraging
- Clearly acknowledge that this answer comes from general knowledge, not curated internal documents
- Suggest the user consult a healthcare professional for personalized advice
- Use plain language, avoid excessive medical jargon
- Never diagnose; always recommend professional consultation for medical decisions
`;

  const hasContext = context && context.trim().length > 0;
  const sysPrompt = hasContext ? systemPrompt : externalSystemPrompt;

  if (provider === 'gemini') {
    if (!userKey) {
      throw new Error('Please configure your Google Gemini API key in Profile Settings to use Gemini.');
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${userKey}`,

      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: sysPrompt }]
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: question }]
            }
          ],
          generationConfig: {
            temperature: 0.3
          }
        })
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMessage = errData.error?.message || `Gemini API error ${response.status}`;
      throw new Error(`Gemini API Error: ${errMessage}`);
    }

    const resJson = await response.json();
    try {
      const text = resJson.candidates[0].content.parts[0].text;
      return text;
    } catch (e) {
      console.error('Failed to parse Gemini response:', resJson);
      throw new Error('Could not parse Gemini API response. Check console logs.');
    }
  } else {
    // OpenAI provider
    const apiKey = userKey || OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Please configure your OpenAI API key in Profile Settings to use OpenAI.');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: question }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      let errMessage = errData.error?.message || `OpenAI error ${response.status}`;
      if (errMessage.includes('quota') || response.status === 429) {
        errMessage += '<br/><br/>💡 <strong>Tip:</strong> You can bypass this developer quota limit by going to <strong>Profile Settings</strong> (via the top-right avatar dropdown) and entering your own OpenAI or Google Gemini API key.';
      }
      throw new Error(errMessage);
    }

    const resJson = await response.json();
    return resJson.choices[0].message.content;
  }
}

// Local rule-based and vector database fallback for the Dost Chatbot
function runLocalChatbotFallback(question, documents = []) {
  const q = question.toLowerCase().trim();
  let answer = '';
  let sources = [];
  let sourceType = 'external';
  let confidence = 0.0;

  // If we have matching documents from the Supabase vector search, extract and present them!
  if (documents && documents.length > 0) {
    sourceType = 'internal';
    confidence = documents[0].similarity;
    sources = documents.map(doc => ({
      source: doc.source,
      content: doc.content.substring(0, 300) + '...'
    }));

    answer = `🌸 <strong>Local Database Search:</strong> I found the following relevant information in our internal medical database for you:<br/><br/>`;
    
    documents.forEach((doc) => {
      const cleanContent = doc.content.replace(/\n/g, '<br/>');
      answer += `<div style="margin-bottom: 12px; padding: 10px; background: rgba(46, 125, 50, 0.05); border-left: 3px solid var(--accent-olive, #7CB342); border-radius: 4px;">`;
      answer += `<strong style="color: var(--primary, #2E7D32);">Section: ${doc.source}</strong><br/><div style="margin-top: 5px; line-height: 1.5; font-size: 13.5px;">${cleanContent}</div>`;
      answer += `</div>`;
    });

    answer += `<br/>💡 <em>Tip: You can configure your own OpenAI or Gemini API key in <strong>Profile Settings</strong> (via the top-right avatar dropdown) to enable full conversational AI responses.</em>`;
    return { answer, sources, sourceType, confidence };
  }

  // Common keywords matched locally
  if (q === 'hi' || q === 'hello' || q === 'hey' || q === 'hola' || q === 'yo' || q.includes('who are you')) {
    answer = `Hello! 👋 I'm <strong>Dost</strong>, your personalized <strong>BloomWell PCOS</strong> assistant.<br/><br/>
    I'm currently running in <strong>Local Offline Mode</strong> (as no API keys are currently active). <br/><br/>
    However, I can still help you! Ask me about:<br/>
    🌿 <strong>PCOS Symptoms</strong> (e.g., sugar cravings, acne, fatigue, period pain)<br/>
    🥗 <strong>PCOS Diet & Supplements</strong> (e.g., low GI diet, Inositol, spearmint tea)<br/>
    🏋️ <strong>Cycle-Synced Exercises</strong> (e.g., resistance training, slow-paced cardio)<br/>
    📊 <strong>Your Health Report</strong> (e.g., how to analyze logs)<br/><br/>
    <em>Tip: Open <strong>Profile Settings</strong> from the top-right avatar dropdown to add your own OpenAI or Gemini API key!</em>`;
  }
  else if (q.includes('diet') || q.includes('food') || q.includes('eat') || q.includes('nutrition') || q.includes('sugar') || q.includes('cravings') || q.includes('supplement') || q.includes('inositol')) {
    answer = `🥗 <strong>PCOS Nutrition & Diet Guidelines (Local Offline):</strong><br/><br/>
    Managing PCOS involves supporting insulin sensitivity and reducing inflammation:<br/><br/>
    1. <strong>Low Glycemic Index (GI) Foods:</strong> Focus on complex carbs like quinoa, oats, brown rice, and non-starchy vegetables. Avoid refined sugars and white flour to prevent insulin spikes.<br/>
    2. <strong>High Protein & Healthy Fats:</strong> Pair carbs with lean proteins (tofu, chicken, fish) and healthy fats (avocado, nuts, olive oil) to stabilize blood sugar.<br/>
    3. <strong>Anti-inflammatory Diet:</strong> Incorporate berries, leafy greens, fatty fish, and turmeric to lower systemic inflammation.<br/>
    4. <strong>Supplements:</strong> <br/>
    &nbsp;&nbsp;&nbsp;&nbsp;• <em>Myo-Inositol:</em> Helps improve insulin sensitivity and restore ovulation.<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;• <em>Spearmint Tea:</em> Two cups daily can help lower free testosterone levels and improve hirsutism/acne.<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;• <em>Vitamin D3 & Omega-3:</em> Support hormonal balance and cycle regularity.`;
  }
  else if (q.includes('exercise') || q.includes('workout') || q.includes('training') || q.includes('gym') || q.includes('run') || q.includes('cardio') || q.includes('yoga')) {
    answer = `🏋️ <strong>Cycle-Synced Exercise Guidelines (Local Offline):</strong><br/><br/>
    Workouts should align with your menstrual cycle to manage cortisol levels (stress hormone) and boost metabolism:<br/><br/>
    1. <strong>Menstrual Phase (Days 1-5):</strong> Focus on gentle movements like walking, stretching, or yin yoga. Avoid high-intensity exercises when energy is low.<br/>
    2. <strong>Follicular Phase (Days 6-12):</strong> Energy rises as estrogen increases. Great time for strength training, moderate-intensity cardio, and Pilates.<br/>
    3. <strong>Ovulatory Phase (Days 13-15):</strong> Peak energy. Ideal for high-intensity interval training (HIIT), heavy weight lifting, or challenging runs.<br/>
    4. <strong>Luteal Phase (Days 16-28):</strong> Progesterone dominant. Shift from high-intensity to strength training, slow weighted workouts, or hiking. In the late luteal phase, dial down to low-intensity steady-state (LISS) cardio to prevent cortisol spikes.`;
  }
  else if (q.includes('symptom') || q.includes('acne') || q.includes('hair') || q.includes('fatigue') || q.includes('weight') || q.includes('period') || q.includes('cramp') || q.includes('pain') || q.includes('mood') || q.includes('clot')) {
    answer = `🌿 <strong>PCOS Symptom Management (Local Offline):</strong><br/><br/>
    Here is a breakdown of common symptoms and how to address them:<br/><br/>
    1. <strong>Sugar Cravings & Weight:</strong> Cravings are often caused by insulin resistance. Avoid skipping meals, eat protein-rich breakfasts, and consider Inositol.<br/>
    2. <strong>Hormonal Acne & Hair Loss:</strong> Driven by high androgen (male hormone) levels. Spearmint tea and zinc supplements can help block androgens naturally.<br/>
    3. <strong>Irregular/Heavy Periods:</strong> Focus on reducing chronic stress, optimizing sleep (7.5h+), and monitoring progesterone markers. Track your flow in the <strong>Log Period</strong> page.<br/>
    4. <strong>Fatigue & Mood Swings:</strong> Often tied to blood sugar crashes and vitamin deficiencies. Ensure adequate hydration (2L+) and check your Vitamin D/B12 levels.`;
  }
  else {
    answer = `🌸 <strong>Local Offline Mode:</strong><br/><br/>
    I couldn't find a direct answer to your question in our offline database because no AI API keys are configured (or the quota was exceeded).<br/><br/>
    Here are general PCOS support steps you can take:<br/>
    • Track your symptoms daily under the <strong>Logs</strong> tab.<br/>
    • Review your personalized health score and indicators in the <strong>My Health Summary</strong> page.<br/>
    • To reactivate full AI conversational features, go to <strong>Profile Settings</strong> (avatar dropdown in top right) and enter your OpenAI or Google Gemini API key.`;
  }

  return { answer, sources, sourceType, confidence };
}

// Send question directly using client-side RAG over Supabase
async function sendQuestion() {
  const question = questionInput.value.trim();
  if (!question || isLoading) return;

  hideSuggestionsBar();
  isLoading = true;
  sendBtn.disabled = true;
  statusDot.className = 'status-dot loading';

  // Append user message
  appendUserMessage(question);

  // Reset input
  questionInput.value = '';
  questionInput.style.height = 'auto';

  // Show typing indicator
  const typingId = appendTypingIndicator();

  // Create context payload including user profile details
  const pcosContext = `User is a ${state.user.age}-year-old female named ${state.user.name}. ` +
                      `PCOS Class: ${state.user.pcosType}. Cycle Length: ${state.user.cycleLength} days. ` +
                      `Logged Sleep: ${state.vitalsData.sleep}h. Logged Water: ${state.vitalsData.water}L. ` +
                      `Active logs indicate current period status is ${state.logs.period}.`;

  let documents = [];
  let bestScore = 0.0;
  let contextStr = '';
  let sources = [];
  let sourceType = 'external';

  // A. Try calling the FastAPI Backend first (secures API key in backend .env, supports OpenAI, Gemini, and local Ollama)
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/chat/enhanced`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        question: question,
        user_context: pcosContext
      })
    });

    if (response.ok) {
      const resJson = await response.json();
      removeTypingIndicator(typingId);
      appendBotMessage({
        answer: resJson.answer,
        sources: resJson.sources,
        source_type: resJson.source_type || 'external',
        confidence: resJson.confidence || 0.0
      });
      return; // Success! Return early.
    } else {
      console.warn("Backend API responded with error, falling back to client-side RAG...");
    }
  } catch (netErr) {
    console.warn("Backend API not reachable, falling back to client-side RAG...", netErr);
  }

  // B. Client-side RAG Fallback
  try {
    let queryEmbedding = null;
    const threshold = 0.40;

    // 1. Generate local browser embedding for query
    try {
      queryEmbedding = await getEmbedding(question);
    } catch (embErr) {
      console.warn("Embedding generation failed, falling back to external model:", embErr);
    }

    // 2. Perform Supabase vector similarity search using stored procedure RPC
    if (queryEmbedding) {
      const { data, error } = await sb.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.15, // Let's retrieve potential matches, we filter on threshold later
        match_count: 5
      });

      if (error) {
        console.error("Supabase vector search RPC failed:", error);
      } else if (data && data.length > 0) {
        bestScore = maxScore(data);
        documents = data.filter(d => d.similarity >= threshold);
      }
    }

    // Helper to extract max similarity score
    function maxScore(items) {
      let maxVal = 0.0;
      for (const item of items) {
        if (item.similarity > maxVal) {
          maxVal = item.similarity;
        }
      }
      return maxVal;
    }

    // 3. Ground answer in context or use external LLM fallback
    if (documents.length > 0) {
      sourceType = 'internal';
      contextStr = documents.map(doc => `[Source: ${doc.source}]\n${doc.content}`).join('\n\n---\n\n');
      sources = documents.map(doc => ({
        source: doc.source,
        content: doc.content.substring(0, 300) + '...'
      }));
    }

    // 4. Generate grounded completion from OpenAI
    const answerText = await generateAnswer(question, contextStr, pcosContext);

    removeTypingIndicator(typingId);

    // Render result
    appendBotMessage({
      answer: answerText,
      sources: sources,
      source_type: sourceType,
      confidence: bestScore
    });

  } catch (err) {
    removeTypingIndicator(typingId);

    console.warn("Chatbot generative API failed, running offline fallback helper:", err);
    // Check if it's an API key configuration or quota limit error
    const isApiError = err.message.includes('API key') || err.message.includes('quota') || err.message.includes('429') || err.message.includes('401');

    if (isApiError) {
      const fallbackResult = runLocalChatbotFallback(question, documents);
      appendBotMessage(fallbackResult);
    } else {
      let errMsg = `❌ Error: ${err.message}`;
      if (err.name === 'TimeoutError') {
        errMsg = '⏱️ Request timed out. OpenAI is taking too long — please try again.';
      }
      appendErrorMessage(errMsg);
    }
  } finally {
    isLoading = false;
    sendBtn.disabled = false;
    statusDot.className = 'status-dot';
    questionInput.focus();
  }
}

// ── Message Rendering Helpers ─────────────────────────────────

function appendUserMessage(text) {
  const row = document.createElement('div');
  row.className = 'message-row user-row';
  row.innerHTML = `
    <div class="message-avatar user-avatar">👤</div>
    <div class="message-bubble user-bubble">
      <div class="message-text">${escapeHtml(text)}</div>
      <div class="message-time">${formatTime()}</div>
    </div>
  `;
  messagesArea.appendChild(row);
  scrollBottom();
}

function appendBotMessage(data) {
  const { answer, sources = [], source_type = 'external', confidence = 0 } = data;

  const isInternal = source_type === 'internal';
  const badgeClass = isInternal ? 'source-internal' : 'source-external';
  const badgeIcon  = isInternal ? '🏥' : '🌐';
  const badgeLabel = isInternal
    ? 'From Internal Knowledge Base'
    : 'From External Sources (General AI Knowledge)';

  let sourcesHtml = '';
  if (isInternal && sources.length > 0) {
    const items = sources.map(s => `
      <div class="source-item">
        <span class="source-icon">📄</span>
        <div>
          <div class="source-name">${escapeHtml(s.source)}</div>
          ${s.content ? `<div class="source-preview">${escapeHtml(s.content)}</div>` : ''}
        </div>
      </div>
    `).join('');
    sourcesHtml = `
      <div class="message-sources">
        <div class="sources-title">📚 Sourced From:</div>
        ${items}
      </div>
    `;
  }

  const row = document.createElement('div');
  row.className = 'message-row bot-row';
  row.innerHTML = `
    <div class="message-avatar">🌸</div>
    <div class="message-bubble bot-bubble">
      <span class="message-source-badge ${badgeClass}">${badgeIcon} ${badgeLabel}</span>
      <div class="message-text">${formatAnswer(answer)}</div>
      ${sourcesHtml}
      <div class="message-time">${formatTime()}${isInternal ? ` · Confidence: ${Math.round(confidence * 100)}%` : ''}</div>
    </div>
  `;
  messagesArea.appendChild(row);
  scrollBottom();
}

function appendSystemMessage(html) {
  const row = document.createElement('div');
  row.className = 'message-row bot-row';
  row.innerHTML = `
    <div class="message-avatar">ℹ️</div>
    <div class="message-bubble bot-bubble">
      <div class="message-text" style="font-size:13px;color:var(--text-sub)">${html}</div>
    </div>
  `;
  messagesArea.appendChild(row);
  scrollBottom();
}

function appendErrorMessage(msg) {
  const row = document.createElement('div');
  row.className = 'message-row bot-row';
  row.innerHTML = `
    <div class="message-avatar">⚠️</div>
    <div class="message-bubble bot-bubble">
      <div class="message-text" style="color:#C62828;font-size:13.5px">${msg}</div>
      <div class="message-time">${formatTime()}</div>
    </div>
  `;
  messagesArea.appendChild(row);
  scrollBottom();
}

// Typing indicators
function appendTypingIndicator() {
  const id = 'typing-' + Date.now();
  const row = document.createElement('div');
  row.className = 'message-row bot-row typing-bubble';
  row.id = id;
  row.innerHTML = `
    <div class="message-avatar">🌸</div>
    <div class="message-bubble bot-bubble">
      <div class="message-text">
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  `;
  messagesArea.appendChild(row);
  scrollBottom();
  return id;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// Utilities
function scrollBottom() {
  messagesArea.scrollTo({ top: messagesArea.scrollHeight, behavior: 'smooth' });
}

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatAnswer(text) {
  let html = escapeHtml(text);

  // Blockquotes: lines starting with > (escaped as &gt;)
  html = html.replace(/^&gt;\s*(.+)/gm, '<blockquote style="border-left: 4px solid var(--brand-pink); background: var(--brand-pink-light); padding: 12px; margin: 12px 0; border-radius: var(--radius-sm); color: var(--text-main); font-style: italic;">$1</blockquote>');

  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic: *text*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code: `code`
  html = html.replace(/`(.+?)`/g, '<code style="background:rgba(0,0,0,0.05);padding:1px 5px;border-radius:4px;font-size:13px">$1</code>');

  // Bullet lists: lines starting with - or •
  const lines = html.split('\n');
  let inList = false;
  const processed = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      const content = trimmed.slice(2);
      if (!inList) { inList = true; return `<ul style="margin:8px 0;padding-left:18px"><li style="margin:4px 0">${content}</li>`; }
      return `<li style="margin:4px 0">${content}</li>`;
    } else {
      if (inList) { inList = false; return `</ul>${line}`; }
      return line;
    }
  });
  if (inList) processed.push('</ul>');
  html = processed.join('\n');

  // Double newlines → paragraph breaks
  html = html.replace(/\n\n/g, '</p><p style="margin-top:10px">');
  html = html.replace(/\n/g, '<br>');
  html = `<p>${html}</p>`;

  return html;
}

// ── Period Tracker & Symptoms Log View Logic ─────────────────────────────

function selectFlowCard(cardEl, flowVal) {
  const container = document.getElementById('flowGroup');
  if (!container) return;
  container.querySelectorAll('.flow-option-card').forEach(card => {
    card.classList.remove('selected');
  });
  cardEl.classList.add('selected');
}

function selectPill(btnEl, groupId, val) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.pill-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
  btnEl.classList.add('selected');
}

function toggleSymptomChip(chipEl) {
  chipEl.classList.toggle('selected');
}

function selectSeverityCard(cardEl, val) {
  const container = document.getElementById('severityGroup');
  if (!container) return;
  container.querySelectorAll('.severity-card').forEach(card => {
    card.classList.remove('selected');
  });
  cardEl.classList.add('selected');
}

async function submitFullPeriodLog() {
  const start = document.getElementById('periodStartInput').value;
  const end = document.getElementById('periodEndInput').value;

  if (!start) {
    showToast('⚠️ Please select a period start date.', 'error');
    return;
  }

  // Get Flow
  let flow = 'Medium';
  document.querySelectorAll('#flowGroup .flow-option-card').forEach(card => {
    if (card.classList.contains('selected')) {
      const spans = card.querySelectorAll('span');
      if (spans.length > 1) flow = spans[1].textContent.trim();
    }
  });

  // Get Pain
  const painIndex = document.getElementById('painLevelSlider').value;
  const painLabelsMap = { '1': 'None', '2': 'Mild', '3': 'Bad' };
  const pain = painLabelsMap[painIndex] || 'None';

  // Get Clots
  let clots = 'No';
  document.querySelectorAll('#clotsGroup .pill-btn').forEach(btn => {
    if (btn.classList.contains('selected')) clots = btn.textContent.trim();
  });

  // Get Cycle Status
  let status = 'Regular';
  document.querySelectorAll('#cycleStatusGroup .pill-btn').forEach(btn => {
    if (btn.classList.contains('selected')) status = btn.textContent.trim();
  });

  const notes = document.getElementById('periodNotesInput').value.trim();

  // Save to local state
  state.logs.period = `Last log: ${start} (Flow: ${flow})`;
  saveState();
  updateUIFromState();

  if (state.user.id) {
    const payload = {
      user_id: state.user.id,
      start_date: start,
      flow_intensity: flow,
      end_date: end || null,
      pain_level: pain,
      any_clots: clots === 'Yes',
      cycle_status: status,
      additional_notes: notes
    };

    showToast('Saving cycle log to cloud...', 'info');

    const { error } = await sb.from('period_logs').insert(payload);

    if (error) {
      console.warn("Full insert failed, attempting fallback (standard columns only):", error);
      const standardPayload = {
        user_id: state.user.id,
        start_date: start,
        flow_intensity: flow
      };
      
      const { error: fallbackError } = await sb.from('period_logs').insert(standardPayload);
      if (fallbackError) {
        showToast('❌ Failed to save period log: ' + fallbackError.message, 'error');
        return;
      } else {
        showToast('🌸 Period logged! (Some fields were skipped. Run SQL update in your Supabase Editor.)', 'success');
      }
    } else {
      showToast('🌸 Period log saved successfully!', 'success');
    }
  } else {
    showToast('🌸 Period log saved locally.', 'success');
  }

  // Clear cache and inputs and switch back
  cachedPeriods = [];
  cachedVitals = [];
  cachedSymptoms = [];
  document.getElementById('periodStartInput').value = '';
  document.getElementById('periodEndInput').value = '';
  document.getElementById('periodNotesInput').value = '';
  switchView('home');
}

async function openPeriodHistoryModal() {
  openModal('modal-period-history');
  const container = document.getElementById('periodHistoryList');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-muted);">⌛ Loading history...</div>';

  if (!state.user.id) {
    container.innerHTML = '<div style="text-align:center;padding:12px;color:#C62828;">❌ You must be logged in to view history.</div>';
    return;
  }

  try {
    const { data: logs, error } = await sb
      .from('period_logs')
      .select('*')
      .eq('user_id', state.user.id)
      .order('start_date', { ascending: false });

    if (error) throw error;

    if (!logs || logs.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-muted);">📅 No cycle logs recorded yet.</div>';
      return;
    }

    container.innerHTML = logs.map(log => {
      const start = log.start_date;
      const end = log.end_date || 'Ongoing';
      const flow = log.flow_intensity || 'Medium';
      const pain = log.pain_level || 'None';
      const clots = log.any_clots ? 'Yes' : 'No';
      const status = log.cycle_status || 'Regular';
      const notes = log.additional_notes || '';

      return `
        <div style="background:var(--bg-app); border:1px solid var(--border-strong); border-radius:var(--radius-md); padding:16px; text-align:left; margin-bottom: 8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <strong style="color:var(--brand-pink); font-size:14px;">📅 ${start} to ${end}</strong>
            <span style="background:var(--brand-green-light); color:var(--brand-green); font-size:11px; font-weight:700; padding:2px 8px; border-radius:20px;">${status}</span>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12.5px; color:var(--text-sub);">
            <div>💧 Flow: <strong>${flow}</strong></div>
            <div>⚡ Pain: <strong>${pain}</strong></div>
            <div>🩸 Clots: <strong>${clots}</strong></div>
          </div>
          ${notes ? `<div style="margin-top:8px; border-top:1px dashed var(--border-strong); padding-top:6px; font-size:12px; font-style:italic; color:var(--text-sub);">📝 ${escapeHtml(notes)}</div>` : ''}
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error("Failed to load period history:", err);
    container.innerHTML = `<div style="text-align:center;padding:12px;color:#C62828;">❌ Error: ${err.message}</div>`;
  }
}

async function submitFullSymptomsLog() {
  const acne = document.querySelector('.symptom-chip-toggle[data-symptom="acne"]').classList.contains('selected');
  const fatigue = document.querySelector('.symptom-chip-toggle[data-symptom="fatigue"]').classList.contains('selected');
  const hair = document.querySelector('.symptom-chip-toggle[data-symptom="hair_loss"]').classList.contains('selected');
  const cravings = document.querySelector('.symptom-chip-toggle[data-symptom="cravings"]').classList.contains('selected');
  const bloating = document.querySelector('.symptom-chip-toggle[data-symptom="bloating"]').classList.contains('selected');
  const mood = document.querySelector('.symptom-chip-toggle[data-symptom="mood_swings"]').classList.contains('selected');
  const headache = document.querySelector('.symptom-chip-toggle[data-symptom="headache"]').classList.contains('selected');
  const cramps = document.querySelector('.symptom-chip-toggle[data-symptom="cramps"]').classList.contains('selected');
  const anxiety = document.querySelector('.symptom-chip-toggle[data-symptom="anxiety"]').classList.contains('selected');
  const brain_fog = document.querySelector('.symptom-chip-toggle[data-symptom="brain_fog"]').classList.contains('selected');

  // Severity
  let severity = 'Moderate';
  document.querySelectorAll('#severityGroup .severity-card').forEach(card => {
    if (card.classList.contains('selected')) {
      severity = card.textContent.trim();
    }
  });

  const notes = document.getElementById('symptomNotesInput').value.trim();

  // Update local state
  state.symptomsData = {
    acne,
    fatigue,
    hairThinning: hair,
    cravings,
    bloating,
    moodSwings: mood
  };

  let activeSymps = [];
  if (acne) activeSymps.push('Acne');
  if (fatigue) activeSymps.push('Fatigue');
  if (hair) activeSymps.push('Thinning');
  if (cravings) activeSymps.push('Cravings');
  if (bloating) activeSymps.push('Bloating');
  if (mood) activeSymps.push('Mood');
  if (headache) activeSymps.push('Headache');
  if (cramps) activeSymps.push('Cramps');
  if (anxiety) activeSymps.push('Anxiety');
  if (brain_fog) activeSymps.push('Brain Fog');

  state.logs.symptoms = activeSymps.length > 0 ? 'Logged: ' + activeSymps.join(', ') : 'No symptoms logged';

  saveState();
  updateUIFromState();

  if (state.user.id) {
    const payload = {
      user_id: state.user.id,
      acne,
      fatigue,
      hair_thinning: hair,
      cravings,
      bloating,
      mood_swings: mood,
      headache,
      cramps,
      anxiety,
      brain_fog,
      severity,
      notes
    };

    showToast('Saving symptoms log to cloud...', 'info');

    let { error } = await sb.from('symptoms_logs').insert(payload);

    if (error) {
      console.warn("Full symptoms insert failed, attempting standard columns fallback:", error);
      // Fallback
      const fallbackPayload = {
        user_id: state.user.id,
        acne,
        fatigue,
        hair_thinning: hair,
        cravings,
        bloating,
        mood_swings: mood
      };
      const { error: fallbackError } = await sb.from('symptoms_logs').insert(fallbackPayload);
      if (fallbackError) {
        showToast('❌ Failed to save symptoms log: ' + fallbackError.message, 'error');
        return;
      } else {
        showToast('🌸 Symptoms logged! (Some fields were skipped. Run SQL update in your Supabase Editor.)', 'success');
      }
    } else {
      showToast('🌸 Daily symptoms logged successfully!', 'success');
    }
  } else {
    showToast('🌸 Daily symptoms saved locally.', 'success');
  }

  // Clear cache and inputs and switch back
  cachedPeriods = [];
  cachedVitals = [];
  cachedSymptoms = [];
  document.querySelectorAll('#symptomsChipsGroup .symptom-chip-toggle').forEach(chip => {
    chip.classList.remove('selected');
  });
  document.getElementById('symptomNotesInput').value = '';
  switchView('home');
}

// ── Voice Speech Recognition for Symptoms Log ─────────────────────────────
let speechRecognition = null;
let isSpeechRecording = false;

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("Speech Recognition API is not supported in this browser.");
    return;
  }
  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = false;
  speechRecognition.interimResults = false;
  speechRecognition.lang = 'en-US';

  speechRecognition.onstart = () => {
    isSpeechRecording = true;
    const card = document.getElementById('voiceLogCard');
    if (card) card.classList.add('recording');
    const title = document.getElementById('voiceLogTitle');
    if (title) title.textContent = 'LISTENING...';
    const subtitle = document.getElementById('voiceLogSubtitle');
    if (subtitle) subtitle.textContent = 'Speak your symptoms now';
  };

  speechRecognition.onend = () => {
    isSpeechRecording = false;
    const card = document.getElementById('voiceLogCard');
    if (card) card.classList.remove('recording');
    const title = document.getElementById('voiceLogTitle');
    if (title) title.textContent = 'VOICE LOG';
    const subtitle = document.getElementById('voiceLogSubtitle');
    if (subtitle) subtitle.textContent = 'Tap to speak your symptoms';
  };

  speechRecognition.onerror = (e) => {
    console.error("Speech Recognition Error:", e);
    showToast("🎤 Microphone access error or no speech detected.", "error");
  };

  speechRecognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.toLowerCase();
    const notesInput = document.getElementById('symptomNotesInput');
    if (notesInput) {
      const prevText = notesInput.value.trim();
      notesInput.value = prevText ? `${prevText}. Spoken: ${transcript}` : `Spoken: ${transcript}`;
    }

    // Auto-detect keywords and toggle chips
    const keywordMap = {
      'bloat': 'bloating',
      'acne': 'acne',
      'pimple': 'acne',
      'fatigue': 'fatigue',
      'tired': 'fatigue',
      'exhaust': 'fatigue',
      'mood': 'mood_swings',
      'emotional': 'mood_swings',
      'headache': 'headache',
      'cramp': 'cramps',
      'hair': 'hair_loss',
      'craving': 'cravings',
      'sugar': 'cravings',
      'anxiety': 'anxiety',
      'anxious': 'anxiety',
      'stress': 'anxiety',
      'fog': 'brain_fog'
    };

    let detectedCount = 0;
    for (const [key, symptom] of Object.entries(keywordMap)) {
      if (transcript.includes(key)) {
        const chip = document.querySelector(`.symptom-chip-toggle[data-symptom="${symptom}"]`);
        if (chip && !chip.classList.contains('selected')) {
          chip.classList.add('selected');
          detectedCount++;
        }
      }
    }

    // Auto-detect severity
    if (transcript.includes('severe') || transcript.includes('very bad')) {
      const card = document.querySelector(`.severity-card[onclick*="Severe"]`);
      if (card) selectSeverityCard(card, 'Severe');
    } else if (transcript.includes('mild') || transcript.includes('slight')) {
      const card = document.querySelector(`.severity-card[onclick*="Mild"]`);
      if (card) selectSeverityCard(card, 'Mild');
    } else if (transcript.includes('moderate')) {
      const card = document.querySelector(`.severity-card[onclick*="Moderate"]`);
      if (card) selectSeverityCard(card, 'Moderate');
    }

    if (detectedCount > 0) {
      showToast(`🎤 Detected and selected ${detectedCount} symptom(s) from voice!`, 'success');
    } else {
      showToast('🎤 Voice parsed into notes. Select symptoms manually.', 'info');
    }
  };
}

function toggleVoiceLogging() {
  if (!speechRecognition) {
    initSpeechRecognition();
  }
  if (!speechRecognition) {
    showToast("⚠️ Speech Recognition is not supported by your browser (use Chrome or Edge).", "error");
    return;
  }
  if (isSpeechRecording) {
    speechRecognition.stop();
  } else {
    speechRecognition.start();
  }
}

// ── Health Summary View Logic ─────────────────────────────

let cachedVitals = [];
let cachedPeriods = [];
let cachedSymptoms = [];

async function initSummaryPage() {
  // Update Snapshot labels
  document.getElementById('snapName').textContent = state.user.name || 'N/A';
  document.getElementById('snapPcos').textContent = state.user.pcosType || 'N/A';
  document.getElementById('snapHeight').textContent = state.user.height ? `${state.user.height} cm` : 'N/A';
  document.getElementById('snapWeight').textContent = state.user.weight ? `${state.user.weight} kg` : 'N/A';
  document.getElementById('snapGoal').textContent = state.logs.period ? 'Track periods & manage symptoms' : 'Track periods';

  // Fetch recent symptoms
  if (state.user.id) {
    const { data: symps } = await sb.from('symptoms_logs').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(3);
    const container = document.getElementById('snapSymptoms');
    if (symps && symps.length > 0) {
      container.innerHTML = symps.map(s => {
        let list = [];
        if (s.acne) list.push('Acne');
        if (s.fatigue) list.push('Fatigue');
        if (s.hair_thinning) list.push('Hair loss');
        if (s.cravings) list.push('Cravings');
        if (s.bloating) list.push('Bloating');
        if (s.mood_swings) list.push('Mood swings');
        if (s.headache) list.push('Headache');
        if (s.cramps) list.push('Cramps');
        if (s.anxiety) list.push('Anxiety');
        if (s.brain_fog) list.push('Brain fog');
        
        const dateStr = new Date(s.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
        return `<div style="margin-bottom:6px;font-weight:550;color:var(--text-main);">${dateStr}: <span style="font-weight:700;color:var(--brand-pink);">${list.join(', ') || 'No symptoms'}</span> (${s.severity || 'Moderate'})</div>`;
      }).join('');
    } else {
      container.textContent = 'No recent symptoms logged.';
    }
  }

  // Fetch active medications
  if (state.user.id) {
    const { data: meds } = await sb.from('medication_logs').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(1);
    const container = document.getElementById('snapMeds');
    if (meds && meds.length > 0) {
      const m = meds[0];
      let active = [];
      if (m.metformin) active.push('Metformin (Prescription)');
      if (m.inositol) active.push('Myo-Inositol (Supplement)');
      if (m.omega3) active.push('Omega-3 Fish Oil');
      if (m.vit_d3) active.push('Vitamin D3');
      
      // Parse custom medications
      if (m.custom_meds) {
        m.custom_meds.split(',').map(s => s.trim()).filter(Boolean).forEach(med => {
          active.push(med);
        });
      }

      container.innerHTML = active.length > 0
        ? `<ul style="margin:4px 0;padding-left:16px;">${active.map(a => `<li style="margin:3px 0;font-weight:600;color:var(--text-main);">${a}</li>`).join('')}</ul>`
        : 'No active medications logged.';
    } else {
      container.textContent = 'No medications currently active.';
    }
  }

  // Fetch lab results
  const labsContainer = document.getElementById('snapLabs');
  let markers = [];
  if (state.labData.hba1c) markers.push(`HbA1c: <strong>${state.labData.hba1c}%</strong>`);
  if (state.labData.tsh) markers.push(`Thyroid TSH: <strong>${state.labData.tsh} mIU/L</strong>`);
  if (state.labData.lhFsh) markers.push(`LH/FSH Ratio: <strong>${state.labData.lhFsh}</strong>`);
  labsContainer.innerHTML = markers.length > 0 ? markers.join(' · ') : 'No lab results found.';

  // Build select Month options
  const select = document.getElementById('summaryMonthSelect');
  if (select) {
    select.innerHTML = '<option value="all">Last 6 Months (Avg)</option>';
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      select.innerHTML += `<option value="${value}">${monthName}</option>`;
    }
  }

  // Reset caches and load stats
  cachedVitals = [];
  cachedPeriods = [];
  cachedSymptoms = [];
  loadSelectedMonthStats();
}

async function loadSelectedMonthStats() {
  const filter = document.getElementById('summaryMonthSelect').value;

  document.getElementById('statSleep').textContent = '...';
  document.getElementById('statWater').textContent = '...';
  document.getElementById('statPain').textContent = '...';
  document.getElementById('statRegularity').textContent = '...';
  document.getElementById('statSymptoms').textContent = '...';

  if (!state.user.id) return;

  try {
    if (cachedVitals.length === 0 && cachedPeriods.length === 0 && cachedSymptoms.length === 0) {
      const [vRes, pRes, sRes] = await Promise.all([
        sb.from('vitals_logs').select('*').eq('user_id', state.user.id),
        sb.from('period_logs').select('*').eq('user_id', state.user.id),
        sb.from('symptoms_logs').select('*').eq('user_id', state.user.id)
      ]);
      cachedVitals = vRes.data || [];
      cachedPeriods = pRes.data || [];
      cachedSymptoms = sRes.data || [];
    }

    let filteredVitals = cachedVitals;
    let filteredPeriods = cachedPeriods;
    let filteredSymptoms = cachedSymptoms;

    if (filter !== 'all') {
      const [year, month] = filter.split('-').map(Number);
      const filterByDate = (item, dateField) => {
        if (!item || !item[dateField]) return false;
        const parts = item[dateField].split(/[-T]/);
        if (parts.length >= 2) {
          return parseInt(parts[0]) === year && parseInt(parts[1]) === month;
        }
        return false;
      };
      filteredVitals = cachedVitals.filter(v => filterByDate(v, 'created_at'));
      filteredPeriods = cachedPeriods.filter(p => filterByDate(p, 'start_date'));
      filteredSymptoms = cachedSymptoms.filter(s => filterByDate(s, 'created_at'));
    }

    // Averages Sleep & Hydration
    if (filteredVitals.length > 0) {
      const avgSleep = filteredVitals.reduce((sum, v) => sum + parseFloat(v.sleep_hours || 0), 0) / filteredVitals.length;
      const avgWater = filteredVitals.reduce((sum, v) => sum + parseFloat(v.water_liters || 0), 0) / filteredVitals.length;
      document.getElementById('statSleep').textContent = `${avgSleep.toFixed(1)} hours`;
      document.getElementById('statWater').textContent = `${avgWater.toFixed(1)} L`;
    } else {
      document.getElementById('statSleep').textContent = 'No logs';
      document.getElementById('statWater').textContent = 'No logs';
    }

    // Avg pain & cycle regularity
    if (filteredPeriods.length > 0) {
      const painMap = { 'None': 1, 'Mild': 2, 'Bad': 3 };
      const painReverseMap = { 1: 'None', 2: 'Mild', 3: 'Bad' };
      
      let painSum = 0;
      let validPainCount = 0;
      let regularCount = 0;

      filteredPeriods.forEach(p => {
        if (p.pain_level && painMap[p.pain_level]) {
          painSum += painMap[p.pain_level];
          validPainCount++;
        }
        if (p.cycle_status === 'Regular') regularCount++;
      });

      const avgPainScore = validPainCount > 0 ? Math.round(painSum / validPainCount) : 2;
      document.getElementById('statPain').textContent = painReverseMap[avgPainScore] || 'Mild';

      const regPercent = Math.round((regularCount / filteredPeriods.length) * 100);
      document.getElementById('statRegularity').textContent = `${regPercent}% Regular (${filteredPeriods.length} log${filteredPeriods.length > 1 ? 's' : ''})`;
    } else {
      document.getElementById('statPain').textContent = 'No logs';
      document.getElementById('statRegularity').textContent = 'No logs';
    }

    // Top symptoms list
    if (filteredSymptoms.length > 0) {
      let counts = {};
      const increment = (symptomName) => {
        counts[symptomName] = (counts[symptomName] || 0) + 1;
      };

      filteredSymptoms.forEach(s => {
        if (s.acne) increment('Acne');
        if (s.fatigue) increment('Fatigue');
        if (s.hair_thinning) increment('Hair loss');
        if (s.cravings) increment('Cravings');
        if (s.bloating) increment('Bloating');
        if (s.mood_swings) increment('Mood swings');
        if (s.headache) increment('Headache');
        if (s.cramps) increment('Cramps');
        if (s.anxiety) increment('Anxiety');
        if (s.brain_fog) increment('Brain fog');
      });

      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        document.getElementById('statSymptoms').textContent = sorted.slice(0, 2).map(([name, count]) => `${name} (${count})`).join(', ');
      } else {
        document.getElementById('statSymptoms').textContent = 'None logged';
      }
    } else {
      document.getElementById('statSymptoms').textContent = 'No logs';
    }

  } catch (err) {
    console.error("Failed to calculate monthly statistics:", err);
  }
}

function runLocalRuleBasedHealthAssessment(avgSleep, avgWater, symptomCounts, sortedSymps, cachedPeriods, cachedSymptoms) {
  let overallStatus = "Good";
  let pcosImpact = "Low";
  let needsDoctor = false;
  let reasons = [];

  // Vitals checks
  if (avgSleep < 6.5) {
    reasons.push("Average sleep is below 6.5 hours, which elevates stress levels and cortisol");
  }
  if (avgWater < 1.8) {
    reasons.push("Average hydration is low, which can impact metabolic rate and energy levels");
  }

  // Periods checks
  let regularCount = 0;
  let totalPeriods = cachedPeriods.length;
  let missedOrLate = false;
  let hasBadPain = false;
  let hasClots = false;
  let flows = { Light: 0, Medium: 0, Heavy: 0, "Very Heavy": 0 };

  cachedPeriods.forEach(p => {
    if (p.cycle_status === 'Regular') regularCount++;
    if (p.cycle_status === 'Missed' || p.cycle_status === 'Late') missedOrLate = true;
    if (p.pain_level === 'Bad') hasBadPain = true;
    if (p.any_clots) hasClots = true;
    if (p.flow_intensity) flows[p.flow_intensity] = (flows[p.flow_intensity] || 0) + 1;
  });

  let regularityPercent = totalPeriods > 0 ? Math.round((regularCount / totalPeriods) * 100) : 100;
  if (totalPeriods > 0 && regularityPercent < 70) {
    reasons.push(`Menstrual regularity is low (${regularityPercent}% regular), indicating potential anovulatory cycles`);
  }
  if (missedOrLate) {
    reasons.push("Missed or late periods logged, which is a classic clinical indicator of PCOS");
    pcosImpact = "Moderate";
  }
  if (hasBadPain) {
    reasons.push("Significant cycle pain logged, suggesting high prostaglandin activity or pelvic inflammation");
  }
  if (hasClots) {
    reasons.push("Blood clots logged during flow, indicating heavy bleeding episodes");
  }
  if (flows.Heavy > 0 || flows["Very Heavy"] > 0) {
    reasons.push("Heavy or very heavy flow logged, which can lead to fatigue and iron deficiency");
  }

  // Symptoms check
  let symptomLoad = 0;
  let highImpactSymptoms = [];
  for (const [symp, count] of Object.entries(symptomCounts)) {
    symptomLoad += count;
    if (count >= 2) {
      highImpactSymptoms.push(symp);
    }
  }

  if (symptomLoad > 6) {
    pcosImpact = "High";
    overallStatus = "Needs Attention";
  } else if (symptomLoad > 2) {
    pcosImpact = "Moderate";
    overallStatus = "Needs Attention";
  }

  // Doctor recommendation flags
  if (missedOrLate && (flows.Heavy > 0 || flows["Very Heavy"] > 0)) {
    needsDoctor = true;
  }
  if (hasBadPain && symptomLoad > 8) {
    needsDoctor = true;
  }
  if (state.user.id && state.labData.hba1c && parseFloat(state.labData.hba1c) >= 5.7) {
    reasons.push(`HbA1c level of ${state.labData.hba1c}% suggests insulin resistance or prediabetic range`);
    needsDoctor = true;
    pcosImpact = "High";
  }
  if (state.user.id && state.labData.lhFsh && parseFloat(state.labData.lhFsh) >= 2.0) {
    reasons.push(`LH/FSH ratio is ${state.labData.lhFsh}, which is a classic biomarker indicator of PCOS`);
    pcosImpact = "High";
  }
  if (state.user.id && state.labData.tsh && parseFloat(state.labData.tsh) >= 4.0) {
    reasons.push(`TSH level of ${state.labData.tsh} mIU/L indicates a sluggish thyroid, which mimics/worsens PCOS fatigue`);
    needsDoctor = true;
  }

  if (needsDoctor || pcosImpact === "High") {
    overallStatus = "Doctor Visit Suggested";
  }

  // Construct response HTML
  let html = `
    <div style="margin-bottom:16px; border-bottom:1.5px solid var(--border-strong); padding-bottom:12px;">
      <span style="background:var(--brand-pink-light); color:var(--brand-pink); font-size:11px; font-weight:700; padding:4px 10px; border-radius:20px; text-transform:uppercase; letter-spacing:0.5px; display:inline-block; margin-bottom:8px;">
        💡 Clinical AI Assessment (Local Diagnostics Engine)
      </span>
      <h4 style="font-size:16px; font-weight:800; color:var(--text-main); margin:4px 0;">Hello ${state.user.name}, here is your personal clinical evaluation:</h4>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:20px;">
      <div style="background:var(--bg-app); border:1px solid var(--border-strong); border-radius:var(--radius-md); padding:12px;">
        <span style="font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase;">Overall Health Status</span>
        <div style="font-size:15px; font-weight:750; color:${overallStatus === 'Good' ? 'var(--brand-green)' : '#C62828'}; margin-top:4px;">${overallStatus}</div>
      </div>
      <div style="background:var(--bg-app); border:1px solid var(--border-strong); border-radius:var(--radius-md); padding:12px;">
        <span style="font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase;">PCOS Impact Level</span>
        <div style="font-size:15px; font-weight:750; color:${pcosImpact === 'Low' ? 'var(--brand-green)' : pcosImpact === 'Moderate' ? '#F57C00' : '#C62828'}; margin-top:4px;">${pcosImpact}</div>
      </div>
    </div>

    <h5 style="font-size:14px; font-weight:750; color:var(--text-main); margin-bottom:8px;">1. How is your overall health status right now?</h5>
    <p style="margin-bottom:16px; font-size:13.5px; color:var(--text-sub);">
      Your logged data indicates your overall health is <strong>${overallStatus}</strong>.
      ${reasons.length > 0 
        ? `We noted the following observations from your logs:<br/>
           <ul style="margin:8px 0; padding-left:18px;">
             ${reasons.map(r => `<li style="margin:4px 0;">${r}.</li>`).join('')}
           </ul>`
        : `Your sleep (${avgSleep.toFixed(1)}h) and water intake (${avgWater.toFixed(1)}L) are in healthy ranges, and your menstrual cycle logs indicate minimal distress.`}
    </p>

    <h5 style="font-size:14px; font-weight:750; color:var(--text-main); margin-bottom:8px;">2. Is PCOS heavily affecting you right now?</h5>
    <p style="margin-bottom:16px; font-size:13.5px; color:var(--text-sub);">
      PCOS impact is currently classified as <strong>${pcosImpact}</strong>.
      ${symptomLoad > 0 
        ? `You have logged a total of <strong>${symptomLoad} symptom instances</strong> recently.
           ${highImpactSymptoms.length > 0 
             ? `Your most persistent symptoms are <strong>${highImpactSymptoms.join(', ')}</strong>, which are typical manifestations of underlying insulin resistance and androgen imbalance.` 
             : `The symptoms you logged are mild and dispersed, indicating that your metabolic systems are relatively stable.`}`
        : `You have not logged any significant symptoms recently. This is a positive indicator that your body is in a stable hormonal state.`}
    </p>

    <h5 style="font-size:14px; font-weight:750; color:var(--text-main); margin-bottom:8px;">3. Should you visit a doctor, or is exercise/diet enough?</h5>
    <p style="margin-bottom:16px; font-size:13.5px; color:var(--text-sub);">
  `;

  if (overallStatus === "Doctor Visit Suggested" || needsDoctor) {
    html += `
      <div style="border-left:4px solid #C62828; background:#FFEBEE; padding:14px; border-radius:var(--radius-md); margin-bottom:16px; color:#B71C1C; font-size:13.5px; line-height:1.6;">
        <strong>⚠️ Recommendation: Schedule a Doctor's Visit</strong><br/>
        Based on clinical markers (such as missed periods, heavy bleeding with clots, bad cycle pain, or insulin/thyroid lab results), we highly recommend consulting a gynecologist or endocrinologist. They can order a pelvic ultrasound to check for ovarian follicles and perform a detailed hormone panel (LH, FSH, Free Testosterone, fasting insulin) to tailor a clinical management plan.
      </div>
    `;
  } else {
    html += `
      <div style="border-left:4px solid var(--brand-green); background:var(--brand-green-light); padding:14px; border-radius:var(--radius-md); margin-bottom:16px; color:var(--brand-green); font-size:13.5px; line-height:1.6;">
        <strong>🌸 Recommendation: Lifestyle Maintenance & Cycle-Syncing</strong><br/>
        Your logged symptoms are mild and cycles appear reasonably regular. Active medical intervention is not urgently indicated, and home-based lifestyle maintenance is likely sufficient to keep symptoms under control.
      </div>
    `;
  }

  html += `
      <strong>Recommended Lifestyle Adjustments:</strong>
      <ul style="margin:8px 0; padding-left:18px; font-size:13.5px; color:var(--text-sub);">
        <li style="margin:6px 0;">
          <strong>Nutrition & Supplements:</strong> Focus on a low-glycemic index (low-GI) diet rich in fiber, healthy fats (avocado, nuts, omega-3s), and lean proteins to stabilize glucose levels and reduce cravings. Consider asking your doctor about Myo-Inositol, which is clinically proven to improve insulin sensitivity and restore ovulation in PCOS.
        </li>
        <li style="margin:6px 0;">
          <strong>Cycle-Synced Exercise:</strong> Avoid excessive high-intensity cardio (like spinning or long runs) if you are fatigued, as it can spike cortisol and worsen insulin resistance. Instead, prioritize <strong>strength/resistance training</strong> 3 times a week (builds insulin-receptive muscle) and <strong>low-intensity steady-state (LISS) exercise</strong> such as brisk walking, pilates, or yoga.
        </li>
      </ul>
    </p>
  `;

  return html;
}

async function generateAIHealthCondition() {
  const resultDiv = document.getElementById('aiHealthConditionResult');
  const btn = document.getElementById('analyzeHealthBtn');
  if (!resultDiv || !btn || isLoading) return;

  resultDiv.classList.remove('hidden');
  resultDiv.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-muted);">🔎 Gathering your logs and invoking Clinical AI Advisor...</div>';
  btn.disabled = true;
  btn.textContent = 'Analyzing...';

  let avgSleep = 7.5;
  let avgWater = 2.0;
  if (cachedVitals.length > 0) {
    avgSleep = cachedVitals.reduce((sum, v) => sum + parseFloat(v.sleep_hours || 0), 0) / cachedVitals.length;
    avgWater = cachedVitals.reduce((sum, v) => sum + parseFloat(v.water_liters || 0), 0) / cachedVitals.length;
  }

  let symptomCounts = {};
  cachedSymptoms.forEach(s => {
    if (s.acne) symptomCounts['Acne'] = (symptomCounts['Acne'] || 0) + 1;
    if (s.fatigue) symptomCounts['Fatigue'] = (symptomCounts['Fatigue'] || 0) + 1;
    if (s.hair_thinning) symptomCounts['Hair loss'] = (symptomCounts['Hair loss'] || 0) + 1;
    if (s.cravings) symptomCounts['Cravings'] = (symptomCounts['Cravings'] || 0) + 1;
    if (s.bloating) symptomCounts['Bloating'] = (symptomCounts['Bloating'] || 0) + 1;
    if (s.mood_swings) symptomCounts['Mood swings'] = (symptomCounts['Mood swings'] || 0) + 1;
    if (s.headache) symptomCounts['Headache'] = (symptomCounts['Headache'] || 0) + 1;
    if (s.cramps) symptomCounts['Cramps'] = (symptomCounts['Cramps'] || 0) + 1;
    if (s.anxiety) symptomCounts['Anxiety'] = (symptomCounts['Anxiety'] || 0) + 1;
    if (s.brain_fog) symptomCounts['Brain fog'] = (symptomCounts['Brain fog'] || 0) + 1;
  });
  const sortedSymps = Object.entries(symptomCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name} (${count} times)`);
  const topSymptomsList = sortedSymps.length > 0 ? sortedSymps.join(', ') : 'None logged';

  const periodsText = cachedPeriods.slice(0, 6).map(p => {
    return `- Start: ${p.start_date} | End: ${p.end_date || 'Ongoing'} | Flow: ${p.flow_intensity} | Pain: ${p.pain_level || 'Mild'} | Clots: ${p.any_clots ? 'Yes' : 'No'} | Status: ${p.cycle_status || 'Regular'}`;
  }).join('\n');

  try {
    const prompt = `You are a clinical PCOS advisor checking a patient's self-logged data.
Patient Profile:
- Age: ${state.user.age}
- PCOS Classification: ${state.user.pcosType}
- Height: ${state.user.height || 'N/A'} cm
- Weight: ${state.user.weight || 'N/A'} kg

Logged Vitals Averages:
- Avg Sleep: ${avgSleep.toFixed(1)} hours
- Avg Water: ${avgWater.toFixed(1)} liters

Logged Symptoms:
- Top symptoms reported: ${topSymptomsList}

Logged Periods History (Last 6 entries):
${periodsText || 'No periods logged yet.'}

Lab Results:
- HbA1c: ${state.labData.hba1c || 'N/A'}%
- TSH: ${state.labData.tsh || 'N/A'} mIU/L
- LH/FSH: ${state.labData.lhFsh || 'N/A'}

TASK:
Provide a compassionate, personalized evaluation of their current health condition.
Acknowledge whether their logs indicate that their PCOS symptoms are severe, moderate, or well-managed.
Answer the following clearly:
1. How is their overall health status based on their logged cycles and symptoms? Is it good, bad, or does it need a doctor's visit?
2. Does it look like PCOS is heavily affecting them right now?
3. Should they visit a doctor/physician, or are lifestyle maintenance, cycle-syncing exercises, and dietary adjustments sufficient?
Keep the tone clinical yet warm and encouraging. Never make definitive diagnoses; frame everything as an assessment with advice.
Use clean formatting with bullet points and bold headers. If they need to visit a doctor, highlight it clearly using a markdown blockquote (e.g. starting with '> ').
NEVER output raw HTML tags (like <div>, <p>, <span>, or <style>) in your response. All formatting must be done in Markdown (using standard markdown syntax like '> **[WARNING]**' for highlights).
`;

    let answer;
    try {
      const response = await fetch(`${BACKEND_API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question: prompt,
          user_context: ''
        })
      });

      if (response.ok) {
        const resJson = await response.json();
        answer = resJson.answer;
      } else {
        throw new Error("Backend API returned non-OK status");
      }
    } catch (netErr) {
      console.warn("Backend API not reachable for clinical health assessment, falling back to client-side generateAnswer...", netErr);
      answer = await generateAnswer(prompt, '', '');
    }

    resultDiv.innerHTML = formatAnswer(answer);
    resultDiv.scrollIntoView({ behavior: 'smooth' });


  } catch (err) {
    console.warn("Clinical health assessment API failed, falling back to local diagnostics:", err);
    const localReport = runLocalRuleBasedHealthAssessment(avgSleep, avgWater, symptomCounts, sortedSymps, cachedPeriods, cachedSymptoms);
    resultDiv.innerHTML = `
      <div style="border: 1px dashed #fb923c; background: #FFF7ED; padding: 10px; border-radius: 8px; margin-bottom: 12px; font-size: 12px; color: #C2410C; display: flex; align-items: center; gap: 8px;">
        <span>ℹ️ Cloud API quota limit exceeded or key not configured. Using local evidence-based clinical diagnostics engine.</span>
      </div>
      ${localReport}
    `;
    resultDiv.scrollIntoView({ behavior: 'smooth' });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyze My Health Condition';
  }
}

function exportSummaryPDF() {
  window.print();
}

async function generateAIFertilityAssessment() {
  const resultDiv = document.getElementById('aiFertilityAssessmentResult');
  const btn = document.getElementById('analyzeFertilityBtn');
  if (!resultDiv || !btn || isLoading) return;

  resultDiv.classList.remove('hidden');
  resultDiv.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-muted);">🔎 Gathering your logs and invoking Fertility AI Advisor...</div>';
  btn.disabled = true;
  btn.textContent = 'Analyzing...';

  let avgSleep = 7.5;
  let avgWater = 2.0;
  if (cachedVitals.length > 0) {
    avgSleep = cachedVitals.reduce((sum, v) => sum + parseFloat(v.sleep_hours || 0), 0) / cachedVitals.length;
    avgWater = cachedVitals.reduce((sum, v) => sum + parseFloat(v.water_liters || 0), 0) / cachedVitals.length;
  }

  let symptomCounts = {};
  cachedSymptoms.forEach(s => {
    if (s.acne) symptomCounts['Acne'] = (symptomCounts['Acne'] || 0) + 1;
    if (s.fatigue) symptomCounts['Fatigue'] = (symptomCounts['Fatigue'] || 0) + 1;
    if (s.hair_thinning) symptomCounts['Hair loss'] = (symptomCounts['Hair loss'] || 0) + 1;
    if (s.cravings) symptomCounts['Cravings'] = (symptomCounts['Cravings'] || 0) + 1;
    if (s.bloating) symptomCounts['Bloating'] = (symptomCounts['Bloating'] || 0) + 1;
    if (s.mood_swings) symptomCounts['Mood swings'] = (symptomCounts['Mood swings'] || 0) + 1;
    if (s.headache) symptomCounts['Headache'] = (symptomCounts['Headache'] || 0) + 1;
    if (s.cramps) symptomCounts['Cramps'] = (symptomCounts['Cramps'] || 0) + 1;
    if (s.anxiety) symptomCounts['Anxiety'] = (symptomCounts['Anxiety'] || 0) + 1;
    if (s.brain_fog) symptomCounts['Brain fog'] = (symptomCounts['Brain fog'] || 0) + 1;
  });
  const sortedSymps = Object.entries(symptomCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name} (${count} times)`);
  const topSymptomsList = sortedSymps.length > 0 ? sortedSymps.join(', ') : 'None logged';

  const periodsText = cachedPeriods.slice(0, 6).map(p => {
    return `- Start: ${p.start_date} | End: ${p.end_date || 'Ongoing'} | Flow: ${p.flow_intensity} | Pain: ${p.pain_level || 'Mild'} | Clots: ${p.any_clots ? 'Yes' : 'No'} | Status: ${p.cycle_status || 'Regular'}`;
  }).join('\n');

  try {
    const prompt = `You are a clinical fertility and pregnancy care advisor specialized in PCOS.
Patient Profile:
- Age: ${state.user.age}
- PCOS Classification: ${state.user.pcosType}
- Height: ${state.user.height || 'N/A'} cm
- Weight: ${state.user.weight || 'N/A'} kg

Logged Symptoms:
- Top symptoms reported: ${topSymptomsList}

Logged Periods History (Last 6 entries):
${periodsText || 'No periods logged yet.'}

Lab Results:
- HbA1c: ${state.labData.hba1c || 'N/A'}%
- TSH: ${state.labData.tsh || 'N/A'} mIU/L
- LH/FSH: ${state.labData.lhFsh || 'N/A'}

TASK:
Provide a compassionate, personalized fertility and pregnancy care evaluation.
Address the following clearly:
1. Based on their age, symptoms, and period logs, are there any potential fertility or pregnancy-related issues/considerations?
2. What are the chances of conception (framed supportively, emphasizing that PCOS is a common and treatable cause of ovulatory delay, not absolute infertility)?
3. What specific actions/steps should they take if they want to conceive (lifestyle, optimizing cycle regularity, tracking methods like BBT, and when to seek medical help)?
Keep the tone clinical yet warm, supportive, and encouraging. Never make definitive diagnoses; frame everything as a helpful educational assessment.
Use clean formatting with bullet points and bold headers. If they need to visit a reproductive specialist based on age (e.g. 35+) or prolonged cycle irregularities, highlight it clearly using a markdown blockquote (e.g. starting with '> ').
NEVER output raw HTML tags (like <div>, <p>, <span>, or <style>) in your response. All formatting must be done in Markdown (using standard markdown syntax like '> **[WARNING]**' for highlights).
`;

    let answer;
    try {
      const response = await fetch(`${BACKEND_API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question: prompt,
          user_context: ''
        })
      });

      if (response.ok) {
        const resJson = await response.json();
        answer = resJson.answer;
      } else {
        throw new Error("Backend API returned non-OK status");
      }
    } catch (netErr) {
      console.warn("Backend API not reachable for fertility assessment, falling back to client-side generateAnswer...", netErr);
      answer = await generateAnswer(prompt, '', '');
    }

    resultDiv.innerHTML = formatAnswer(answer);
    resultDiv.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    console.warn("Fertility assessment API failed, falling back to local diagnostics:", err);
    const localReport = runLocalRuleBasedFertilityAssessment(symptomCounts, sortedSymps, cachedPeriods);
    resultDiv.innerHTML = `
      <div style="border: 1px dashed #10b981; background: #ECFDF5; padding: 10px; border-radius: 8px; margin-bottom: 12px; font-size: 12px; color: #047857; display: flex; align-items: center; gap: 8px;">
        <span>ℹ️ Cloud API quota limit exceeded or key not configured. Using local evidence-based fertility diagnostics engine.</span>
      </div>
      ${localReport}
    `;
    resultDiv.scrollIntoView({ behavior: 'smooth' });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Fertility & Pregnancy Care Assessment';
  }
}

function runLocalRuleBasedFertilityAssessment(symptomCounts, sortedSymps, cachedPeriods) {
  let fertilityPotential = "Excellent (Supportive lifestyle recommended)";
  let reasons = [];
  let age = state.user.age || 24;
  let pcosType = state.user.pcosType || 'Not Sure';

  // Age consideration
  if (age >= 35) {
    reasons.push("Age is 35 or above: fertility naturally declines, so if you are trying to conceive, it is clinically recommended to consult a fertility specialist/reproductive endocrinologist after 6 months of active trying (instead of the typical 12 months)");
    fertilityPotential = "Moderate / Age-sync recommended";
  } else {
    reasons.push("Age is under 35: this is highly favorable for egg quality. Standard clinical advice is to try for up to 12 months before seeking specialized fertility intervention, unless cycle irregularity is severe");
  }

  // PCOS status
  reasons.push(`PCOS type is "${pcosType}". PCOS is a highly manageable condition, and the primary hurdle is ovulatory delay (irregular ovulation) rather than structural infertility`);

  // Periods cycle checks
  let irregular = false;
  let regularCount = 0;
  let totalPeriods = cachedPeriods.length;
  
  cachedPeriods.forEach(p => {
    if (p.cycle_status === 'Regular') regularCount++;
    if (p.cycle_status === 'Missed' || p.cycle_status === 'Late') irregular = true;
  });

  if (irregular || (totalPeriods > 0 && regularCount/totalPeriods < 0.7)) {
    reasons.push("Logged cycles show irregular, late, or missed periods. This indicates possible anovulatory cycles (cycles where an egg is not released), which makes timing intercourse for conception difficult");
    fertilityPotential = "Needs Cycle Syncing & Ovulation Tracking";
  } else {
    reasons.push("Your logged menstrual periods are mostly regular, suggesting that you are likely ovulating consistently. This is a very positive indicator for natural conception");
  }

  // Symptoms check
  if (symptomCounts['Cravings'] || symptomCounts['Fatigue']) {
    reasons.push("Persistent fatigue or cravings suggest potential insulin resistance, which can affect egg quality, ovulation frequency, and pregnancy safety (increases gestational diabetes risk)");
  }

  let html = `
    <div style="margin-bottom:16px; border-bottom:1.5px solid var(--border-strong); padding-bottom:12px;">
      <span style="background:var(--brand-pink-light); color:var(--brand-pink); font-size:11px; font-weight:700; padding:4px 10px; border-radius:20px; text-transform:uppercase; letter-spacing:0.5px; display:inline-block; margin-bottom:8px;">
        🌱 Fertility Guidance (Local Diagnostics Engine)
      </span>
      <h4 style="font-size:16px; font-weight:800; color:var(--text-main); margin:4px 0;">Hello ${state.user.name}, here is your fertility and pregnancy assessment:</h4>
    </div>

    <div style="display:grid; grid-template-columns: 1fr; gap:12px; margin-bottom:20px;">
      <div style="background:var(--bg-app); border:1px solid var(--border-strong); border-radius:var(--radius-md); padding:12px;">
        <span style="font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase;">Fertility Sync Recommendation</span>
        <div style="font-size:15px; font-weight:750; color:#8C2D3B; margin-top:4px;">${fertilityPotential}</div>
      </div>
    </div>

    <h5 style="font-size:14px; font-weight:750; color:var(--text-main); margin-bottom:8px;">1. Key Observations based on your profile</h5>
    <ul style="margin:8px 0; padding-left:18px; font-size:13.5px; color:var(--text-sub);">
      ${reasons.map(r => `<li style="margin:6px 0;">${r}.</li>`).join('')}
    </ul>

    <h5 style="font-size:14px; font-weight:750; color:var(--text-main); margin-bottom:8px;">2. Can I conceive with PCOS?</h5>
    <p style="margin-bottom:16px; font-size:13.5px; color:var(--text-sub); line-height:1.6;">
      <strong>Yes, absolutely.</strong> PCOS is one of the most common causes of difficulty conceiving, but it is also one of the most treatable. The main challenge with PCOS is <em>irregular ovulation</em> (anovulation), not the absence of eggs. By managing insulin levels and balancing hormones, regular ovulation can be restored, leading to a successful pregnancy.
    </p>

    <h5 style="font-size:14px; font-weight:750; color:var(--text-main); margin-bottom:8px;">3. Key Steps if you want to conceive</h5>
    <div style="border-left:4px solid var(--brand-pink); background:var(--brand-pink-light); padding:14px; border-radius:var(--radius-md); margin-bottom:16px; color:#8C2D3B; font-size:13.5px; line-height:1.6;">
      <strong>📝 Action Plan for Conception:</strong>
      <ul style="margin:8px 0; padding-left:18px; color:var(--text-main);">
        <li style="margin:6px 0;"><strong>Track Ovulation accurately:</strong> Standard LH test strips can give false positives in PCOS due to chronically high LH. Combine strips with <strong>Basal Body Temperature (BBT) tracking</strong> (a sustained temperature rise confirms ovulation has occurred) and checking cervical mucus.</li>
        <li style="margin:6px 0;"><strong>Optimize Insulin Sensitivity:</strong> High insulin levels can negatively affect egg quality and prevent the ovaries from releasing eggs. Prioritize a low-glycemic diet and discuss Myo-Inositol supplements with your physician.</li>
        <li style="margin:6px 0;"><strong>Supportive Supplements:</strong> Ask your doctor about Prenatal Multivitamins containing Folate (methylfolate is preferred over folic acid), Vitamin D3 (essential for ovarian function), and Omega-3 fish oils.</li>
        <li style="margin:6px 0;"><strong>Consult a Specialist:</strong> If cycles are highly irregular (fewer than 6-9 periods a year) or if you have been actively trying for over 6 months (age 35+) or 12 months (age &lt;35), consult a reproductive endocrinologist. They can prescribe safe, first-line ovulation-induction medications like Letrozole or Clomiphene.</li>
      </ul>
    </div>
  `;
  return html;
}

async function navigateToFertilityAssessment() {
  // 1. Switch to summary view
  switchView('summary');
  // 2. Wait a brief moment for the page to render and fetch data if necessary
  setTimeout(async () => {
    // 3. Scroll to the fertility assessment card
    const targetCard = document.getElementById('analyzeFertilityBtn');
    if (targetCard) {
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 4. Automatically trigger the assessment
      await generateAIFertilityAssessment();
    }
  }, 400);
}

function toggleVoiceAssistantWidget() {
  const widget = document.querySelector('elevenlabs-convai');
  if (widget) {
    if (widget.style.display === 'none') {
      widget.style.display = 'block';
      showToast('🎙️ Voice Assistant activated! Click "Start a call" at the bottom right to begin speaking.', 'success');
    } else {
      widget.style.display = 'none';
      showToast('🎙️ Voice Assistant deactivated.', 'info');
    }
  }
}

