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

let currentPage = 0;
const pageSize = 20;
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
    const deviceName = log.device?.location || log.device?.device_code || 'Gate Terminal';
    const status = (log.status || 'present').toLowerCase();
    const eventType = (log.event_type || 'time_in') === 'time_in' ? 'Time-In' : 'Time-Out';
    const method = (log.scan_method || 'rfid').toUpperCase();
    const isOffline = log.is_offline_sync;

    return `
      <tr>
        <td style="font-weight:600; color:var(--text-1);">${formatDateTime(log.scanned_at)}</td>
        <td>
          <div style="font-weight:600; color:var(--text-1);">${personName}</div>
          <div style="font-size:11px; color:var(--text-3); font-family:monospace;">${idNumber} ${isTeacher ? '· Faculty' : ''}</div>
        </td>
        <td>${affiliation}</td>
        <td><span style="font-size:12px; font-weight:500;">${eventType}</span></td>
        <td><span class="badge badge-${status}">${status}</span></td>
        <td style="color:var(--text-2); font-size:12px;">${deviceName}</td>
        <td>
          <span style="font-size:11px; font-weight:700; padding:2px 6px; border-radius:4px; background:var(--raised); color:var(--text-1); border:1px solid var(--border);">
            ${method}
          </span>
        </td>
        <td>
          ${isOffline ? `
            <span title="Buffered offline on scanner terminal and synced on network reconnect" style="color:var(--late); font-size:11px; font-weight:600; display:inline-flex; align-items:center; gap:4px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
              Offline Sync
            </span>
          ` : `
            <span style="color:var(--present); font-size:11px; font-weight:600;">Live Feed</span>
          `}
        </td>
      </tr>
    `;
  }).join('');
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
  const countText = document.getElementById('recordCountText');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  const pageIndicator = document.getElementById('pageIndicator');

  const start = totalRecords === 0 ? 0 : currentPage * pageSize + 1;
  const end = Math.min((currentPage + 1) * pageSize, totalRecords);

  if (countText) countText.textContent = `Showing ${start}–${end} of ${totalRecords} records`;
  if (pageIndicator) pageIndicator.textContent = `Page ${currentPage + 1} of ${Math.max(1, Math.ceil(totalRecords / pageSize))}`;

  if (prevBtn) prevBtn.disabled = currentPage === 0;
  if (nextBtn) nextBtn.disabled = (currentPage + 1) * pageSize >= totalRecords;
}

/**
 * Exports current attendance logs to CSV
 */
function exportToCsv() {
  if (!currentLogs || currentLogs.length === 0) {
    toast.show('No records available to export.', 'warning');
    return;
  }

  const headers = ['Timestamp', 'Student Number', 'Student Name', 'Section', 'Event', 'Status', 'Terminal', 'Method', 'Offline Sync'];
  const rows = currentLogs.map(log => [
    `"${new Date(log.scanned_at).toLocaleString()}"`,
    `"${log.student?.student_number || ''}"`,
    `"${log.student?.first_name || ''} ${log.student?.last_name || ''}"`,
    `"${log.section?.name || ''}"`,
    `"${log.event_type || 'time_in'}"`,
    `"${log.status || ''}"`,
    `"${log.device?.location || log.device?.device_code || ''}"`,
    `"${log.scan_method || ''}"`,
    `"${log.is_offline_sync ? 'Yes' : 'No'}"`
  ]);

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
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Student Number</label>
        <input type="text" id="overrideStudentNum" class="input-field" style="width:100%;" placeholder="e.g. 2024-00101">
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Date</label>
          <input type="date" id="overrideDate" class="input-field" style="width:100%;" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--text-1);">Time</label>
          <input type="time" id="overrideTime" class="input-field" style="width:100%;" value="08:00">
        </div>
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
          const studentNum = document.getElementById('overrideStudentNum')?.value.trim();
          const date = document.getElementById('overrideDate')?.value;
          const time = document.getElementById('overrideTime')?.value;
          const status = document.getElementById('overrideStatus')?.value;
          const reason = document.getElementById('overrideReason')?.value.trim();

          if (!studentNum || !reason) {
            toast.show('Please fill in Student Number and Justification.', 'warning');
            return;
          }

          const sb = getSupabase();
          if (!sb) {
            toast.show('Supabase client unavailable.', 'error');
            return;
          }

          try {
            // Find student id
            const { data: student, error: stdErr } = await sb
              .from('users')
              .select('id, section_id')
              .eq('student_number', studentNum)
              .single();

            if (stdErr || !student) {
              toast.show(`Student number "${studentNum}" not found.`, 'error');
              return;
            }

            const timestamp = `${date}T${time}:00`;

            const { data, error } = await sb.rpc('fn_manual_attendance_override', {
              p_student_id: student.id,
              p_section_id: student.section_id,
              p_new_status: status,
              p_timestamp: timestamp,
              p_reason: reason
            });

            if (error) throw error;

            toast.show('Manual attendance override applied successfully.', 'success');
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
