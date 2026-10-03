/**
 * sessionTimeout.js - Automatic Inactivity Session Timeout Manager
 * Bestlink College of the Philippines — Attendance Monitoring System (AMS)
 * Security Reference: docs/Security.md §2 (Session Management & Inactivity Invariant)
 */

import { logout } from './auth.js';

const DEFAULT_TIMEOUT_SECONDS = 5 * 60; // 5 minutes
const WARNING_WINDOW_SECONDS = 60;       // Show warning modal 60s before logout
const ACTIVITY_THROTTLE_MS = 2000;       // Throttle activity updates to once per 2s

let timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;
let lastActiveTimestamp = Date.now();
let checkIntervalId = null;
let countdownIntervalId = null;
let modalEl = null;
let countdownEl = null;
let isWarningVisible = false;
let throttleTimer = null;

/**
 * Initializes the session inactivity monitor
 * @param {object} options
 * @param {number} [options.timeoutSeconds] - Custom inactivity timeout in seconds
 */
export function initSessionTimeout(options = {}) {
  // Prevent duplicate initialization on same page
  if (window.__AMS_SESSION_TIMEOUT_INITIALIZED__) {
    return;
  }
  window.__AMS_SESSION_TIMEOUT_INITIALIZED__ = true;

  // Allow custom timeout override (e.g. from admin settings or query param for testing)
  const envTimeout = parseInt(window.__AMS_CONFIG__?.SESSION_TIMEOUT_SECONDS || localStorage.getItem('ams_session_timeout_seconds'), 10);
  if (!isNaN(envTimeout) && envTimeout >= 30) {
    timeoutSeconds = envTimeout;
  } else if (options.timeoutSeconds && options.timeoutSeconds >= 30) {
    timeoutSeconds = options.timeoutSeconds;
  }

  // Initialize shared timestamp across tabs
  updateActivity();

  // Listen to user interaction events to track activity
  bindUserActivityListeners();

  // Multi-tab sync: if user is active in another tab, reset local timer
  window.addEventListener('storage', (e) => {
    if (e.key === 'ams_last_active_timestamp' && e.newValue) {
      const remoteTimestamp = parseInt(e.newValue, 10);
      if (!isNaN(remoteTimestamp) && remoteTimestamp > lastActiveTimestamp) {
        lastActiveTimestamp = remoteTimestamp;
        if (isWarningVisible) {
          hideWarningModal();
        }
      }
    }
  });

  // Start polling interval every second to track remaining time
  startInactivityChecker();
}

/**
 * Updates last active timestamp and syncs to localStorage
 */
function updateActivity() {
  lastActiveTimestamp = Date.now();
  try {
    localStorage.setItem('ams_last_active_timestamp', String(lastActiveTimestamp));
  } catch (_) {}
}

/**
 * Handles throttled activity events
 */
function handleUserActivity() {
  if (isWarningVisible) {
    // If the warning modal is already displayed, user must explicitly click "Stay Logged In"
    return;
  }

  if (!throttleTimer) {
    updateActivity();
    throttleTimer = setTimeout(() => {
      throttleTimer = null;
    }, ACTIVITY_THROTTLE_MS);
  }
}

/**
 * Attaches passive event listeners across user interaction channels
 */
function bindUserActivityListeners() {
  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
  events.forEach((evt) => {
    window.addEventListener(evt, handleUserActivity, { passive: true });
  });
}

/**
 * Periodically evaluates elapsed idle time
 */
function startInactivityChecker() {
  clearInterval(checkIntervalId);
  checkIntervalId = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - lastActiveTimestamp) / 1000);
    const remainingSeconds = timeoutSeconds - elapsedSeconds;

    if (remainingSeconds <= 0) {
      handleSessionExpired();
    } else if (remainingSeconds <= WARNING_WINDOW_SECONDS) {
      if (!isWarningVisible) {
        showWarningModal(remainingSeconds);
      }
    } else {
      if (isWarningVisible) {
        hideWarningModal();
      }
    }
  }, 1000);
}

/**
 * Builds and mounts the institutional Color Hunt warning modal
 */
function ensureWarningModalMounted() {
  if (modalEl) return;

  modalEl = document.createElement('div');
  modalEl.id = 'amsSessionTimeoutModal';
  modalEl.style.cssText = 'position:fixed; inset:0; z-index:99999; display:none; align-items:center; justify-content:center; padding:16px; background-color:rgba(0,0,0,0.68); backdrop-filter:blur(5px); box-sizing:border-box;';

  modalEl.innerHTML = `
    <div style="width:100%; max-width:400px; margin:0 auto; background:var(--surface, #FFFFFF); border:1px solid var(--border-strong, #90CAF9); border-radius:18px; padding:28px 24px; box-shadow:0 24px 50px rgba(13, 71, 161, 0.35); text-align:center; box-sizing:border-box; position:relative;">
      
      <!-- Icon Container -->
      <div style="width:54px; height:54px; margin:0 auto 16px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:rgba(33, 150, 243, 0.15); color:var(--ch-900, #0D47A1);">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>

      <div style="font-size:11px; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; color:var(--accent, #2196F3); margin-bottom:4px;">
        Session Security
      </div>

      <h3 style="font-size:18px; font-weight:800; color:var(--text-1, #0D47A1); margin:0 0 8px 0;">
        Session Inactivity Warning
      </h3>

      <p style="font-size:12.5px; line-height:1.55; color:var(--text-2, #4A657E); margin:0 0 20px 0;">
        You have been inactive for a while. For institutional data protection and account security, your session will automatically expire in:
      </p>

      <!-- Countdown Display -->
      <div style="padding:12px 16px; border-radius:12px; margin-bottom:24px; display:flex; align-items:center; justify-content:center; gap:8px; background:var(--raised, #E3F2FD); border:1px solid var(--border, #DCE8F5);">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 9v4M12 17h.01M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0Z"/>
        </svg>
        <span id="amsTimeoutCountdown" style="font-family:monospace; font-size:24px; font-weight:800; color:#F59E0B; font-variant-numeric:tabular-nums; letter-spacing:1px;">
          01:00
        </span>
      </div>

      <!-- Action Buttons -->
      <div style="display:flex; flex-direction:row; gap:10px; justify-content:center;">
        <button id="amsTimeoutLogoutBtn" type="button" 
                style="flex:1; height:42px; padding:0 12px; border-radius:9px; font-size:13px; font-weight:700; cursor:pointer; border:1px solid #dc2626; background:#ef4444; color:#ffffff; box-shadow:0 3px 10px rgba(239, 68, 68, 0.32); transition:all 0.15s ease;">
          Sign Out Now
        </button>
        <button id="amsTimeoutStayBtn" type="button" 
                style="flex:1; height:42px; padding:0 12px; border-radius:9px; font-size:13px; font-weight:700; color:#FFFFFF; border:none; cursor:pointer; background:linear-gradient(135deg, var(--ch-500, #2196F3) 0%, var(--ch-900, #0D47A1) 100%); box-shadow:0 4px 12px rgba(13, 71, 161, 0.28); transition:transform 0.15s ease;">
          Stay Logged In
        </button>
      </div>

      <div style="font-size:10.5px; color:var(--text-3, #829DB5); margin-top:16px;">
        Attendance Monitoring System · Bestlink College
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);

  countdownEl = modalEl.querySelector('#amsTimeoutCountdown');

  // Button actions & hover effects
  const logoutBtn = modalEl.querySelector('#amsTimeoutLogoutBtn');
  logoutBtn?.addEventListener('mouseenter', () => {
    logoutBtn.style.background = '#dc2626';
    logoutBtn.style.borderColor = '#b91c1c';
    logoutBtn.style.boxShadow = '0 5px 14px rgba(220, 38, 38, 0.45)';
    logoutBtn.style.transform = 'translateY(-1px)';
  });
  logoutBtn?.addEventListener('mouseleave', () => {
    logoutBtn.style.background = '#ef4444';
    logoutBtn.style.borderColor = '#dc2626';
    logoutBtn.style.boxShadow = '0 3px 10px rgba(239, 68, 68, 0.32)';
    logoutBtn.style.transform = 'none';
  });
  logoutBtn?.addEventListener('click', () => {
    handleSessionExpired();
  });

  const stayBtn = modalEl.querySelector('#amsTimeoutStayBtn');
  stayBtn?.addEventListener('mouseenter', () => {
    stayBtn.style.transform = 'translateY(-1px)';
    stayBtn.style.boxShadow = '0 6px 16px rgba(13, 71, 161, 0.38)';
  });
  stayBtn?.addEventListener('mouseleave', () => {
    stayBtn.style.transform = 'none';
    stayBtn.style.boxShadow = '0 4px 12px rgba(13, 71, 161, 0.28)';
  });
  stayBtn?.addEventListener('click', () => {
    updateActivity();
    hideWarningModal();
  });
}

/**
 * Displays the countdown warning modal
 * @param {number} remainingSeconds 
 */
function showWarningModal(remainingSeconds) {
  ensureWarningModalMounted();
  isWarningVisible = true;
  modalEl.style.display = 'flex';

  updateCountdownDisplay(remainingSeconds);

  clearInterval(countdownIntervalId);
  countdownIntervalId = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - lastActiveTimestamp) / 1000);
    const remaining = timeoutSeconds - elapsedSeconds;

    if (remaining <= 0) {
      clearInterval(countdownIntervalId);
      handleSessionExpired();
    } else {
      updateCountdownDisplay(remaining);
    }
  }, 1000);
}

/**
 * Hides the warning modal and clears countdown interval
 */
function hideWarningModal() {
  isWarningVisible = false;
  clearInterval(countdownIntervalId);
  if (modalEl) {
    modalEl.style.display = 'none';
  }
}

/**
 * Updates the countdown MM:SS string
 * @param {number} seconds 
 */
function updateCountdownDisplay(seconds) {
  if (!countdownEl) return;
  const safeSeconds = Math.max(0, seconds);
  const mins = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
  const secs = String(safeSeconds % 60).padStart(2, '0');
  countdownEl.textContent = `${mins}:${secs}`;
}

/**
 * Terminates session when inactivity timeout is reached
 */
function handleSessionExpired() {
  clearInterval(checkIntervalId);
  clearInterval(countdownIntervalId);

  // Clear session caches
  sessionStorage.removeItem('ams_cached_role');
  sessionStorage.removeItem('ams_cached_user');
  localStorage.removeItem('ams_last_active_timestamp');

  // Trigger signout and redirect with timeout reason query
  try {
    logout();
  } catch (_) {
    window.location.href = '/index.html?reason=timeout';
  }

  // Safety fallback if logout didn't redirect
  setTimeout(() => {
    window.location.href = '/index.html?reason=timeout';
  }, 300);
}
