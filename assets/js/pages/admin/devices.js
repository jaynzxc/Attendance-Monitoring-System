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
 * Initializes Devices view
 */
async function init() {
  await requireRole(['admin']);

  document.getElementById('btnRegisterDevice')?.addEventListener('click', openRegisterDeviceModal);

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
