/**
 * settings.js - Page controller for System Settings & Schedule Cutoffs
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { settingsApi } from '../../api/settingsApi.js';
import { toast } from '../../components/toast.js';
import { Modal } from '../../components/modal.js';

let holidaysList = [];

/**
 * Loads and populates current system settings
 */
async function loadSettings() {
  try {
    const s = await settingsApi.getSettings();

    if (s.morning_late_cutoff) document.getElementById('setMorningLate').value = s.morning_late_cutoff;
    if (s.morning_absent_cutoff) document.getElementById('setMorningAbsent').value = s.morning_absent_cutoff;
    if (s.afternoon_late_cutoff) document.getElementById('setAfternoonLate').value = s.afternoon_late_cutoff;
    if (s.anti_passback_cooldown_min) document.getElementById('setCooldown').value = s.anti_passback_cooldown_min;

    if (s.sms_tardy_template) document.getElementById('setTardyTemplate').value = s.sms_tardy_template;
    if (s.sms_absent_template) document.getElementById('setAbsentTemplate').value = s.sms_absent_template;
  } catch (err) {
    console.error('[Settings] Error loading settings:', err);
  }
}

/**
 * Loads institutional holidays list
 */
async function loadHolidays() {
  const tbody = document.getElementById('holidaysTableBody');
  if (!tbody) return;

  holidaysList = await settingsApi.getHolidays();

  if (holidaysList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center; padding:24px; color:var(--text-3);">
          No academic holidays scheduled yet.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = holidaysList.map(h => `
    <tr>
      <td style="font-weight:700; color:var(--text-1); font-family:monospace;">${h.holiday_date}</td>
      <td style="font-weight:600;">${h.title}</td>
      <td>
        <span class="badge" style="background:var(--raised); color:var(--ch-900); font-weight:600;">
          ${h.holiday_type || 'Exempt Holiday'}
        </span>
      </td>
      <td style="text-align:right;">
        <button class="btn-danger btn-delete-holiday" data-id="${h.id}" data-title="${h.title}" style="padding:3px 8px; font-size:11px;">
          Remove
        </button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.btn-delete-holiday').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      const title = e.currentTarget.getAttribute('data-title');
      if (confirm(`Remove holiday "${title}"? Attendance scanning will be re-enabled for this date.`)) {
        await settingsApi.deleteHoliday(id);
        toast.show(`Holiday "${title}" removed.`, 'info');
        loadHolidays();
      }
    });
  });
}

/**
 * Saves all setting inputs
 */
async function saveAllSettings() {
  const settingsMap = {
    morning_late_cutoff: document.getElementById('setMorningLate')?.value || '08:00',
    morning_absent_cutoff: document.getElementById('setMorningAbsent')?.value || '09:00',
    afternoon_late_cutoff: document.getElementById('setAfternoonLate')?.value || '13:00',
    anti_passback_cooldown_min: document.getElementById('setCooldown')?.value || '5',
    sms_tardy_template: document.getElementById('setTardyTemplate')?.value || '',
    sms_absent_template: document.getElementById('setAbsentTemplate')?.value || ''
  };

  try {
    await settingsApi.updateSettings(settingsMap);
    toast.show('System schedule cutoffs and SMS policy updated successfully.', 'success');
  } catch (err) {
    toast.show('Failed to save settings: ' + (err.message || 'Error'), 'error');
  }
}

/**
 * Opens Add Holiday Modal
 */
function openAddHolidayModal() {
  const content = `
    <div style="display:flex; flex-direction:column; gap:14px;">
      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Holiday Date</label>
        <input type="date" id="newHolidayDate" class="input-field" style="width:100%;" value="${new Date().toISOString().split('T')[0]}">
      </div>
      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Holiday Title</label>
        <input type="text" id="newHolidayTitle" class="input-field" style="width:100%;" placeholder="e.g. Bonifacio Day / College Founding Anniversary">
      </div>
      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Category</label>
        <select id="newHolidayType" class="select-field" style="width:100%;">
          <option value="Regular Holiday">Regular National Holiday</option>
          <option value="Special Non-Working">Special Non-Working Holiday</option>
          <option value="Institutional">Bestlink Institutional Event</option>
        </select>
      </div>
    </div>
  `;

  Modal.open({
    id: 'holidayModal',
    title: 'Schedule Academic Holiday',
    content,
    actions: [
      {
        label: 'Cancel',
        class: 'btn-secondary',
        onClick: () => Modal.close('holidayModal')
      },
      {
        label: 'Save Holiday',
        class: 'btn-primary',
        onClick: async () => {
          const holiday_date = document.getElementById('newHolidayDate')?.value;
          const title = document.getElementById('newHolidayTitle')?.value.trim();
          const holiday_type = document.getElementById('newHolidayType')?.value;

          if (!holiday_date || !title) {
            toast.show('Please fill in Date and Title.', 'warning');
            return;
          }

          try {
            await settingsApi.addHoliday({ holiday_date, title, holiday_type });
            toast.show(`Holiday "${title}" scheduled.`, 'success');
            Modal.close('holidayModal');
            loadHolidays();
          } catch (err) {
            toast.show('Failed to add holiday: ' + (err.message || 'Error'), 'error');
          }
        }
      }
    ]
  });
}

/**
 * Initializes Settings view
 */
async function init() {
  await requireRole(['admin']);

  loadSettings();
  loadHolidays();

  document.getElementById('btnSaveAllSettings')?.addEventListener('click', saveAllSettings);
  document.getElementById('btnAddHoliday')?.addEventListener('click', openAddHolidayModal);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
