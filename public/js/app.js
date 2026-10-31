// Common Client Application Script

const API_BASE = '/api';

function getStoredToken() {
  return localStorage.getItem('erp_token');
}

function getStoredUser() {
  const u = localStorage.getItem('erp_user');
  return u ? JSON.parse(u) : null;
}

function setSession(token, user) {
  localStorage.setItem('erp_token', token);
  localStorage.setItem('erp_user', JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem('erp_token');
  localStorage.removeItem('erp_user');
}

// Redirect based on role
function routeUserByRole(role) {
  switch (role) {
    case 'SUPER_ADMIN':
      window.location.href = '/superadmin.html';
      break;
    case 'CR_ADMIN':
      window.location.href = '/cr.html';
      break;
    case 'COMMITTEE':
      window.location.href = '/committee.html';
      break;
    case 'STUDENT':
      window.location.href = '/student.html';
      break;
    default:
      window.location.href = '/index.html';
  }
}

// Authenticated fetch wrapper
async function apiFetch(url, options = {}) {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });
  
  if (response.status === 401 && !window.location.pathname.endsWith('index.html') && !window.location.pathname.endsWith('verify.html')) {
    clearSession();
    window.location.href = '/index.html';
    return null;
  }

  return response;
}

// Handle Student Google Login (simulated or credential)
async function handleStudentGoogleLogin(e) {
  e.preventDefault();
  const emailInput = document.getElementById('studentGmailInput');
  const errorAlert = document.getElementById('studentErrorAlert');
  const errorText = document.getElementById('studentErrorText');

  errorAlert.classList.add('hidden');
  const email = emailInput.value.trim();

  try {
    const res = await fetch(`${API_BASE}/auth/login-student-google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simulatedEmail: email }),
    });

    const data = await res.json();
    if (!res.ok) {
      errorText.textContent = data.error || 'Failed to authenticate.';
      errorAlert.classList.remove('hidden');
      return;
    }

    setSession(data.token, data.user);
    routeUserByRole(data.user.role);
  } catch (err) {
    errorText.textContent = 'Server connection error. Please try again.';
    errorAlert.classList.remove('hidden');
  }
}

// Handle Staff Login
async function handleStaffLogin(e) {
  e.preventDefault();
  const emailInput = document.getElementById('staffEmailInput');
  const passwordInput = document.getElementById('staffPasswordInput');
  const errorAlert = document.getElementById('staffErrorAlert');
  const errorText = document.getElementById('staffErrorText');

  errorAlert.classList.add('hidden');

  try {
    const res = await fetch(`${API_BASE}/auth/login-staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailInput.value.trim(),
        password: passwordInput.value,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      errorText.textContent = data.error || 'Invalid credentials.';
      errorAlert.classList.remove('hidden');
      return;
    }

    setSession(data.token, data.user);
    routeUserByRole(data.user.role);
  } catch (err) {
    errorText.textContent = 'Server connection error. Please try again.';
    errorAlert.classList.remove('hidden');
  }
}

// Instant Demo Login Switcher
async function demoLoginUser(email, role) {
  try {
    const res = await fetch(`${API_BASE}/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    });

    const data = await res.json();
    if (res.ok) {
      setSession(data.token, data.user);
      routeUserByRole(data.user.role);
    } else {
      alert(data.error || 'Demo login failed');
    }
  } catch (err) {
    alert('Connection error');
  }
}

// Logout
async function logoutUser() {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
  } catch (e) {}
  clearSession();
  window.location.href = '/index.html';
}
