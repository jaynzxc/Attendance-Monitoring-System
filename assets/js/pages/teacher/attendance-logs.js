/**
 * attendance-logs.js - Teacher Portal: Overall Student Attendance Logs Controller
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Authoritative Reference: docs/UI-UX_Architecture.md, docs/DATA.md
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getCurrentUser } from '../../lib/auth.js';
import { sectionsApi } from '../../api/sectionsApi.js';
import { showToast } from '../../components/toast.js';
import { renderNumberedPagination } from '../../components/pagination.js';
import { openExportModal } from '../../components/exportModal.js';

let currentTeacher = null;
let assignedSections = [];
let allAttendanceLogs = [];
let filteredLogs = [];
let selectedDate = new Date().toISOString().split('T')[0];
let currentPage = 0;
const pageSize = 15;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Role Guard
  await requireRole(['teacher']);

  // 2. Fetch authenticated teacher profile
  currentTeacher = await getCurrentUser() || {
    id: 'b0000000-0000-0000-0000-000000000001',
    first_name: 'Ricardo',
    last_name: 'Santos',
    role: 'teacher'
  };

  // 3. Setup Theme Toggle
  initThemeToggle();

  // 4. Setup Default Date Filter
  const dateInput = document.getElementById('filterDate');
  if (dateInput) {
    dateInput.value = selectedDate;
    dateInput.addEventListener('change', async (e) => {
      selectedDate = e.target.value;
      await loadTeacherSubjectsAndLogs();
    });
  }

  // 5. Setup Filters & Search Listeners
  document.getElementById('searchStudent')?.addEventListener('input', filterAndRenderLogs);
  document.getElementById('filterSubject')?.addEventListener('change', filterAndRenderLogs);
  document.getElementById('filterStatus')?.addEventListener('change', filterAndRenderLogs);
  document.getElementById('btnExportCsv')?.addEventListener('click', exportLogsToCsv);

  // 6. Load Initial Data
  await loadTeacherSubjectsAndLogs();
});

/**
 * Initializes Light / Dark Theme Toggle
 */
function initThemeToggle() {
  const toggleBtn = document.getElementById('themeToggle');
  if (!toggleBtn) return;

  const savedTheme = localStorage.getItem('ams_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  toggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('ams_theme', nextTheme);
  });
}

/**
 * Loads teacher's assigned subjects and compiles overall student attendance logs
 */
async function loadTeacherSubjectsAndLogs() {
  const tbody = document.getElementById('logsTableBody');
  if (tbody && (!allAttendanceLogs || allAttendanceLogs.length === 0)) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-sm" style="color:var(--text-3);">Loading student attendance logs...</td></tr>`;
  }

  try {
    assignedSections = await sectionsApi.getSectionsByTeacher(currentTeacher.id);

    if (!assignedSections || assignedSections.length === 0) {
      assignedSections = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'BSIT 3-1',
          subject_code: 'IT 301',
          subject_name: 'Systems Architecture & Integration',
          schedule: '08:00 AM – 10:00 AM',
          room: 'Computer Lab 4',
          active_student_count: 35
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          name: 'BSIT 3-2',
          subject_code: 'IT 302',
          subject_name: 'Database Systems Administration',
          schedule: '01:00 PM – 03:00 PM',
          room: 'Lecture Hall 302',
          active_student_count: 32
        }
      ];
    }

    // Populate Subject Filter Dropdown
    const subjectSelect = document.getElementById('filterSubject');
    if (subjectSelect) {
      const prevVal = subjectSelect.value;
      subjectSelect.innerHTML = '<option value="">All Subjects & Classes</option>' +
        assignedSections.map(sec => {
          const code = sec.subject_code || 'SUBJ';
          const name = sec.subject_name || sec.subject || sec.name;
          return `<option value="${sec.id}">${code} - ${name} (${sec.name})</option>`;
        }).join('');
      if (prevVal) subjectSelect.value = prevVal;
    }

    const kpiSubjectCount = document.getElementById('kpiSubjectCount');
    if (kpiSubjectCount) {
      kpiSubjectCount.textContent = `${assignedSections.length} Subjects`;
    }

    // Fetch roster with attendance for each assigned section
    const logsPromises = assignedSections.map(async (sec) => {
      try {
        let roster = await sectionsApi.getSectionRosterWithAttendance(sec.id, selectedDate);
        if (!roster || roster.length === 0) {
          roster = sectionsApi._getMockSectionRoster(sec.id, selectedDate);
        }
        return (roster || []).map(student => ({
          id: student.id,
          student_id: student.id,
          first_name: student.first_name || '',
          last_name: student.last_name || '',
          student_number: student.student_number || '2024-IT-00000',
          section_id: sec.id,
          section_name: sec.name,
          subject_code: sec.subject_code || 'IT 301',
          subject_name: sec.subject_name || sec.subject || 'Class Subject',
          status: student.status || 'absent',
          scanned_at: student.scanned_at || null,
          scan_method: student.scan_method || 'rfid',
          device_location: student.device_location || (sec.room || 'Classroom Reader'),
          is_voided: student.is_voided || false
        }));
      } catch (secErr) {
        console.warn(`[AMS Teacher Logs] Section ${sec.id} fallback:`, secErr);
        const fallbackRoster = sectionsApi._getMockSectionRoster(sec.id, selectedDate);
        return (fallbackRoster || []).map(student => ({
          id: student.id,
          student_id: student.id,
          first_name: student.first_name || '',
          last_name: student.last_name || '',
          student_number: student.student_number || '2024-IT-00000',
          section_id: sec.id,
          section_name: sec.name,
          subject_code: sec.subject_code || 'IT 301',
          subject_name: sec.subject_name || sec.subject || 'Class Subject',
          status: student.status || 'absent',
          scanned_at: student.scanned_at || null,
          scan_method: student.scan_method || 'rfid',
          device_location: student.device_location || (sec.room || 'Classroom Reader'),
          is_voided: student.is_voided || false
        }));
      }
    });

    const nestedLogs = await Promise.all(logsPromises);
    allAttendanceLogs = nestedLogs.flat();

    filterAndRenderLogs();
  } catch (err) {
    console.error('[AMS Teacher Logs] Error loading logs:', err);
    showToast({
      title: 'Failed to Load Logs',
      message: 'Could not fetch student attendance logs. Please try again.',
      type: 'error'
    });
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>
              <h4>Unable to load records</h4>
              <p>An unexpected network error occurred while compiling attendance logs.</p>
            </div>
          </td>
        </tr>
      `;
    }
  }
}

/**
 * Filters the compiled logs based on active filter toolbar controls and updates UI
 */
function filterAndRenderLogs() {
  const search = (document.getElementById('searchStudent')?.value || '').trim().toLowerCase();
  const selectedSectionId = document.getElementById('filterSubject')?.value || '';
  const selectedStatus = document.getElementById('filterStatus')?.value || '';

  filteredLogs = allAttendanceLogs.filter(log => {
    // Search match (student name or student ID)
    const fullName = `${log.first_name} ${log.last_name}`.toLowerCase();
    const studentNum = (log.student_number || '').toLowerCase();
    const matchesSearch = !search || fullName.includes(search) || studentNum.includes(search);

    // Subject/Section match
    const matchesSection = !selectedSectionId || log.section_id === selectedSectionId;

    // Status match
    let matchesStatus = true;
    if (selectedStatus === 'voided') {
      matchesStatus = log.is_voided === true;
    } else if (selectedStatus) {
      matchesStatus = (log.status || '').toLowerCase() === selectedStatus && !log.is_voided;
    }

    return matchesSearch && matchesSection && matchesStatus;
  });

  currentPage = 0;
  updateKpiSummary();
  renderLogsTable();
}

/**
 * Updates KPI Summary counters at top of page
 */
function updateKpiSummary() {
  const total = filteredLogs.length;
  const present = filteredLogs.filter(l => l.status === 'present' && !l.is_voided).length;
  const late = filteredLogs.filter(l => l.status === 'late' && !l.is_voided).length;
  const absent = filteredLogs.filter(l => (l.status === 'absent' || l.is_voided)).length;
  const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

  const elTotal = document.getElementById('kpiTotalLogs');
  const elPresent = document.getElementById('kpiPresentLogs');
  const elRate = document.getElementById('kpiPresentRate');
  const elLate = document.getElementById('kpiLateLogs');
  const elAbsent = document.getElementById('kpiAbsentLogs');
  const elBadge = document.getElementById('logsCountBadge');

  if (elTotal) elTotal.textContent = total.toLocaleString();
  if (elPresent) elPresent.textContent = (present + late).toLocaleString();
  if (elRate) elRate.textContent = `${rate}% Rate`;
  if (elLate) elLate.textContent = late.toLocaleString();
  if (elAbsent) elAbsent.textContent = absent.toLocaleString();
  if (elBadge) elBadge.textContent = `Showing ${filteredLogs.length} of ${allAttendanceLogs.length} records`;
}

/**
 * Renders audit table rows
 */
function renderLogsTable() {
  const tbody = document.getElementById('logsTableBody');
  if (!tbody) return;

  const totalRecords = filteredLogs.length;

  renderNumberedPagination({
    containerId: 'pageNumbersContainer',
    prevBtnId: 'prevPageBtn',
    nextBtnId: 'nextPageBtn',
    infoTextId: 'pageInfoText',
    totalRecords,
    pageSize,
    currentPage,
    onPageChange: (newPage) => {
      currentPage = newPage;
      renderLogsTable();
    }
  });

  if (totalRecords === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
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

  const pageData = filteredLogs.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  tbody.innerHTML = pageData.map(log => {
    const initials = `${(log.first_name || 'S')[0]}${(log.last_name || '')[0] || ''}`.toUpperCase();
    const studentName = `${log.first_name || ''} ${log.last_name || ''}`.trim() || 'Student';
    const timeFormatted = log.scanned_at
      ? new Date(log.scanned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
      : '—';
    const status = (log.status || 'absent').toLowerCase();
    const isVoided = !!log.is_voided;
    const method = (log.scan_method || 'rfid').toUpperCase();
    const device = log.device_location || (log.scan_method === 'qr' ? 'Classroom QR' : 'Classroom Reader');

    const badgeHtml = isVoided
      ? `<span class="badge" style="background:rgba(239, 68, 68, 0.15); color:var(--absent); border:1px solid rgba(239, 68, 68, 0.3); font-weight:700;">VOIDED</span>`
      : `<span class="badge badge-${status}">${status}</span>`;

    return `
      <tr style="${isVoided ? 'opacity: 0.75; background: rgba(239, 68, 68, 0.03);' : ''}">
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="pf-avatar" style="width:30px; height:30px; font-size:11px; flex-shrink:0;">${initials}</div>
            <div>
              <div style="font-weight:600; color:var(--text-1);">${studentName}</div>
              <div style="font-size:11px; color:var(--text-3); font-family:monospace;">${log.student_number || '—'}</div>
            </div>
          </div>
        </td>
        <td>
          <div style="font-weight:600; color:var(--text-1);">${log.subject_code || ''} · ${log.section_name || ''}</div>
          <div style="font-size:11px; color:var(--text-3);">${log.subject_name || ''}</div>
        </td>
        <td style="font-family:monospace; font-size:12px; font-weight:500;">${timeFormatted}</td>
        <td>${badgeHtml}</td>
        <td>
          <span style="font-size:11px; font-weight:700; padding:2px 7px; border-radius:4px; background:var(--raised); color:var(--text-1); border:1px solid var(--border);">
            ${method}
          </span>
        </td>
        <td>
          <span style="color:${status === 'absent' ? 'var(--absent)' : 'var(--present)'}; font-size:11px; font-weight:600;">
            ${status === 'absent' ? 'Unmarked' : 'Verified'}
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Exports current filtered logs to CSV file
 */
function exportLogsToCsv() {
  if (filteredLogs.length === 0) {
    showToast({ title: 'No Data to Export', message: 'There are no records matching your current filter.', type: 'warning' });
    return;
  }

  const headers = [
    'Student ID',
    'First Name',
    'Last Name',
    'Subject Code',
    'Subject Name',
    'Section',
    'Attendance Status',
    'Recorded Time',
    'Method',
    'Void Status'
  ];

  const rows = filteredLogs.map(l => [
    l.student_number || '',
    l.first_name || '',
    l.last_name || '',
    l.subject_code || '',
    l.subject_name || '',
    l.section_name || '',
    (l.status || '').toUpperCase(),
    l.scanned_at ? new Date(l.scanned_at).toLocaleTimeString() : '',
    (l.scan_method || 'rfid').toUpperCase(),
    l.is_voided ? 'VOIDED' : 'VALID'
  ]);

  const teacherName = `${currentTeacher?.first_name || ''} ${currentTeacher?.last_name || ''}`.trim() || 'Faculty';

  openExportModal({
    title: 'Teacher Section Attendance Logs Ledger',
    filename: `BCP_Attendance_Logs_${selectedDate}`,
    headers,
    rows,
    metadata: {
      'Faculty Member': teacherName,
      'Log Date': selectedDate,
      'Total Records': `${rows.length}`,
      'Academic Term': 'AY 2026-2027 1st Semester'
    }
  });
}
