/**
 * devices.js - Page controller for ESP32 Scanner Hub & Device Registry
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { devicesApi } from '../../api/devicesApi.js';
import { toast } from '../../components/toast.js';
import { Modal } from '../../components/modal.js';
import { subscribeToDeviceStatus } from '../../lib/realtime.js';

let devicesList = [];
let telemetrySubscription = null;

// ─── QR Session State ───────────────────────────────────────────────────────
let qrSessionToken    = null;
let qrExpiryTimer     = null;
let qrCountdownTimer  = null;
const QR_SESSION_MINUTES = 30;  // Session QR valid for 30 minutes

/**
 * Checks if a device is online based on heartbeat timestamp within 3 minutes
 */
function isDeviceOnline(device) {
  if (device.status !== 'active') return false;
  if (!device.last_heartbeat) return true; // Default true for mock/seed
  const diffMinutes = (Date.now() - new Date(device.last_heartbeat).getTime()) / 60000;
  return diffMinutes <= 3;
}

/**
 * Loads devices and metrics
 */
async function loadDevices() {
  devicesList = await devicesApi.getDevices();

  const tbody = document.getElementById('devicesTableBody');
  if (!tbody) return;

  if (devicesList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <h4>No scanner terminals registered</h4>
            <p>Click "Register Device" above to add gate or classroom scanning devices.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  let onlineCount = 0;
  let offlineCount = 0;
  let gateCount = 0;
  let qrCount = 0;

  tbody.innerHTML = devicesList.map(dev => {
    const online = isDeviceOnline(dev);
    if (online) onlineCount++; else offlineCount++;
    if (dev.is_gate_scanner) gateCount++;
    if (dev.device_type === 'qr_kiosk') qrCount++;

    const lastSeen = dev.last_heartbeat ? new Date(dev.last_heartbeat).toLocaleTimeString() : 'Recent';
    const status = dev.status || 'active';

    return `
      <tr>
        <td>
          <div style="font-weight:700; font-family:monospace; color:var(--text-1); font-size:13.5px;">${dev.device_code}</div>
        </td>
        <td>
          <span style="font-size:11.5px; font-weight:600; text-transform:uppercase; padding:3px 7px; border-radius:4px; background:var(--raised); border:1px solid var(--border); color:var(--text-1);">
            ${dev.device_type === 'esp32_rfid' ? 'ESP32 RFID' : 'Camera QR'}
          </span>
        </td>
        <td style="font-weight:600; color:var(--text-1);">${dev.location || 'Gate'}</td>
        <td>
          ${online ? `
            <span style="display:inline-flex; align-items:center; gap:6px; color:var(--present); font-size:12px; font-weight:600;">
              <span class="live-dot" style="margin-top:1px;"></span>
              Online / Polling
            </span>
          ` : `
            <span style="display:inline-flex; align-items:center; gap:6px; color:var(--text-3); font-size:12px; font-weight:600;">
              <span style="width:6px; height:6px; border-radius:50%; background:var(--text-3);"></span>
              Offline
            </span>
          `}
        </td>
        <td style="font-size:12px; color:var(--text-2); font-variant-numeric:tabular-nums;">${lastSeen}</td>
        <td><span style="font-family:monospace; font-size:11.5px; color:var(--text-3);">${dev.firmware_version || 'v1.0.4-rc'}</span></td>
        <td><span class="badge badge-${status}">${status}</span></td>
        <td style="text-align:right;">
          <div style="display:inline-flex; gap:6px;">
            <button class="btn-secondary btn-edit-device" data-id="${dev.id}" style="padding:4px 8px; font-size:11.5px;">
              Configure
            </button>
            <button class="btn-secondary btn-toggle-status" data-id="${dev.id}" data-status="${status}" style="padding:4px 8px; font-size:11.5px;">
              ${status === 'active' ? 'Set Standby' : 'Set Active'}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Update telemetry cards
  const elOnline = document.getElementById('devicesOnlineCount');
  const elOffline = document.getElementById('devicesOfflineCount');
  const elGate = document.getElementById('gateScannersCount');
  const elQr = document.getElementById('qrKiosksCount');

  if (elOnline) elOnline.textContent = onlineCount;
  if (elOffline) elOffline.textContent = offlineCount;
  if (elGate) elGate.textContent = gateCount;
  if (elQr) elQr.textContent = qrCount;

  // Wire buttons
  document.querySelectorAll('.btn-edit-device').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const devId = e.currentTarget.getAttribute('data-id');
      openEditDeviceModal(devId);
    });
  });

  document.querySelectorAll('.btn-toggle-status').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const devId = e.currentTarget.getAttribute('data-id');
      const currentStatus = e.currentTarget.getAttribute('data-status');
      const newStatus = currentStatus === 'active' ? 'maintenance' : 'active';
      await devicesApi.updateDevice(devId, { status: newStatus });
      toast.show(`Device status changed to ${newStatus}.`, 'info');
      loadDevices();
    });
  });
}

/**
 * Opens Register Device Modal
 */
function openRegisterDeviceModal() {
  const content = `
    <div style="display:flex; flex-direction:column; gap:14px;">
      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Device Identifier Code</label>
        <input type="text" id="regDevCode" class="input-field" style="width:100%; font-family:monospace;" placeholder="e.g. GATE-03-ESP32">
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Device Type</label>
          <select id="regDevType" class="select-field" style="width:100%;">
            <option value="esp32_rfid">ESP32 + RC522 RFID</option>
            <option value="qr_kiosk">Camera QR Terminal</option>
          </select>
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Scanner Scope</label>
          <select id="regIsGate" class="select-field" style="width:100%;">
            <option value="true">Main Gate Perimeter</option>
            <option value="false">Classroom / Room Terminal</option>
          </select>
        </div>
      </div>

      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Physical Location</label>
        <input type="text" id="regLocation" class="input-field" style="width:100%;" placeholder="e.g. North Gate (Turnstile 2)">
      </div>
    </div>
  `;

  Modal.open({
    id: 'registerDeviceModal',
    title: 'Register Scanning Terminal',
    content,
    actions: [
      {
        label: 'Cancel',
        class: 'btn-secondary',
        onClick: () => Modal.close('registerDeviceModal')
      },
      {
        label: 'Register & Generate Key',
        class: 'btn-primary',
        onClick: async () => {
          const device_code = document.getElementById('regDevCode')?.value.trim();
          const device_type = document.getElementById('regDevType')?.value;
          const is_gate_scanner = document.getElementById('regIsGate')?.value === 'true';
          const location = document.getElementById('regLocation')?.value.trim();

          if (!device_code || !location) {
            toast.show('Please provide Device Code and Location.', 'warning');
            return;
          }

          try {
            const res = await devicesApi.registerDevice({
              device_code,
              device_type,
              is_gate_scanner,
              location,
              status: 'active',
              firmware_version: 'v1.0.4'
            });

            Modal.close('registerDeviceModal');

            // Show generated API key to admin for firmware flash
            Modal.open({
              id: 'deviceKeyModal',
              title: `Scanner Enrolled: ${device_code}`,
              content: `
                <div>
                  <p style="margin-bottom:12px;">The scanner was successfully enrolled. Copy the Device API Secret Key and paste it into the ESP32 <code>config.h</code>:</p>
                  <div style="background:var(--raised); padding:12px; border-radius:8px; border:1px solid var(--border); font-family:monospace; font-size:13px; font-weight:700; color:var(--ch-900); word-break:break-all;">
                    ${res.rawKey}
                  </div>
                  <p style="margin-top:10px; font-size:12px; color:var(--late); font-weight:600;">
                    Store this key securely. For security, it will not be displayed again.
                  </p>
                </div>
              `,
              actions: [
                {
                  label: 'Done',
                  class: 'btn-primary',
                  onClick: () => Modal.close('deviceKeyModal')
                }
              ]
            });

            loadDevices();
          } catch (err) {
            toast.show('Failed to register device: ' + (err.message || 'Error'), 'error');
          }
        }
      }
    ]
  });
}

/**
 * Opens Edit Device Modal
 */
function openEditDeviceModal(devId) {
  const dev = devicesList.find(d => d.id === devId);
  if (!dev) return;

  const content = `
    <div style="display:flex; flex-direction:column; gap:14px;">
      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Device Code</label>
        <input type="text" id="editDevCode" class="input-field" style="width:100%; font-family:monospace;" value="${dev.device_code}">
      </div>

      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Physical Location</label>
        <input type="text" id="editLocation" class="input-field" style="width:100%;" value="${dev.location || ''}">
      </div>

      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Firmware Version</label>
        <input type="text" id="editFirmware" class="input-field" style="width:100%; font-family:monospace;" value="${dev.firmware_version || 'v1.0.4'}">
      </div>
    </div>
  `;

  Modal.open({
    id: 'editDeviceModal',
    title: `Configure Terminal: ${dev.device_code}`,
    content,
    actions: [
      {
        label: 'Cancel',
        class: 'btn-secondary',
        onClick: () => Modal.close('editDeviceModal')
      },
      {
        label: 'Save Configuration',
        class: 'btn-primary',
        onClick: async () => {
          const device_code = document.getElementById('editDevCode')?.value.trim();
          const location = document.getElementById('editLocation')?.value.trim();
          const firmware_version = document.getElementById('editFirmware')?.value.trim();

          try {
            await devicesApi.updateDevice(devId, { device_code, location, firmware_version });
            toast.show(`Terminal ${device_code} updated.`, 'success');
            Modal.close('editDeviceModal');
            loadDevices();
          } catch (err) {
            toast.show('Failed to update device: ' + (err.message || 'Error'), 'error');
          }
        }
      }
    ]
  });
}

/**
 * Generates a random session token string
 */
function generateToken() {
  return 'AMS-QR-' + Date.now() + '-' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

/**
 * Draws a simple QR placeholder on the canvas.
 * In production this is replaced by a proper qrcode library (e.g. qrcode.js).
 * The admin screen shows the canvas for faculty to scan via their QR Attendance module.
 */
function drawQROnCanvas(token) {
  const canvas = document.getElementById('qrCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = 180;
  ctx.clearRect(0, 0, size, size);

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // If qrcode.js is available on the page, use it
  if (window.QRCode) {
    canvas.width = canvas.height = 180;
    new window.QRCode(canvas, { text: token, width: 180, height: 180, correctLevel: window.QRCode.CorrectLevel.M });
    return;
  }

  // Fallback: draw a recognisable placeholder pattern
  ctx.fillStyle = '#0D47A1';
  const cells = 8;
  const cell  = size / cells;
  // Finder pattern (top-left)
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      if ((r < 3 || r > 4) && (c < 3 || c > 4)) {
        if ((r + c) % 2 === 0) ctx.fillRect(c * cell, r * cell, cell - 1, cell - 1);
      } else {
        ctx.fillRect(c * cell, r * cell, cell - 1, cell - 1);
      }
    }
  }

  // Token text in center
  ctx.fillStyle = '#0D47A1';
  ctx.font = 'bold 7px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AMS SESSION QR', size / 2, size - 14);
  ctx.fillStyle = '#2196F3';
  ctx.font = '6px monospace';
  ctx.fillText(token.substring(0, 20), size / 2, size - 6);
}

/**
 * Starts a new QR session: generates token, draws QR, shows panel, starts countdown
 */
function startQRSession() {
  // Clear any existing session
  if (qrExpiryTimer)    clearTimeout(qrExpiryTimer);
  if (qrCountdownTimer) clearInterval(qrCountdownTimer);

  qrSessionToken = generateToken();
  const expiresAt = new Date(Date.now() + QR_SESSION_MINUTES * 60 * 1000);

  // Show the panel
  const panel = document.getElementById('qrSessionPanel');
  if (panel) panel.style.display = 'block';

  // Activate badge
  const badge = document.getElementById('qrActiveBadge');
  if (badge) badge.style.opacity = '1';

  // Reset scan log
  const scanLog = document.getElementById('qrScanLog');
  if (scanLog) scanLog.innerHTML = '<div style="font-size:12.5px; color:var(--text-3);">No faculty scans yet for this QR session.</div>';

  // Draw QR
  drawQROnCanvas(qrSessionToken);

  // Countdown display
  function updateExpiry() {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) { closeQRSession(); return; }
    const m = String(Math.floor(remaining / 60000)).padStart(2, '0');
    const s = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
    const el = document.getElementById('qrExpiry');
    if (el) el.textContent = `${m}:${s}`;
  }
  updateExpiry();
  qrCountdownTimer = setInterval(updateExpiry, 1000);

  // Auto-expire
  qrExpiryTimer = setTimeout(closeQRSession, QR_SESSION_MINUTES * 60 * 1000);

  toast.show(`QR session generated. Valid for ${QR_SESSION_MINUTES} minutes.`, 'success');

  // Subscribe to Supabase Realtime for faculty who scan this token (placeholder)
  // subscribeToQrScans(qrSessionToken, onFacultyScan);
}

/**
 * Closes and invalidates the current QR session
 */
function closeQRSession() {
  if (qrExpiryTimer)    { clearTimeout(qrExpiryTimer);    qrExpiryTimer    = null; }
  if (qrCountdownTimer) { clearInterval(qrCountdownTimer); qrCountdownTimer = null; }
  qrSessionToken = null;

  const panel = document.getElementById('qrSessionPanel');
  if (panel) panel.style.display = 'none';

  toast.show('QR session closed.', 'info');
}

/**
 * Appends a faculty scan event to the QR session scan log
 */
function addQrScanEntry(name, eventType, status) {
  const log = document.getElementById('qrScanLog');
  if (!log) return;

  // Remove placeholder
  const placeholder = log.querySelector('div');
  if (placeholder && placeholder.textContent.includes('No faculty')) placeholder.remove();

  const time  = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const color = status === 'present' ? 'var(--present)' : 'var(--late)';
  const row   = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12.5px;';
  row.innerHTML = `
    <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>
    <span style="flex:1;font-weight:600;color:var(--text-1);">${name}</span>
    <span style="color:var(--text-2);font-variant-numeric:tabular-nums;">${eventType === 'time_in' ? 'Time-In' : 'Time-Out'} · ${time}</span>
    <span style="font-size:10.5px;background:${color}1e;color:${color};border-radius:20px;padding:2px 8px;font-weight:600;">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
  `;
  log.insertBefore(row, log.firstChild);
}

/**
 * Initializes Devices view
 */
async function init() {
  await requireRole(['admin']);

  document.getElementById('btnRegisterDevice')?.addEventListener('click', openRegisterDeviceModal);
  document.getElementById('btnGenerateQR')?.addEventListener('click',  startQRSession);
  document.getElementById('btnRegenQR')?.addEventListener('click',    startQRSession);
  document.getElementById('btnCloseQR')?.addEventListener('click',    closeQRSession);

  // Subscribe to live device heartbeat telemetry
  telemetrySubscription = subscribeToDeviceStatus(() => {
    loadDevices();
  });

  loadDevices();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
