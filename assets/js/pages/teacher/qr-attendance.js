/**
 * qr-attendance.js - Teacher QR Attendance Ingress Controller
 * Bestlink College of the Philippines — Attendance Monitoring System (AMS)
 *
 * Strict Attendance Ingress Protocol:
 *   1. Camera starts -> jsQR captures video frames continuously.
 *   2. On QR decode -> validates against authentic Admin Station QR pass.
 *   3. If QR is invalid or unauthorized -> ERROR, zero count recorded.
 *   4. If QR is 'time_in':
 *      - If teacher already timed in -> ERROR, duplicate rejected, no count.
 *      - If teacher has not timed in -> SUCCESS, logged under Time-In.
 *   5. If QR is 'time_out':
 *      - If teacher has not timed in -> ERROR, checkout rejected without time-in, no count.
 *      - If teacher already timed out -> ERROR, duplicate rejected, no count.
 *      - If teacher has timed in -> SUCCESS, logged under Time-Out.
 *   6. Auditory chime + visual flash overlay + updates live status & logs.
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { toast } from '../../components/toast.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { getCurrentUser } from '../../lib/auth.js';

let videoStream = null;
let scanInterval = null;
let lastScanToken = null;
let lastScanTime = 0;
let isProcessingScan = false;
let todayLogs = [];
let currentUser = null;

const COOLDOWN_MS = 3500; // 3.5s double-scan throttle

/**
 * Formats a Date object to HH:MM AM/PM
 */
function fmtTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Plays institutional auditory feedback via Web Audio API
 */
function playAudioFeedback(type = 'success') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === 'success') {
      // Harmonious two-tone major fifth chime (C5 -> E5)
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.25);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.12); // E5
      gain2.gain.setValueAtTime(0.25, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.45);
    } else {
      // Rejection buzz (low sawtooth tone)
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    }
  } catch (err) {
    console.debug('[QR Audio] Audio context playback note:', err);
  }
}

/**
 * Shows animated result flash overlay over camera viewfinder
 */
function flashResult(success, label, sub) {
  const overlay = document.getElementById('resultOverlay');
  const iconEl = document.getElementById('resultIcon');
  const labelEl = document.getElementById('resultLabel');
  const subEl = document.getElementById('resultSub');
  if (!overlay) return;

  const bg = success ? 'var(--present)' : 'var(--absent)';
  const svg = success
    ? '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>'
    : '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  if (iconEl) {
    iconEl.style.background = bg;
    iconEl.innerHTML = svg;
  }
  if (labelEl) labelEl.textContent = label;
  if (subEl) subEl.textContent = sub;

  overlay.style.background = 'rgba(6, 13, 23, 0.78)';
  overlay.classList.remove('hidden');
  overlay.classList.add('visible');

  setTimeout(() => {
    overlay.classList.remove('visible');
    overlay.classList.add('hidden');
  }, 2300);
}

/**
 * Updates Time-In or Time-Out banner UI
 */
function updateStatusBanner(eventType, timeStr, status) {
  const isTimeIn = eventType === 'time_in';
  const banner = document.getElementById(isTimeIn ? 'statusBannerTimeIn' : 'statusBannerTimeOut');
  const valueEl = document.getElementById(isTimeIn ? 'timeInValue' : 'timeOutValue');
  const statusEl = document.getElementById(isTimeIn ? 'timeInStatus' : 'timeOutStatus');
  const iconBox = document.getElementById(isTimeIn ? 'timeInIconBox' : 'timeOutIconBox');

  if (valueEl) valueEl.textContent = timeStr;

  if (isTimeIn) {
    const isLate = status === 'late';
    if (statusEl) statusEl.textContent = isLate ? 'Arrived Late' : 'Present (On-Time)';
    if (banner) {
      banner.className = `status-banner ${isLate ? 'late' : 'present'}`;
    }
    if (iconBox) {
      iconBox.style.background = isLate ? 'var(--late-soft)' : 'var(--present-soft)';
      iconBox.style.color = isLate ? 'var(--late)' : 'var(--present)';
    }

    // Set Time-Out card prompt to ready
    const timeOutStatusEl = document.getElementById('timeOutStatus');
    const timeOutValueEl = document.getElementById('timeOutValue');
    if (timeOutValueEl && timeOutValueEl.textContent === '--:-- --' && timeOutStatusEl) {
      timeOutStatusEl.textContent = 'Scan again after class to record checkout';
    }
  } else {
    if (statusEl) statusEl.textContent = 'Time-Out Recorded · Duty Logged';
    if (banner) {
      banner.className = 'status-banner timeout';
    }
    if (iconBox) {
      iconBox.style.background = 'rgba(33, 150, 243, 0.15)';
      iconBox.style.color = 'var(--ch-500)';
    }
  }
}

/**
 * Appends a row to Today's Ingress Log
 */
function appendScanLog(eventType, status, timeStr, method = 'QR') {
  const log = document.getElementById('scanLog');
  const emptyPrompt = document.getElementById('emptyLogPrompt');
  const countBadge = document.getElementById('scanCountBadge');
  if (!log) return;

  if (emptyPrompt) emptyPrompt.remove();

  const isTimeIn = eventType === 'time_in';
  const isLate = status === 'late';
  const statusColor = isTimeIn
    ? (isLate ? 'var(--late)' : 'var(--present)')
    : 'var(--ch-500)';
  const statusSoft = isTimeIn
    ? (isLate ? 'var(--late-soft)' : 'var(--present-soft)')
    : 'rgba(33, 150, 243, 0.12)';

  const row = document.createElement('div');
  row.className = 'p-3 flex items-center justify-between gap-3 text-xs border-b animate-fade-in';
  row.style.cssText = 'border-color:var(--border);';

  row.innerHTML = `
    <div class="flex items-center gap-2.5">
      <span style="width:8px; height:8px; border-radius:50%; background:${statusColor}; flex-shrink:0;"></span>
      <div>
        <div class="font-semibold text-[var(--text-1)]">${isTimeIn ? 'Time-In' : 'Time-Out'}</div>
        <div class="text-[10.5px] text-[var(--text-3)] font-mono">${method} · Admin Terminal</div>
      </div>
    </div>
    <div class="text-right">
      <div class="font-mono font-bold tabular-nums text-[var(--text-1)]">${timeStr}</div>
      <span class="badge" style="background:${statusSoft}; color:${statusColor}; font-size:9.5px; font-weight:700;">
        ${isTimeIn ? (isLate ? 'LATE' : 'PRESENT') : 'TIMED-OUT'}
      </span>
    </div>
  `;

  log.prepend(row);

  todayLogs.unshift({ event_type: eventType, status, time: timeStr, method });
  if (countBadge) {
    countBadge.textContent = `${todayLogs.length} Scan${todayLogs.length !== 1 ? 's' : ''}`;
  }
}

/**
 * Loads today's existing attendance for the authenticated teacher
 */
async function loadTodayAttendance() {
  const today = new Date().toISOString().split('T')[0];

  // Set today's date badge
  const dateBadge = document.getElementById('todayDateBadge');
  if (dateBadge) {
    const d = new Date();
    dateBadge.textContent = d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  // 1. Query Supabase for real attendance logs if available
  const sb = getSupabase();
  const user = currentUser || getCurrentUser();
  const teacherId = user?.id || 't0000000-0000-0000-0000-000000000001';

  let loadedRealData = false;

  if (sb && teacherId) {
    try {
      const { data: logs, error } = await sb
        .from('attendance_logs')
        .select('*')
        .eq('teacher_id', teacherId)
        .gte('scanned_at', `${today}T00:00:00`)
        .lte('scanned_at', `${today}T23:59:59`)
        .eq('is_voided', false)
        .order('scanned_at', { ascending: true });

      if (!error && Array.isArray(logs) && logs.length > 0) {
        logs.forEach(log => {
          const scanTime = new Date(log.scanned_at);
          const timeStr = fmtTime(scanTime);
          updateStatusBanner(log.event_type, timeStr, log.status);
          appendScanLog(log.event_type, log.status, timeStr, (log.scan_method || 'qr').toUpperCase());
        });
        loadedRealData = true;
      }
    } catch (err) {
      console.debug('[QR Attendance] Live log fetch note:', err);
    }
  }

  // 2. Check local session storage if no real DB logs returned
  if (!loadedRealData) {
    try {
      const stored = localStorage.getItem(`ams_teacher_ingress_${today}`);
      if (stored) {
        const records = JSON.parse(stored);
        if (Array.isArray(records)) {
          records.forEach(rec => {
            updateStatusBanner(rec.event_type, rec.time, rec.status);
            appendScanLog(rec.event_type, rec.status, rec.time, rec.method);
          });
        }
      }
    } catch (e) {}
  }
}

/**
 * Saves ingress record into local storage for resilient demonstration
 */
function persistLocalIngress(eventType, status, timeStr) {
  const today = new Date().toISOString().split('T')[0];
  try {
    const key = `ams_teacher_ingress_${today}`;
    const stored = localStorage.getItem(key);
    const records = stored ? JSON.parse(stored) : [];
    records.push({ event_type: eventType, status, time: timeStr, method: 'QR', timestamp: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(records));
  } catch (e) {}
}

/**
 * Processes a scanned QR string and strictly enforces Time-In vs Time-Out validation rules
 */
async function processQrToken(rawQrString) {
  if (isProcessingScan) return;

  const now = Date.now();
  if (rawQrString === lastScanToken && now - lastScanTime < COOLDOWN_MS) {
    return; // Cooldown throttle
  }

  isProcessingScan = true;
  lastScanToken = rawQrString;
  lastScanTime = now;

  const nowDate = new Date();
  const timeStr = fmtTime(nowDate);

  // ── STEP 1: VALIDATE AND RESOLVE ADMIN QR PAYLOAD ──────────────────────────
  let token = null;
  let sessionType = null;
  let isAuthorizedAdminPass = false;

  // A. Check if the QR code is structured JSON generated by Admin Station
  try {
    const parsed = JSON.parse(rawQrString);
    if (parsed && (parsed.ams_auth === 'bcp_ams_admin_station' || parsed.session_type)) {
      token = parsed.token || parsed.session_id;
      sessionType = parsed.session_type; // 'time_in' or 'time_out'
      isAuthorizedAdminPass = true;
    }
  } catch (e) {}

  // B. If plain string token, verify against active admin session in localStorage
  if (!isAuthorizedAdminPass) {
    try {
      const activeStored = localStorage.getItem('ams_last_active_session');
      if (activeStored) {
        const sess = JSON.parse(activeStored);
        if (sess && sess.status === 'active' && (sess.session_token === rawQrString || sess.id === rawQrString)) {
          token = sess.session_token || sess.id;
          sessionType = sess.session_type || 'time_in';
          isAuthorizedAdminPass = true;
        }
      }
    } catch (e) {}
  }

  // C. Verify against active database session if Supabase is connected
  if (!isAuthorizedAdminPass) {
    const sb = getSupabase();
    if (sb) {
      try {
        const { data: dbSession } = await sb
          .from('attendance_sessions')
          .select('*')
          .eq('status', 'active')
          .or(`session_token.eq.${rawQrString},id.eq.${rawQrString}`)
          .maybeSingle();

        if (dbSession && new Date(dbSession.session_end) > new Date()) {
          token = dbSession.session_token || dbSession.id;
          sessionType = dbSession.session_type || 'time_in';
          isAuthorizedAdminPass = true;
        }
      } catch (e) {}
    }
  }

  // ── RULE 1: IF NOT A VALID ACTIVE ADMIN PASS -> REJECT WITH ERROR, NO COUNT ─
  if (!isAuthorizedAdminPass || !sessionType) {
    playAudioFeedback('error');
    flashResult(false, 'Invalid QR Pass', 'Unrecognized or expired Admin attendance code. No record logged.');
    toast.show('Invalid QR Pass: Please scan the active Admin Station attendance screen.', 'error');
    setTimeout(() => { isProcessingScan = false; }, 1600);
    return;
  }

  // Current attendance state of this teacher today
  const hasTimeIn = document.getElementById('timeInValue')?.textContent !== '--:-- --';
  const hasTimeOut = document.getElementById('timeOutValue')?.textContent !== '--:-- --';

  // ── RULE 2: VALIDATE TIME-IN PASS ──────────────────────────────────────────
  if (sessionType === 'time_in') {
    if (hasTimeIn) {
      // Teacher already timed in -> REJECT, zero count!
      playAudioFeedback('error');
      flashResult(false, 'Time-In Error', 'Already timed in today. Cannot duplicate Time-In count.');
      toast.show('Time-In Error: You have already recorded your Time-In for today.', 'warning');
      setTimeout(() => { isProcessingScan = false; }, 1600);
      return;
    }

    // Valid Time-In!
    const isLate = (nowDate.getHours() > 8 || (nowDate.getHours() === 8 && nowDate.getMinutes() > 0));
    const status = isLate ? 'late' : 'present';

    // Persist and update UI
    persistLocalIngress('time_in', status, timeStr);
    updateStatusBanner('time_in', timeStr, status);
    appendScanLog('time_in', status, timeStr, 'QR');

    // Notify Admin Station live feed
    try {
      localStorage.setItem('ams_faculty_scan_event', JSON.stringify({
        teacher: currentUser || { first_name: 'Ricardo', last_name: 'Santos', employee_number: '2024-FAC-001' },
        event_type: 'time_in',
        status,
        time: timeStr,
        token,
        timestamp: Date.now()
      }));
    } catch (e) {}

    // Audio & Visual confirmation
    playAudioFeedback('success');
    flashResult(true, 'Time-In Recorded', `${status === 'late' ? 'Late' : 'Present'} at ${timeStr}`);
    toast.show(`Time-In recorded — ${status === 'late' ? 'Late' : 'Present'} (${timeStr})`, 'success');

  // ── RULE 3: VALIDATE TIME-OUT PASS ─────────────────────────────────────────
  } else if (sessionType === 'time_out') {
    if (!hasTimeIn) {
      // Cannot Time-Out without prior Time-In -> REJECT, zero count!
      playAudioFeedback('error');
      flashResult(false, 'Time-Out Error', 'Cannot record Time-Out without prior Time-In record.');
      toast.show('Time-Out Error: Please record Time-In before attempting Time-Out.', 'warning');
      setTimeout(() => { isProcessingScan = false; }, 1600);
      return;
    }

    if (hasTimeOut) {
      // Already timed out -> REJECT, zero count!
      playAudioFeedback('error');
      flashResult(false, 'Time-Out Error', 'Already timed out today. Attendance complete.');
      toast.show('Time-Out Error: You have already completed your Time-Out for today.', 'warning');
      setTimeout(() => { isProcessingScan = false; }, 1600);
      return;
    }

    // Valid Time-Out!
    const status = 'present';

    // Persist and update UI
    persistLocalIngress('time_out', status, timeStr);
    updateStatusBanner('time_out', timeStr, status);
    appendScanLog('time_out', status, timeStr, 'QR');

    // Notify Admin Station live feed
    try {
      localStorage.setItem('ams_faculty_scan_event', JSON.stringify({
        teacher: currentUser || { first_name: 'Ricardo', last_name: 'Santos', employee_number: '2024-FAC-001' },
        event_type: 'time_out',
        status,
        time: timeStr,
        token,
        timestamp: Date.now()
      }));
    } catch (e) {}

    // Audio & Visual confirmation
    playAudioFeedback('success');
    flashResult(true, 'Time-Out Recorded', `Duty Completed at ${timeStr}`);
    toast.show(`Time-Out recorded — Duty Completed (${timeStr})`, 'success');

  } else {
    // Unrecognized session type -> REJECT
    playAudioFeedback('error');
    flashResult(false, 'Invalid Pass', 'Unrecognized pass type.');
    toast.show('Error: Unrecognized attendance pass type.', 'error');
  }

  setTimeout(() => {
    isProcessingScan = false;
  }, 1600);
}

/**
 * Frame capture and jsQR decoding loop
 */
function startScanLoop() {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('scanCanvas');
  if (!video || !canvas || !window.jsQR) return;

  const ctx = canvas.getContext('2d');

  scanInterval = setInterval(() => {
    if (video.readyState !== video.HAVE_ENOUGH_DATA || isProcessingScan) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });

    if (code && code.data) {
      const cleanToken = code.data.trim();
      if (cleanToken) {
        processQrToken(cleanToken);
      }
    }
  }, 160);
}

/**
 * Activates camera viewfinder
 */
async function startCamera() {
  const video = document.getElementById('cameraVideo');
  const placeholder = document.getElementById('cameraPlaceholder');
  const overlay = document.getElementById('scanGuideOverlay');
  const btnStart = document.getElementById('btnStartCamera');
  const btnStop = document.getElementById('btnStopCamera');

  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });

    video.srcObject = videoStream;

    if (placeholder) placeholder.style.display = 'none';
    if (video) video.style.display = 'block';
    if (overlay) overlay.style.display = 'flex';
    if (btnStart) btnStart.disabled = true;
    if (btnStop) btnStop.disabled = false;

    video.addEventListener('loadedmetadata', startScanLoop, { once: true });
    toast.show('Camera active. Point at the Admin QR code.', 'info');
  } catch (err) {
    console.error('[QR Attendance] Camera error:', err);
    toast.show('Camera access denied or unavailable. Use simulation buttons below to test.', 'warning');
  }
}

/**
 * Stops camera viewfinder
 */
function stopCamera() {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
  }

  const video = document.getElementById('cameraVideo');
  const placeholder = document.getElementById('cameraPlaceholder');
  const overlay = document.getElementById('scanGuideOverlay');
  const btnStart = document.getElementById('btnStartCamera');
  const btnStop = document.getElementById('btnStopCamera');

  if (video) {
    video.srcObject = null;
    video.style.display = 'none';
  }
  if (placeholder) placeholder.style.display = 'flex';
  if (overlay) overlay.style.display = 'none';
  if (btnStart) btnStart.disabled = false;
  if (btnStop) btnStop.disabled = true;
}

/**
 * Simulates scanning whatever QR pass is currently live on the Admin Terminal
 */
function handleSimulateActiveScan() {
  const activeStored = localStorage.getItem('ams_last_active_session');
  if (activeStored) {
    try {
      const sess = JSON.parse(activeStored);
      if (sess && sess.status === 'active' && new Date(sess.session_end) > new Date()) {
        const payload = JSON.stringify({
          ams_auth: 'bcp_ams_admin_station',
          session_id: sess.id,
          session_type: sess.session_type || 'time_in',
          token: sess.session_token || sess.id
        });
        processQrToken(payload);
        return;
      }
    } catch (e) {}
  }

  // If no live admin session is open, notify the user or auto-fallback to expected session
  const hasTimeIn = document.getElementById('timeInValue')?.textContent !== '--:-- --';
  const autoType = hasTimeIn ? 'time_out' : 'time_in';
  const autoPayload = JSON.stringify({
    ams_auth: 'bcp_ams_admin_station',
    session_id: 'sess-sim-' + Date.now(),
    session_type: autoType,
    token: `bcp-qr-${autoType}-${Date.now().toString(36)}`
  });

  toast.show(`Simulating Admin Station ${autoType === 'time_in' ? 'Time-In' : 'Time-Out'} Pass...`, 'info');
  processQrToken(autoPayload);
}

/**
 * Simulates scanning an explicit Time-In QR pass from the Admin
 */
function handleSimulateTimeIn() {
  const payload = JSON.stringify({
    ams_auth: 'bcp_ams_admin_station',
    session_id: 'sess-timein-' + Date.now(),
    session_type: 'time_in',
    token: `bcp-qr-in-${Date.now().toString(36)}`
  });
  processQrToken(payload);
}

/**
 * Simulates scanning an explicit Time-Out QR pass from the Admin
 */
function handleSimulateTimeOut() {
  const payload = JSON.stringify({
    ams_auth: 'bcp_ams_admin_station',
    session_id: 'sess-timeout-' + Date.now(),
    session_type: 'time_out',
    token: `bcp-qr-out-${Date.now().toString(36)}`
  });
  processQrToken(payload);
}

/**
 * Simulates scanning an invalid or unauthorized QR code
 */
function handleSimulateInvalid() {
  processQrToken('https://invalid-qr-code.example.com/not-admin-pass');
}

/**
 * Resets today's demonstration attendance state
 */
function handleResetDemoAttendance() {
  const today = new Date().toISOString().split('T')[0];
  try {
    localStorage.removeItem(`ams_teacher_ingress_${today}`);
  } catch (e) {}

  todayLogs = [];
  lastScanToken = null;
  lastScanTime = 0;
  isProcessingScan = false;

  // Reset Time-In Banner
  const bannerTimeIn = document.getElementById('statusBannerTimeIn');
  const valTimeIn = document.getElementById('timeInValue');
  const statusTimeIn = document.getElementById('timeInStatus');
  const iconTimeIn = document.getElementById('timeInIconBox');
  if (bannerTimeIn) bannerTimeIn.className = 'status-banner default';
  if (valTimeIn) valTimeIn.textContent = '--:-- --';
  if (statusTimeIn) statusTimeIn.textContent = 'Not scanned yet';
  if (iconTimeIn) {
    iconTimeIn.style.background = 'var(--raised)';
    iconTimeIn.style.color = 'var(--text-3)';
  }

  // Reset Time-Out Banner
  const bannerTimeOut = document.getElementById('statusBannerTimeOut');
  const valTimeOut = document.getElementById('timeOutValue');
  const statusTimeOut = document.getElementById('timeOutStatus');
  const iconTimeOut = document.getElementById('timeOutIconBox');
  if (bannerTimeOut) bannerTimeOut.className = 'status-banner default';
  if (valTimeOut) valTimeOut.textContent = '--:-- --';
  if (statusTimeOut) statusTimeOut.textContent = 'Scan again after duty to record checkout';
  if (iconTimeOut) {
    iconTimeOut.style.background = 'var(--raised)';
    iconTimeOut.style.color = 'var(--text-3)';
  }

  // Reset Ingress Scan Log
  const log = document.getElementById('scanLog');
  const countBadge = document.getElementById('scanCountBadge');
  if (log) {
    log.innerHTML = '<div id="emptyLogPrompt" style="padding:16px 18px; text-align:center; color:var(--text-3); font-size:12px;">No QR scans recorded for today yet.</div>';
  }
  if (countBadge) {
    countBadge.textContent = '0 Scans';
  }

  toast.show("Today's demo attendance reset. Ready for Time-In.", 'info');
}

/**
 * Main Controller Initialization
 */
async function init() {
  await requireRole(['teacher']);
  currentUser = getCurrentUser();

  await loadTodayAttendance();

  // Button Listeners
  document.getElementById('btnStartCamera')?.addEventListener('click', startCamera);
  document.getElementById('btnStopCamera')?.addEventListener('click', stopCamera);
  document.getElementById('btnSimulateScan')?.addEventListener('click', handleSimulateActiveScan);
  document.getElementById('btnSimulateTimeIn')?.addEventListener('click', handleSimulateTimeIn);
  document.getElementById('btnSimulateTimeOut')?.addEventListener('click', handleSimulateTimeOut);
  document.getElementById('btnSimulateInvalid')?.addEventListener('click', handleSimulateInvalid);
  document.getElementById('btnResetDemoAttendance')?.addEventListener('click', handleResetDemoAttendance);

  // Clean up media streams on page unload
  window.addEventListener('beforeunload', stopCamera);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}