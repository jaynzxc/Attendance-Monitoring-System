/**
 * attendance-logs.js - Page controller for Admin Attendance Logs & Audit Trail
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { attendanceApi } from '../../api/attendanceApi.js';
import { sectionsApi } from '../../api/sectionsApi.js';
import { toast } from '../../components/toast.js';
import { Modal } from '../../components/modal.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { renderNumberedPagination } from '../../components/pagination.js';

let currentPage = 0;
const pageSize = 15;
let totalRecords = 0;
let currentLogs = [];

/**
 * Formats ISO timestamp to institutional Philippine format: YYYY-MM-DD HH:MM:SS
 */
function formatDateTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Renders the table body with current logs
 */
function renderLogs(logs) {
  const tbody = document.getElementById('logsTableBody');
  if (!tbody) return;

  if (!logs || logs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>
            <h4>No attendance records found</h4>
            <p>Try adjusting your search criteria or date filters.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = logs.map(log => {
    const person = log.student || log.teacher || {};
    const isTeacher = !!log.teacher_id || person.role === 'teacher';
    const personName = `${person.first_name || ''} ${person.last_name || ''}`.trim() || 'Unknown';
    const idNumber = person.student_number || person.employee_number || '—';
    const affiliation = isTeacher ? '<span style="color:var(--ch-500); font-weight:700;">Faculty / Teacher</span>' : `<span style="font-weight:600;">${log.section?.name || '—'}</span>`;
    const deviceName = log.device?.location || log.device?.device_code || (log.is_manual ? 'Manual Entry' : 'Gate Terminal');
    const status = (log.status || 'present').toLowerCase();
    const eventType = (log.event_type || 'time_in') === 'time_in' ? 'Time-In' : 'Time-Out';
    const method = (log.scan_method || 'rfid').toUpperCase();

    const voidBadge = log.is_voided
      ? `<span class="badge" style="background:rgba(239, 68, 68, 0.15); color:var(--absent); border:1px solid rgba(239, 68, 68, 0.3); font-weight:700;">VOIDED</span>`
      : `<span class="badge badge-${status}">${status}</span>`;

    const manualBadge = log.is_manual
      ? `<span class="badge" style="background:rgba(33, 150, 243, 0.15); color:var(--ch-500); border:1px solid rgba(33, 150, 243, 0.3); font-size:10px; font-weight:700;">MANUAL</span>`
      : '';

    return `
      <tr style="${log.is_voided ? 'opacity: 0.75; background: rgba(239, 68, 68, 0.03);' : ''}">
        <td style="font-weight:600; color:var(--text-1);">${formatDateTime(log.scanned_at)}</td>
        <td>
          <div style="font-weight:600; color:var(--text-1); display:flex; align-items:center; gap:6px;">
            ${personName}
            ${manualBadge}
          </div>
          <div style="font-size:11px; color:var(--text-3); font-family:monospace;">${idNumber} ${isTeacher ? '· Faculty' : ''}</div>
        </td>
        <td>${affiliation}</td>
        <td><span style="font-size:12px; font-weight:500;">${eventType}</span></td>
        <td>${voidBadge}</td>
        <td style="color:var(--text-2); font-size:12px;">${deviceName}</td>
        <td>
          <span style="font-size:11px; font-weight:700; padding:2px 6px; border-radius:4px; background:var(--raised); color:var(--text-1); border:1px solid var(--border);">
            ${method}
          </span>
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="color:var(--present); font-size:11px; font-weight:600;">Verified</span>
            ${!log.is_voided ? `
              <button class="btn-void-row" data-id="${log.id}" data-name="${personName}" title="Void this record for buddy-punching or policy breach" style="background:none; border:none; cursor:pointer; color:var(--text-3); padding:2px 4px; border-radius:4px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              </button>
            ` : `
              <span style="font-size:10px; color:var(--absent); font-weight:600;">Voided</span>
            `}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-void-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const logId = btn.getAttribute('data-id');
      const studentName = btn.getAttribute('data-name');
      promptVoidRecord(logId, studentName);
    });
  });
}

/**
 * Loads attendance logs with applied filters
 */
async function loadLogs() {
  const role = document.getElementById('filterRole')?.value || null;
  const sectionId = document.getElementById('filterSection')?.value || null;
  const status = document.getElementById('filterStatus')?.value || null;
  const scanMethod = document.getElementById('filterMethod')?.value || null;
  const dateFrom = document.getElementById('filterDate')?.value || null;
  const search = document.getElementById('searchStudent')?.value.trim().toLowerCase() || '';

  const { data, count } = await attendanceApi.getAttendanceLogs({
    role,
    sectionId,
    status,
    scanMethod,
    dateFrom,
    dateTo: dateFrom
  }, currentPage, pageSize);

  totalRecords = count;
  currentLogs = data;

  // Client-side search refinement if search query was entered
  let filtered = currentLogs;
  if (search) {
    filtered = currentLogs.filter(item => {
      const person = item.student || item.teacher || {};
      const name = `${person.first_name || ''} ${person.last_name || ''}`.toLowerCase();
      const num = (person.student_number || person.employee_number || '').toLowerCase();
      return name.includes(search) || num.includes(search);
    });
  }

  renderLogs(filtered);
  updatePaginationUI();
}

/**
 * Updates pagination bar elements
 */
function updatePaginationUI() {
  renderNumberedPagination({
    containerId: 'pageNumbersContainer',
    prevBtnId: 'prevPageBtn',
    nextBtnId: 'nextPageBtn',
    infoTextId: 'recordCountText',
    totalRecords,
    pageSize,
    currentPage,
    onPageChange: (newPage) => {
      currentPage = newPage;
      loadLogs();
    }
  });
}

/**
 * Prompts admin to void an attendance record with justification
 */
function promptVoidRecord(logId, studentName) {
  const content = `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <p style="font-size:13px; color:var(--text-1); line-height:1.5;">
        Are you sure you want to mark the attendance record for <strong>${studentName}</strong> as <strong>VOID</strong>?
      </p>
      <div style="background:rgba(239, 68, 68, 0.08); border-left:3px solid var(--absent); padding:10px 12px; border-radius:4px; font-size:12px; color:var(--absent);">
        <strong>Warning:</strong> Voiding marks the daily status as Absent, dispatches an automated Parent Alert, and logs a violation to the Prefect disciplinary system.
      </div>
      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Audit Justification</label>
        <textarea id="voidReasonInput" class="input-field" style="width:100%; height:60px; resize:none;" placeholder="e.g. Buddy-punch tap detected; student was physically absent from class."></textarea>
      </div>
    </div>
  `;

  Modal.open({
    id: 'voidConfirmModal',
    title: 'Void Attendance Record',
    content,
    actions: [
      {
        label: 'Cancel',
        class: 'btn-secondary',
        onClick: () => Modal.close('voidConfirmModal')
      },
      {
        label: 'Confirm Void',
        class: 'btn-primary',
        onClick: async () => {
          const reason = document.getElementById('voidReasonInput')?.value.trim() || 'Buddy punch violation';
          try {
            await attendanceApi.voidAttendanceRecord(logId, reason);
            toast.show('Attendance record successfully voided.', 'success');
            Modal.close('voidConfirmModal');
            loadLogs();
          } catch (err) {
            console.error('[Void Record Error]', err);
            toast.show('Failed to void record: ' + (err.message || 'Error'), 'error');
          }
        }
      }
    ]
  });
}

/**
 * Exports current attendance logs to CSV
 */
function exportToCsv() {
  if (!currentLogs || currentLogs.length === 0) {
    toast.show('No records available to export.', 'warning');
    return;
  }

  const headers = ['Timestamp', 'Identity Number', 'Name', 'Affiliation', 'Event', 'Status', 'Terminal', 'Method', 'Manual', 'Voided'];
  const rows = currentLogs.map(log => {
    const person = log.student || log.teacher || {};
    const idNumber = person.student_number || person.employee_number || '';
    const name = `${person.first_name || ''} ${person.last_name || ''}`.trim();
    const aff = log.teacher_id ? 'Faculty' : (log.section?.name || '');
    return [
      `"${new Date(log.scanned_at).toLocaleString()}"`,
      `"${idNumber}"`,
      `"${name}"`,
      `"${aff}"`,
      `"${log.event_type || 'time_in'}"`,
      `"${log.status || ''}"`,
      `"${log.device?.location || log.device?.device_code || (log.is_manual ? 'Manual' : '')}"`,
      `"${log.scan_method || ''}"`,
      `"${log.is_manual ? 'Yes' : 'No'}"`,
      `"${log.is_voided ? 'Yes' : 'No'}"`
    ];
  });

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `AMS_Attendance_Logs_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  toast.show('Attendance log export downloaded successfully.', 'success');
}

/**
 * Opens Manual Override Modal
 */
function openManualOverrideModal() {
  const content = `
    <div style="display:flex; flex-direction:column; gap:14px;">
      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Target User Type</label>
        <select id="overrideUserType" class="select-field" style="width:100%;">
          <option value="student">Student</option>
          <option value="teacher">Faculty / Teacher</option>
        </select>
      </div>
      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);" id="lblIdNumber">Student Number</label>
        <input type="text" id="overrideIdentifier" class="input-field" style="width:100%;" placeholder="e.g. 2024-IT-00101">
      </div>
      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Target Status</label>
        <select id="overrideStatus" class="select-field" style="width:100%;">
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="excused">Excused</option>
          <option value="absent">Absent</option>
        </select>
      </div>
      <div>
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Reason / Audit Justification</label>
        <textarea id="overrideReason" class="input-field" style="width:100%; height:70px; resize:none;" placeholder="Enter administrative justification for this manual override..."></textarea>
      </div>
    </div>
  `;

  Modal.open({
    id: 'manualOverrideModal',
    title: 'Manual Attendance Override',
    content,
    actions: [
      {
        label: 'Cancel',
        class: 'btn-secondary',
        onClick: () => Modal.close('manualOverrideModal')
      },
      {
        label: 'Submit Override',
        class: 'btn-primary',
        onClick: async () => {
          const userType = document.getElementById('overrideUserType')?.value || 'student';
          const identifier = document.getElementById('overrideIdentifier')?.value.trim();
          const status = document.getElementById('overrideStatus')?.value || 'present';
          const reason = document.getElementById('overrideReason')?.value.trim();

          if (!identifier || !reason) {
            toast.show('Please provide an Identity Number and Justification.', 'warning');
            return;
          }

          const sb = getSupabase();
          if (!sb) {
            toast.show('Supabase client unavailable.', 'error');
            return;
          }

          try {
            let query = sb.from('users').select('id, role, first_name, last_name');
            if (userType === 'student') {
              query = query.eq('student_number', identifier);
            } else {
              query = query.eq('employee_number', identifier);
            }

            const { data: targetUser, error: userErr } = await query.maybeSingle();

            if (userErr || !targetUser) {
              toast.show(`Account with number "${identifier}" not found.`, 'error');
              return;
            }

            await attendanceApi.manualAttendanceOverride({
              user_id: targetUser.id,
              status,
              reason
            });

            toast.show(`Attendance override recorded for ${targetUser.first_name} ${targetUser.last_name}.`, 'success');
            Modal.close('manualOverrideModal');
            loadLogs();
          } catch (err) {
            console.error('[Manual Override Error]', err);
            toast.show('Failed to apply override: ' + (err.message || 'Error'), 'error');
          }
        }
      }
    ]
  });

  setTimeout(() => {
    const typeSelect = document.getElementById('overrideUserType');
    const lbl = document.getElementById('lblIdNumber');
    const input = document.getElementById('overrideIdentifier');
    if (typeSelect && lbl && input) {
      typeSelect.addEventListener('change', () => {
        if (typeSelect.value === 'teacher') {
          lbl.textContent = 'Employee Number';
          input.placeholder = 'e.g. EMP-2020-001';
        } else {
          lbl.textContent = 'Student Number';
          input.placeholder = 'e.g. 2024-IT-00101';
        }
      });
    }
  }, 50);
}

/**
 * Initializes Attendance Logs view
 */
async function init() {
  await requireRole(['admin']);

  // Populate sections dropdown
  const sections = await sectionsApi.getSections();
  const secSelect = document.getElementById('filterSection');
  if (secSelect && sections) {
    sections.forEach(sec => {
      const opt = document.createElement('option');
      opt.value = sec.id;
      opt.textContent = `${sec.name} (${sec.program_code})`;
      secSelect.appendChild(opt);
    });
  }

  // Filter bindings
  document.getElementById('filterRole')?.addEventListener('change', () => { currentPage = 0; loadLogs(); });
  document.getElementById('filterSection')?.addEventListener('change', () => { currentPage = 0; loadLogs(); });
  document.getElementById('filterStatus')?.addEventListener('change', () => { currentPage = 0; loadLogs(); });
  document.getElementById('filterMethod')?.addEventListener('change', () => { currentPage = 0; loadLogs(); });
  document.getElementById('filterDate')?.addEventListener('change', () => { currentPage = 0; loadLogs(); });

  let searchTimeout = null;
  document.getElementById('searchStudent')?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentPage = 0;
      loadLogs();
    }, 280);
  });

  document.getElementById('btnResetFilters')?.addEventListener('click', () => {
    document.getElementById('searchStudent').value = '';
    const roleEl = document.getElementById('filterRole');
    if (roleEl) roleEl.value = '';
    document.getElementById('filterSection').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterMethod').value = '';
    document.getElementById('filterDate').value = '';
    currentPage = 0;
    loadLogs();
  });

  // Pagination buttons
  document.getElementById('prevPageBtn')?.addEventListener('click', () => {
    if (currentPage > 0) {
      currentPage--;
      loadLogs();
    }
  });

  document.getElementById('nextPageBtn')?.addEventListener('click', () => {
    if ((currentPage + 1) * pageSize < totalRecords) {
      currentPage++;
      loadLogs();
    }
  });

  // Action buttons
  document.getElementById('btnExportCsv')?.addEventListener('click', exportToCsv);
  document.getElementById('btnManualOverride')?.addEventListener('click', openManualOverrideModal);

  // Initial load
  loadLogs();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
