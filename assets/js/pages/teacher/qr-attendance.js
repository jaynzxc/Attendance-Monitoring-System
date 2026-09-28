/**
 * qr-attendance.js - Teacher QR Attendance Scanner Controller
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 *
 * Flow: Camera starts -> jsQR decodes frame -> POST to scan-ingest (qr method)
 *       -> Response updates Time-In/Time-Out banners and scan log in real time
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { toast } from '../../components/toast.js';
import { getSupabase } from '../../lib/supabaseClient.js';

let videoStream = null;
let scanInterval = null;
let lastScanToken = null;    // Prevents re-processing the same QR code for 5s
let lastScanTime  = 0;

const COOLDOWN_MS = 5000;    // 5-second display lock to prevent double-tap UX

/**
 * Formats a Date to HH:MM AM/PM
 */
function fmtTime(date) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Appends a row to the scan log panel
 */
function appendScanLog(event_type, status, time) {
  const log = document.getElementById('scanLog');
  if (!log) return;
  const placeholder = log.querySelector('div');
  if (placeholder) placeholder.remove();

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 18px;border-bottom:1px solid var(--border);font-size:12.5px;';

  const statusColor = status === 'present' ? 'var(--present)' : status === 'late' ? 'var(--late)' : 'var(--accent)';
  row.innerHTML = `
    <span style="width:8px;height:8px;border-radius:50%;background:${statusColor};flex-shrink:0;"></span>
    <span style="flex:1;color:var(--text-1);font-weight:600;">${event_type === 'time_in' ? 'Time-In' : 'Time-Out'}</span>
    <span style="color:var(--text-2);font-variant-numeric:tabular-nums;">${time}</span>
    <span class="badge" style="background:${statusColor}1e;color:${statusColor};font-size:10.5px;">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
  `;
  log.insertBefore(row, log.firstChild);
}

/**
 * Updates the Time-In or Time-Out status banner
 */
function updateStatusBanner(event_type, time, status) {
  const bannerId  = event_type === 'time_in' ? 'statusBannerTimeIn' : 'statusBannerTimeOut';
  const valueId   = event_type === 'time_in' ? 'timeInValue'  : 'timeOutValue';
  const statusId  = event_type === 'time_in' ? 'timeInStatus' : 'timeOutStatus';
  const banner    = document.getElementById(bannerId);
  const valueEl   = document.getElementById(valueId);
  const statusEl  = document.getElementById(statusId);

  if (valueEl)  valueEl.textContent  = time;
  if (statusEl) statusEl.textContent = status === 'present' ? 'On time' : status === 'late' ? 'Arrived late' : 'Checked out';
  if (banner) {
    banner.className = `status-banner ${status === 'present' ? 'present' : status === 'late' ? 'late' : 'timeout'}`;
  }
}

/**
 * Shows a full-screen result flash over the viewfinder
 */
function flashResult(success, label, sub) {
  const overlay   = document.getElementById('resultOverlay');
  const iconEl    = document.getElementById('resultIcon');
  const labelEl   = document.getElementById('resultLabel');
  const subEl     = document.getElementById('resultSub');
  if (!overlay) return;

  const bg  = success ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)';
  const svg = success
    ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>'
    : '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  if (iconEl)  { iconEl.style.background = bg; iconEl.innerHTML = svg; }
  if (labelEl) labelEl.textContent = label;
  if (subEl)   subEl.textContent   = sub;

  overlay.style.background = 'rgba(0,0,0,0.55)';
  overlay.classList.remove('hidden');
  overlay.classList.add('visible');

  setTimeout(() => {
    overlay.classList.remove('visible');
    overlay.classList.add('hidden');
  }, 2200);
}

/**
 * Processes a decoded QR token and submits to scan-ingest (or simulates it)
 */
async function processQrToken(token) {
  const now = Date.now();
  if (token === lastScanToken && now - lastScanTime < COOLDOWN_MS) return; // UI cooldown

  lastScanToken = token;
  lastScanTime  = now;

  const time = fmtTime(new Date());

  // Determine event_type by whether we already have a time_in today
  const hasTimeIn = document.getElementById('timeInValue')?.textContent !== '--:-- --';
  const event_type = hasTimeIn ? 'time_out' : 'time_in';

  try {
    const sb = getSupabase();
    if (sb) {
      // When real scan-ingest is wired: POST to Edge Function with qr token
      // const { data, error } = await sb.functions.invoke('scan-ingest', { body: { qr_token: token, scan_method: 'qr' } });
    }

    // Simulated successful response for demo
    const status = new Date().getHours() >= 8 ? 'late' : 'present';
    updateStatusBanner(event_type, time, status);
    appendScanLog(event_type, status, time);
    flashResult(true, event_type === 'time_in' ? 'Time-In Recorded' : 'Time-Out Recorded', `Status: ${status.charAt(0).toUpperCase() + status.slice(1)} at ${time}`);
    toast.show(`${event_type === 'time_in' ? 'Time-In' : 'Time-Out'} recorded — ${status.charAt(0).toUpperCase() + status.slice(1)}`, 'success');
  } catch (err) {
    console.error('[QR Attendance] Scan error:', err);
    flashResult(false, 'Scan Failed', 'Could not record attendance. Try again.');
    toast.show('Attendance scan failed. Please retry.', 'error');
  }
}

/**
 * Starts continuous frame capture and QR decoding
 */
function startScanLoop() {
  const video  = document.getElementById('cameraVideo');
  const canvas = document.getElementById('scanCanvas');
  if (!video || !canvas || !window.jsQR) return;

  const ctx = canvas.getContext('2d');

  scanInterval = setInterval(() => {
    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });

    if (code && code.data) {
      processQrToken(code.data);
    }
  }, 200);
}

/**
 * Activates the device camera
 */
async function startCamera() {
  const video       = document.getElementById('cameraVideo');
  const placeholder = document.getElementById('cameraPlaceholder');
  const overlay     = document.getElementById('scanGuideOverlay');
  const badge       = document.getElementById('scannerStatusBadge');
  const btnStart    = document.getElementById('btnStartCamera');
  const btnStop     = document.getElementById('btnStopCamera');

  try {
    videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = videoStream;

    if (placeholder) placeholder.style.display = 'none';
    if (video)       video.style.display       = 'block';
    if (overlay)     overlay.style.display     = 'flex';
    if (badge)       { badge.style.opacity = '1'; badge.innerHTML = '<span class="live-dot"></span> Scanning'; }
    if (btnStart)    btnStart.disabled = true;
    if (btnStop)     btnStop.disabled  = false;

    video.addEventListener('loadedmetadata', startScanLoop, { once: true });
    toast.show('Camera started. Point at the session QR code.', 'info');
  } catch (err) {
    console.error('[QR Attendance] Camera error:', err);
    toast.show('Camera access denied. Please allow camera permissions.', 'error');
  }
}

/**
 * Stops the camera and scan loop
 */
function stopCamera() {
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
  if (videoStream)  { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }

  const video       = document.getElementById('cameraVideo');
  const placeholder = document.getElementById('cameraPlaceholder');
  const overlay     = document.getElementById('scanGuideOverlay');
  const badge       = document.getElementById('scannerStatusBadge');
  const btnStart    = document.getElementById('btnStartCamera');
  const btnStop     = document.getElementById('btnStopCamera');

  if (video)       { video.srcObject = null; video.style.display = 'none'; }
  if (placeholder) placeholder.style.display = 'flex';
  if (overlay)     overlay.style.display     = 'none';
  if (badge)       { badge.style.opacity = '0.4'; badge.innerHTML = '<span class="live-dot" style="background:var(--text-3);"></span> Camera Off'; }
  if (btnStart)    btnStart.disabled = false;
  if (btnStop)     btnStop.disabled  = true;

  toast.show('Camera stopped.', 'info');
}

/**
 * Loads today\'s existing attendance record for this teacher
 */
async function loadTodayAttendance() {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const today = new Date().toISOString().split('T')[0];
    // When wired: query attendance_summary for today\'s teacher record
    // const { data } = await sb.from('attendance_summary').select('*').eq('summary_date', today).single();
  } catch (err) {
    console.warn('[QR Attendance] Could not load existing attendance record:', err);
  }
}

async function init() {
  await requireRole(['teacher']);
  await loadTodayAttendance();

  document.getElementById('btnStartCamera')?.addEventListener('click', startCamera);
  document.getElementById('btnStopCamera')?.addEventListener('click', stopCamera);

  // Clean up camera on page unload
  window.addEventListener('beforeunload', stopCamera);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}