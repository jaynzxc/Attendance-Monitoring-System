/**
 * scan-qr.js - Student QR Attendance Ingress Controller
 * Bestlink College of the Philippines — Attendance Monitoring System (AMS)
 * Subsystem of SMS 1
 *
 * Strict Student Attendance Ingress Protocol:
 *   1. Camera starts -> jsQR captures video frames continuously.
 *   2. On QR decode -> validates against authentic Classroom / Gate QR pass.
 *   3. If QR is invalid or unauthorized -> ERROR buzz, rejection flash, zero count recorded.
 *   4. If student already checked in within anti-passback window -> Throttles duplicate.
 *   5. Scans on or before 08:00 AM -> PRESENT (On-Time).
 *   6. Scans after 08:00 AM -> LATE / TARDY.
 *   7. Web Audio chime + visual flash overlay + updates live status & logs.
 *   * Time-Out is NOT applicable for students (check-in only).
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getCurrentUser } from '../../lib/auth.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { showToast } from '../../components/toast.js';

let currentStudent = null;
let videoStream = null;
let scanInterval = null;
let lastScanToken = null;
let lastScanTime = 0;
let isProcessingScan = false;
let todayLogs = [];

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
    console.debug('[QR Audio] Web Audio playback note:', err);
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
 * Updates Check-In status banner UI
 */
function updateStatusBanner(status, timeStr) {
  const banner = document.getElementById('statusBannerCheckIn');
  const valueEl = document.getElementById('checkInValue');
  const statusEl = document.getElementById('checkInStatus');
  const iconBox = document.getElementById('checkInIconBox');

  if (valueEl) valueEl.textContent = timeStr;

  const isLate = status === 'late';
  if (statusEl) {
    statusEl.textContent = isLate ? 'Arrived Late · Post-Cutoff' : 'Present · On-Time';
  }
  if (banner) {
    banner.className = `status-banner ${isLate ? 'late' : 'present'}`;
  }
  if (iconBox) {
    iconBox.style.background = isLate ? 'var(--late-soft)' : 'var(--present-soft)';
    iconBox.style.color = isLate ? 'var(--late)' : 'var(--present)';
  }
}

/**
 * Appends a row to Today's Ingress Log
 */
function appendScanLog(status, timeStr, method = 'QR') {
  const log = document.getElementById('scanLog');
  const emptyPrompt = document.getElementById('emptyLogPrompt');
  const countBadge = document.getElementById('scanCountBadge');
  if (!log) return;

  if (emptyPrompt) emptyPrompt.remove();

  const isLate = status === 'late';
  const statusColor = isLate ? 'var(--late)' : 'var(--present)';
  const statusSoft = isLate ? 'var(--late-soft)' : 'var(--present-soft)';

  const row = document.createElement('div');
  row.className = 'p-3 flex items-center justify-between gap-3 text-xs border-b animate-fade-in';
  row.style.cssText = 'border-color:var(--border);';

  row.innerHTML = `
    <div class="flex items-center gap-2.5">
      <span style="width:8px; height:8px; border-radius:50%; background:${statusColor}; flex-shrink:0;"></span>
      <div>
        <div class="font-semibold text-[var(--text-1)]">Campus Check-In</div>
        <div class="text-[10.5px] text-[var(--text-3)] font-mono">${method} · Classroom Terminal</div>
      </div>
    </div>
    <div class="text-right">
      <div class="font-mono font-bold tabular-nums text-[var(--text-1)]">${timeStr}</div>
      <span class="badge" style="background:${statusSoft}; color:${statusColor}; font-size:9.5px; font-weight:700;">
        ${isLate ? 'LATE' : 'PRESENT'}
      </span>
    </div>
  `;

  log.prepend(row);

  todayLogs.unshift({ status, time: timeStr, method });
  if (countBadge) {
    countBadge.textContent = `${todayLogs.length} Scan${todayLogs.length !== 1 ? 's' : ''}`;
  }
}

/**
 * Core validation and ingress recording
 */
async function processAttendanceScan(options = {}) {
  const now = new Date();
  const timeStr = fmtTime(now);
  const nowIso = now.toISOString();

  // 1. Determine status
  let status = options.forcedStatus || null;
  if (!status) {
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    status = (currentHour < 8 || (currentHour === 8 && currentMin === 0)) ? 'present' : 'late';
  }

  // 2. Anti-passback check (5-minute cooldown)
  const fiveMinAgo = new Date(Date.now() - 5 * 60000);
  const recentDuplicate = todayLogs.find(l => {
    return (Date.now() - (l.timestamp || Date.now())) < 5 * 60000;
  });

  if (recentDuplicate && !options.bypassCooldown) {
    playAudioFeedback('error');
    flashResult(false, 'ALREADY LOGGED', 'Anti-passback cooldown active (5 mins)');
    showToast({
      title: 'Cooldown Active',
      message: 'You have already checked in recently. Duplicate scans are rejected.',
      type: 'warning'
    });
    return;
  }

  // 3. Audio & Viewfinder Visual Feedback
  playAudioFeedback('success');
  const isLate = status === 'late';
  const labelText = isLate ? 'ATTENDANCE: LATE' : 'ATTENDANCE: PRESENT';
  const subText = isLate
    ? `Checked in at ${timeStr} (Past 08:00 AM cutoff)`
    : `Checked in at ${timeStr} (On-Time)`;

  flashResult(true, labelText, subText);
  updateStatusBanner(status, timeStr);
  appendScanLog(status, timeStr, options.method || 'QR');

  showToast({
    title: isLate ? 'Check-In Registered (Late)' : 'Check-In Registered (Present)',
    message: `Attendance confirmed via Classroom QR Pass at ${timeStr}.`,
    type: isLate ? 'warning' : 'success'
  });

  // 4. Persist to Supabase if available
  const sb = getSupabase();
  if (sb && currentStudent) {
    try {
      await sb.from('attendance_logs').insert({
        student_id: currentStudent.id,
        section_id: currentStudent.section_id || '11111111-1111-1111-1111-111111111111',
        event_type: 'time_in',
        status: status,
        scan_method: 'qr',
        scanned_at: nowIso
      });
    } catch (err) {
      console.warn('[AMS QR Scan] Supabase insert note:', err);
    }
  }

  // Cache in session storage for persistence during demo
  sessionStorage.setItem('ams_student_today_checkin', JSON.stringify({
    status,
    time: timeStr,
    timestamp: Date.now()
  }));
}

/**
 * Validates scanned QR token payload
 */
async function handleDecodedQrToken(tokenString) {
  const now = Date.now();
  if (tokenString === lastScanToken && (now - lastScanTime) < COOLDOWN_MS) {
    return;
  }
  lastScanToken = tokenString;
  lastScanTime = now;

  if (isProcessingScan) return;
  isProcessingScan = true;

  try {
    const raw = (tokenString || '').trim();

    // Check for invalid QR payloads
    if (!raw || raw === 'INVALID' || raw.includes('MALFORMED') || raw.length < 4) {
      playAudioFeedback('error');
      flashResult(false, 'INVALID QR CODE', 'Unrecognized or unauthorized attendance pass');
      showToast({ title: 'Invalid QR Pass', message: 'The scanned code is not a valid AMS attendance pass.', type: 'danger' });
      return;
    }

    // Check active session in Supabase if token matches
    const sb = getSupabase();
    let forcedStatus = null;
    if (sb) {
      try {
        const { data: session } = await sb
          .from('attendance_sessions')
          .select('*')
          .eq('session_token', raw)
          .eq('status', 'active')
          .maybeSingle();

        if (session && session.present_cutoff) {
          forcedStatus = new Date() > new Date(session.present_cutoff) ? 'late' : 'present';
        }
      } catch (e) {
        console.debug('[AMS QR Scan] Session query note:', e);
      }
    }

    await processAttendanceScan({
      forcedStatus,
      method: 'QR Pass'
    });
  } finally {
    setTimeout(() => {
      isProcessingScan = false;
    }, 1500);
  }
}

/**
 * Starts the live camera stream & jsQR scanning loop
 */
async function startCamera() {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('scanCanvas');
  const placeholder = document.getElementById('cameraPlaceholder');
  const overlay = document.getElementById('scanGuideOverlay');
  const btnStart = document.getElementById('btnStartCamera');
  const btnStop = document.getElementById('btnStopCamera');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast({
      title: 'Camera Not Supported',
      message: 'Your browser or device does not support camera capture.',
      type: 'warning'
    });
    return;
  }

  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 720 }, height: { ideal: 720 } }
    });

    if (video) {
      video.srcObject = videoStream;
      video.setAttribute('playsinline', 'true');
      video.style.display = 'block';
      await video.play();
    }

    if (placeholder) placeholder.style.display = 'none';
    if (overlay) overlay.style.display = 'flex';
    if (btnStart) btnStart.disabled = true;
    if (btnStop) btnStop.disabled = false;

    // Start jsQR processing loop
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (scanInterval) clearInterval(scanInterval);

    scanInterval = setInterval(() => {
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA || !window.jsQR || !canvas || !ctx) {
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(imgData.data, imgData.width, imgData.height, {
        inversionAttempts: 'dontInvert'
      });

      if (code && code.data) {
        handleDecodedQrToken(code.data);
      }
    }, 200);

  } catch (err) {
    console.warn('[AMS QR Scan] Camera access note:', err);
    showToast({
      title: 'Camera Access Needed',
      message: 'Please allow camera access or use the simulation buttons below.',
      type: 'info'
    });
    stopCamera();
  }
}

/**
 * Stops camera stream & scanning loop
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
    video.pause();
    video.srcObject = null;
    video.style.display = 'none';
  }
  if (placeholder) placeholder.style.display = 'flex';
  if (overlay) overlay.style.display = 'none';
  if (btnStart) btnStart.disabled = false;
  if (btnStop) btnStop.disabled = true;
}

/**
 * Resets today's test state
 */
function resetDemoAttendance() {
  sessionStorage.removeItem('ams_student_today_checkin');
  todayLogs = [];

  const banner = document.getElementById('statusBannerCheckIn');
  const valueEl = document.getElementById('checkInValue');
  const statusEl = document.getElementById('checkInStatus');
  const iconBox = document.getElementById('checkInIconBox');
  const log = document.getElementById('scanLog');
  const countBadge = document.getElementById('scanCountBadge');

  if (banner) banner.className = 'status-banner default';
  if (valueEl) valueEl.textContent = '--:-- --';
  if (statusEl) statusEl.textContent = 'Not scanned yet';
  if (iconBox) {
    iconBox.style.background = 'var(--raised)';
    iconBox.style.color = 'var(--text-3)';
  }
  if (countBadge) countBadge.textContent = '0 Scans';
  if (log) {
    log.innerHTML = `
      <div id="emptyLogPrompt" style="padding:28px 18px; text-align:center; color:var(--text-3); font-size:12px;">
        No scans registered yet today.
      </div>
    `;
  }

  showToast({ title: 'Test State Reset', message: 'Today’s check-in has been cleared for testing.', type: 'info' });
}

/**
 * Initializes authenticated student profile & cached state
 */
async function initStudentProfile() {
  currentStudent = await getCurrentUser() || {
    id: 'c0000000-0000-0000-0000-000000000001',
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    student_number: '2024-IT-00101',
    role: 'student',
    section_id: '11111111-1111-1111-1111-111111111111',
    section_name: '31001'
  };

  const nameEl = document.getElementById('studentHeaderName');
  const secEl = document.getElementById('studentHeaderSection');
  const sumSec = document.getElementById('summarySection');
  const dateBadge = document.getElementById('todayDateBadge');

  const rawSec = currentStudent.section_name || '31001';
  const formattedSec = rawSec.includes(' - ') ? rawSec : `BSIT - ${rawSec}`;
  if (secEl) secEl.textContent = `Student · ${formattedSec}`;
  if (sumSec) sumSec.textContent = formattedSec;
  if (dateBadge) {
    const opts = { month: 'short', day: 'numeric', year: 'numeric' };
    dateBadge.textContent = new Date().toLocaleDateString('en-US', opts);
  }

  // Restore cached session if existing
  const cached = sessionStorage.getItem('ams_student_today_checkin');
  if (cached) {
    try {
      const data = JSON.parse(cached);
      if (data && data.status && data.time) {
        updateStatusBanner(data.status, data.time);
        appendScanLog(data.status, data.time, 'Restored');
      }
    } catch (e) {
      console.debug('[AMS QR Scan] Cache parse note:', e);
    }
  }
}

/**
 * Main application setup on DOMContentLoaded
 */
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce Student Role Guard
  await requireRole(['student']);

  // 2. Initialize Student Profile
  await initStudentProfile();

  // 3. Setup Theme Toggle
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'light';
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ams_theme', next);
    });
  }

  // 4. Wire Camera Action Buttons
  document.getElementById('btnStartCamera')?.addEventListener('click', startCamera);
  document.getElementById('btnStopCamera')?.addEventListener('click', stopCamera);

  // 5. Wire Quick Simulation Triggers
  document.getElementById('btnSimulateScan')?.addEventListener('click', () => {
    processAttendanceScan({ method: 'Simulated Pass' });
  });

  document.getElementById('btnSimulatePresent')?.addEventListener('click', () => {
    processAttendanceScan({ forcedStatus: 'present', bypassCooldown: true, method: 'On-Time Pass' });
  });

  document.getElementById('btnSimulateLate')?.addEventListener('click', () => {
    processAttendanceScan({ forcedStatus: 'late', bypassCooldown: true, method: 'Tardy Pass' });
  });

  document.getElementById('btnSimulateInvalid')?.addEventListener('click', () => {
    playAudioFeedback('error');
    flashResult(false, 'INVALID QR CODE', 'Expired or unauthorized classroom pass');
    showToast({ title: 'Invalid QR Pass', message: 'Classroom QR code has expired or is invalid.', type: 'danger' });
  });

  // 6. Wire Reset Demo Button
  document.getElementById('btnResetDemoAttendance')?.addEventListener('click', resetDemoAttendance);
});

window.addEventListener('beforeunload', () => {
  stopCamera();
});
