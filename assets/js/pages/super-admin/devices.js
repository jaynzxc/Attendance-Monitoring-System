/**
 * devices.js - Page controller for Super Admin Hardware Device Hub & Key Provisioning
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { devicesApi } from '../../api/devicesApi.js';
import { toast } from '../../components/toast.js';
import { Modal } from '../../components/modal.js';
import { subscribeToDeviceStatus } from '../../lib/realtime.js';

let devicesList = [];
let telemetrySubscription = null;

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateRawApiKey() {
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  const hex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  return `ams_live_${hex}`;
}

function isDeviceOnline(device) {
  if (device.status !== 'active' && device.status !== 'online') return false;
  if (!device.last_heartbeat) return true;
  const diffMinutes = (Date.now() - new Date(device.last_heartbeat).getTime()) / 60000;
  return diffMinutes <= 5;
}

async function loadDevices() {
  devicesList = await devicesApi.getDevices();

  const tbody = document.getElementById('devicesTableBody');
  if (!tbody) return;

  if (devicesList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="py-8 text-center text-slate-400">
          No hardware scanner terminals registered yet. Click "Register Device & Key" above.
        </td>
      </tr>
    `;
    return;
  }

  let gateCount = 0;
  let qrCount = 0;

  tbody.innerHTML = devicesList.map(dev => {
    const isOnline = isDeviceOnline(dev);
    const isGate = dev.device_code.toUpperCase().includes('GATE') || dev.type === 'gate_rfid';
    if (isGate) gateCount++; else qrCount++;

    const statusBadge = isOnline
      ? `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
           <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Online
         </span>`
      : `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
           <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Offline
         </span>`;

    const lastSeenStr = dev.last_heartbeat 
      ? new Date(dev.last_heartbeat).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : 'Never';

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="py-3 px-4 font-mono font-bold text-slate-800">${dev.device_code}</td>
        <td class="py-3 px-4 text-slate-600">${isGate ? 'ESP32 RFID (MFRC522)' : 'Camera QR Terminal'}</td>
        <td class="py-3 px-4 text-slate-700">${dev.location || 'Unassigned'}</td>
        <td class="py-3 px-4 font-mono text-[11px] text-slate-500">${dev.ip_address || '192.168.1.xxx'}</td>
        <td class="py-3 px-4 font-mono text-slate-600 tabular-nums">${lastSeenStr}</td>
        <td class="py-3 px-4 font-mono text-slate-500 text-[11px]">${dev.firmware_version || 'v1.2.0'}</td>
        <td class="py-3 px-4">${statusBadge}</td>
        <td class="py-3 px-4 text-right">
          <button class="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors" data-action="edit" data-id="${dev.id}">
            Configure
          </button>
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('totalScannersCount').textContent = devicesList.length;
  document.getElementById('gateScannersCount').textContent = gateCount;
  document.getElementById('qrKiosksCount').textContent = qrCount;

  // Bind configure buttons
  tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openConfigureDeviceModal(btn.dataset.id));
  });
}

function openConfigureDeviceModal(deviceId) {
  const dev = devicesList.find(d => d.id === deviceId);
  if (!dev) return;

  const content = `
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-medium text-slate-700 mb-1">Device Code</label>
        <input type="text" id="editDevCode" class="w-full text-xs p-2.5 rounded-lg border border-slate-200" value="${dev.device_code}" />
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-700 mb-1">Physical Location</label>
        <input type="text" id="editDevLocation" class="w-full text-xs p-2.5 rounded-lg border border-slate-200" value="${dev.location || ''}" />
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-700 mb-1">Status</label>
        <select id="editDevStatus" class="w-full text-xs p-2.5 rounded-lg border border-slate-200">
          <option value="active" ${dev.status === 'active' || dev.status === 'online' ? 'selected' : ''}>Active / In Service</option>
          <option value="inactive" ${dev.status === 'inactive' || dev.status === 'offline' ? 'selected' : ''}>Inactive / Suspended</option>
        </select>
      </div>
    </div>
  `;

  Modal.open({
    id: 'configDeviceModal',
    title: `Configure Device: ${dev.device_code}`,
    content,
    actions: [
      {
        label: 'Cancel',
        class: 'btn-secondary',
        onClick: () => Modal.close('configDeviceModal')
      },
      {
        label: 'Save Changes',
        class: 'btn-primary',
        onClick: async () => {
          const device_code = document.getElementById('editDevCode').value.trim();
          const location = document.getElementById('editDevLocation').value.trim();
          const status = document.getElementById('editDevStatus').value;

          try {
            await devicesApi.updateDevice(dev.id, { device_code, location, status });
            toast.show(`Terminal ${device_code} updated.`, 'success');
            Modal.close('configDeviceModal');
            loadDevices();
          } catch (err) {
            toast.show('Failed to update terminal: ' + err.message, 'error');
          }
        }
      }
    ]
  });
}

function openRegisterDeviceModal() {
  const rawKey = generateRawApiKey();

  const content = `
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-medium text-slate-700 mb-1">Terminal Device Code</label>
        <input type="text" id="regDevCode" class="w-full text-xs p-2.5 rounded-lg border border-slate-200 font-mono" placeholder="e.g. GATE-03-ESP32" />
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-700 mb-1">Physical Installation Location</label>
        <input type="text" id="regDevLocation" class="w-full text-xs p-2.5 rounded-lg border border-slate-200" placeholder="e.g. Main Campus Gate Entrance 3" />
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-700 mb-1">Generated API Secret Key</label>
        <div class="p-2.5 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-lg break-all select-all border border-slate-800" id="regRawKey">
          ${rawKey}
        </div>
        <p class="text-[11px] text-amber-600 mt-1 font-medium">
          Copy this key into the ESP32 config.h header now. The database will only store its SHA-256 hash.
        </p>
      </div>
    </div>
  `;

  Modal.open({
    id: 'regDeviceModal',
    title: 'Register ESP32 Scanner & Provision API Key',
    content,
    actions: [
      {
        label: 'Cancel',
        class: 'btn-secondary',
        onClick: () => Modal.close('regDeviceModal')
      },
      {
        label: 'Register & Save Hash',
        class: 'btn-primary',
        onClick: async () => {
          const device_code = document.getElementById('regDevCode')?.value.trim();
          const location = document.getElementById('regDevLocation')?.value.trim();

          if (!device_code) {
            toast.show('Please enter a device code.', 'warning');
            return;
          }

          try {
            const api_key_hash = await sha256(rawKey);
            await devicesApi.createDevice({
              device_code,
              location,
              api_key_hash,
              status: 'active'
            });

            toast.show(`Device ${device_code} provisioned successfully!`, 'success');
            Modal.close('regDeviceModal');
            loadDevices();
          } catch (err) {
            toast.show('Registration error: ' + (err.message || 'Check connection'), 'error');
          }
        }
      }
    ]
  });
}

function initLayoutControls() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const toggleBtn = document.getElementById('sidebarToggle');

  toggleBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    backdrop?.classList.toggle('open');
  });

  backdrop?.addEventListener('click', () => {
    sidebar?.classList.remove('open');
    backdrop?.classList.remove('open');
  });

  const themeBtn = document.getElementById('themeToggleBtn');
  themeBtn?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ams_theme', next);
  });
}

async function init() {
  await requireRole('super_admin');
  initLayoutControls();
  document.getElementById('btnRegisterDevice')?.addEventListener('click', openRegisterDeviceModal);

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
