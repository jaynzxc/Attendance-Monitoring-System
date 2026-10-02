/**
 * attendance-logs.js - Page controller for Admin Attendance Logs & Audit Trail
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { attendanceApi } from '../../api/attendanceApi.js';
import { sectionsApi } from '../../api/sectionsApi.js';
import { toast } from '../../components/toast.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { renderNumberedPagination } from '../../components/pagination.js';
import { openExportModal } from '../../components/exportModal.js';

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
        <td colspan="7">
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
    const student = log.student || {};
    const studentName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown Student';
    const studentNumber = student.student_number || '—';
    const sectionName = log.section?.name || '—';
    const status = (log.status || 'present').toLowerCase();
    const eventType = (log.event_type || 'time_in') === 'time_in' ? 'Time-In' : 'Time-Out';
    const method = (log.scan_method || 'rfid').toUpperCase();

    const voidBadge = log.is_voided
      ? `<span class="badge" style="background:rgba(239, 68, 68, 0.15); color:var(--absent); border:1px solid rgba(239, 68, 68, 0.3); font-weight:700;">VOIDED</span>`
      : `<span class="badge badge-${status}">${status}</span>`;

    return `
      <tr style="${log.is_voided ? 'opacity: 0.75; background: rgba(239, 68, 68, 0.03);' : ''}">
        <td style="font-weight:600; color:var(--text-1);">${formatDateTime(log.scanned_at)}</td>
        <td>
          <div style="font-weight:600; color:var(--text-1);">${studentName}</div>
          <div style="font-size:11px; color:var(--text-3); font-family:monospace;">${studentNumber}</div>
        </td>
        <td><span style="font-weight:600;">${sectionName}</span></td>
        <td><span style="font-size:12px; font-weight:500;">${eventType}</span></td>
        <td>${voidBadge}</td>
        <td>
          <span style="font-size:11px; font-weight:700; padding:2px 6px; border-radius:4px; background:var(--raised); color:var(--text-1); border:1px solid var(--border);">
            ${method}
          </span>
        </td>
        <td>
          ${log.is_voided 
            ? '<span style="color:var(--absent); font-size:11px; font-weight:600;">Voided</span>' 
            : '<span style="color:var(--present); font-size:11px; font-weight:600;">Verified</span>'
          }
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Loads attendance logs with applied filters
 */
async function loadLogs() {
  const sectionId = document.getElementById('filterSection')?.value || null;
  const status = document.getElementById('filterStatus')?.value || null;
  const scanMethod = document.getElementById('filterMethod')?.value || null;
  const dateFrom = document.getElementById('filterDate')?.value || null;
  const search = document.getElementById('searchStudent')?.value.trim().toLowerCase() || '';

  const { data, count } = await attendanceApi.getAttendanceLogs({
    role: 'student',
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
      const student = item.student || {};
      const name = `${student.first_name || ''} ${student.last_name || ''}`.toLowerCase();
      const num = (student.student_number || '').toLowerCase();
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
 * Exports current attendance logs to CSV
 */
function exportToCsv() {
  if (!currentLogs || currentLogs.length === 0) {
    toast.show('No records available to export.', 'warning');
    return;
  }

  const headers = ['Timestamp', 'Student Number', 'Student Name', 'Section', 'Event', 'Status', 'Method', 'Audit'];
  const rows = currentLogs.map(log => {
    const student = log.student || {};
    const studentNumber = student.student_number || '';
    const studentName = `${student.first_name || ''} ${student.last_name || ''}`.trim();
    const sectionName = log.section?.name || '';
    return [
      new Date(log.scanned_at).toLocaleString(),
      studentNumber,
      studentName,
      sectionName,
      log.event_type || 'time_in',
      (log.status || '').toUpperCase(),
      (log.scan_method || 'rfid').toUpperCase(),
      log.is_voided ? 'Voided' : 'Verified'
    ];
  });

  const dateStamp = new Date().toISOString().split('T')[0];

  openExportModal({
    title: 'Institutional Attendance Logs Ledger',
    filename: `AMS_Attendance_Logs_${dateStamp}`,
    headers,
    rows,
    metadata: {
      'Generated By': 'Registrar / Admin',
      'Export Date': dateStamp,
      'Total Records': `${rows.length}`,
      'System Subsystem': 'SMS 1 Attendance Monitoring System'
    }
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

  // Initial load
  loadLogs();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
