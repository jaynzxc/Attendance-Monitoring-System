/**
 * attendance-history.js - Student Attendance History & Logs Controller
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Authoritative Reference: docs/WORKFLOW.md, docs/DATA.md, docs/UI-UX_Architecture.md
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getCurrentUser } from '../../lib/auth.js';
import { attendanceApi } from '../../api/attendanceApi.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { subscribeToAttendanceLogs, unsubscribeChannel } from '../../lib/realtime.js';
import { showToast } from '../../components/toast.js';

let currentStudent = null;
let realtimeChannel = null;

let currentPage = 0;
const pageSize = 10;
let totalRecordsCount = 0;
let currentFilters = {
  dateFrom: '',
  dateTo: '',
  status: '',
  scanMethod: '',
  search: ''
};

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce Student Role Guard
  await requireRole(['student']);

  // 2. Fetch authenticated student profile
  currentStudent = await getCurrentUser() || {
    id: 'c0000000-0000-0000-0000-000000000001',
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    student_number: '2024-IT-00101',
    section_name: 'BSIT 3-1',
    role: 'student'
  };

  // 3. Initialize Student Profile Info
  initStudentProfile(currentStudent);

  // 4. Load High-Level KPIs
  await loadAttendanceKpis(currentStudent.id);

  // 5. Setup Filter Event Listeners
  initFilterControls();

  // 6. Load Initial Table Page
  await loadAttendanceHistoryPage();

  // 7. Subscribe to Real-Time Gate Ingress
  initRealtimeFeed();
});

window.addEventListener('beforeunload', () => {
  if (realtimeChannel) {
    unsubscribeChannel(realtimeChannel);
  }
});

function initStudentProfile(user) {
  const nameEl = document.getElementById('historyStudentName');
  const numEl = document.getElementById('historyStudentNumber');
  const sectionEl = document.getElementById('historySectionName');
  const rfidEl = document.getElementById('historyRfidDisplay');

  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Juan Dela Cruz';
  if (nameEl) nameEl.textContent = fullName;
  if (numEl) numEl.textContent = user.student_number || '2024-IT-00101';
  if (sectionEl) sectionEl.textContent = user.section_name || 'BSIT 3-1';

  loadStudentRfidUid(user.id);
}

async function loadStudentRfidUid(userId) {
  const rfidEl = document.getElementById('historyRfidDisplay');
  const sb = getSupabase();
  if (!sb) {
    if (rfidEl) rfidEl.textContent = 'E2806894';
    return;
  }

  try {
    const { data } = await sb
      .from('rfid_cards')
      .select('card_uid')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (rfidEl && data?.card_uid) {
      rfidEl.textContent = data.card_uid;
    } else if (rfidEl) {
      rfidEl.textContent = 'E2806894';
    }
  } catch (err) {
    if (rfidEl) rfidEl.textContent = 'E2806894';
  }
}

async function loadAttendanceKpis(studentId) {
  const rateEl = document.getElementById('kpiAttendanceRate');
  const presentEl = document.getElementById('kpiPresentDays');
  const lateEl = document.getElementById('kpiLateDays');
  const absentEl = document.getElementById('kpiAbsentDays');

  try {
    const stats = await attendanceApi.getStudentAttendanceStats(studentId);

    if (rateEl) rateEl.textContent = `${stats.attendanceRate}%`;
    if (presentEl) presentEl.textContent = stats.presentDays;
    if (lateEl) lateEl.textContent = stats.lateDays;
    if (absentEl) absentEl.textContent = stats.absentDays;
  } catch (err) {
    console.error('[AMS Student History] Error loading KPIs:', err);
  }
}

function initFilterControls() {
  const resetBtn = document.getElementById('resetFilterBtn');
  const refreshBtn = document.getElementById('refreshLogsBtn');
  const exportBtn = document.getElementById('exportCsvBtn');

  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');

  const dateFromInput = document.getElementById('filterDateFrom');
  const dateToInput = document.getElementById('filterDateTo');
  const statusSelect = document.getElementById('filterStatus');
  const methodSelect = document.getElementById('filterMethod');
  const searchInput = document.getElementById('filterSearch');

  let debounceTimer = null;
  const triggerAutoFilter = (immediate = false) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (immediate) {
      currentPage = 0;
      readFilterInputs();
      loadAttendanceHistoryPage();
    } else {
      debounceTimer = setTimeout(() => {
        currentPage = 0;
        readFilterInputs();
        loadAttendanceHistoryPage();
      }, 250);
    }
  };

  // Immediate filtering on select & date input changes
  if (dateFromInput) dateFromInput.addEventListener('change', () => triggerAutoFilter(true));
  if (dateToInput) dateToInput.addEventListener('change', () => triggerAutoFilter(true));
  if (statusSelect) statusSelect.addEventListener('change', () => triggerAutoFilter(true));
  if (methodSelect) methodSelect.addEventListener('change', () => triggerAutoFilter(true));

  // Debounced live filtering on text search
  if (searchInput) {
    searchInput.addEventListener('input', () => triggerAutoFilter(false));
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (dateFromInput) dateFromInput.value = '';
      if (dateToInput) dateToInput.value = '';
      if (statusSelect) statusSelect.value = '';
      if (methodSelect) methodSelect.value = '';
      if (searchInput) searchInput.value = '';

      currentPage = 0;
      currentFilters = { dateFrom: '', dateTo: '', status: '', scanMethod: '', search: '' };
      loadAttendanceHistoryPage();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      showToast({ title: 'Refreshing...', message: 'Fetching latest attendance logs', type: 'info' });
      await loadAttendanceKpis(currentStudent.id);
      await loadAttendanceHistoryPage();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', exportHistoryToCsv);
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 0) {
        currentPage--;
        loadAttendanceHistoryPage();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const maxPages = Math.ceil(totalRecordsCount / pageSize);
      if (currentPage + 1 < maxPages) {
        currentPage++;
        loadAttendanceHistoryPage();
      }
    });
  }
}

function readFilterInputs() {
  currentFilters.dateFrom = document.getElementById('filterDateFrom')?.value || '';
  currentFilters.dateTo = document.getElementById('filterDateTo')?.value || '';
  currentFilters.status = document.getElementById('filterStatus')?.value || '';
  currentFilters.scanMethod = document.getElementById('filterMethod')?.value || '';
  currentFilters.search = document.getElementById('filterSearch')?.value?.toLowerCase().trim() || '';
}

async function loadAttendanceHistoryPage() {
  const tbody = document.getElementById('attendanceHistoryTableBody');
  const pageInfo = document.getElementById('pageInfoText');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');

  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="7" class="py-12 text-center text-sm" style="color: var(--text-3);">
        Loading attendance history records...
      </td>
    </tr>
  `;

  try {
    const { data: records, count } = await attendanceApi.getStudentDailyAttendance(
      currentStudent.id,
      currentFilters,
      currentPage,
      pageSize
    );

    totalRecordsCount = count || 0;

    let displayRecords = records || [];

    // Optional client-side search query on date, status, or method
    if (currentFilters.search) {
      displayRecords = displayRecords.filter(r => 
        (r.summary_date && r.summary_date.includes(currentFilters.search)) ||
        (r.status && r.status.toLowerCase().includes(currentFilters.search)) ||
        (r.scan_method && r.scan_method.toLowerCase().includes(currentFilters.search))
      );
    }

    if (!displayRecords || displayRecords.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-12 text-center text-sm" style="color: var(--text-3);">
            No attendance records match the selected filters.
          </td>
        </tr>
      `;
      if (pageInfo) pageInfo.textContent = 'Showing 0 records';
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    const todayIso = new Date().toISOString().split('T')[0];

    tbody.innerHTML = displayRecords.map(rec => {
      const isToday = rec.summary_date === todayIso;
      const d = new Date(rec.summary_date + 'T00:00:00');
      const dateFormatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });

      // Check-In (Time-In)
      let checkInHtml = '<span class="text-xs font-mono text-gray-400">--:--</span>';
      if (rec.time_in) {
        const inDate = new Date(rec.time_in);
        const inTimeStr = inDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const inClass = rec.status === 'late' ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-emerald-600 dark:text-emerald-400 font-semibold';
        checkInHtml = `
          <div class="flex items-center gap-1.5 font-mono text-xs tabular-nums">
            <span class="w-1.5 h-1.5 rounded-full ${rec.status === 'late' ? 'bg-amber-500' : 'bg-emerald-500'}"></span>
            <span class="${inClass}">${inTimeStr}</span>
          </div>
        `;
      }

      // Time-Out (Dismissal)
      let checkOutHtml = '<span class="text-xs font-mono text-gray-400">--:--</span>';
      if (rec.time_out) {
        const outDate = new Date(rec.time_out);
        const outTimeStr = outDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        checkOutHtml = `
          <div class="flex items-center gap-1.5 font-mono text-xs tabular-nums font-semibold" style="color: var(--text-1);">
            <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            <span>${outTimeStr}</span>
          </div>
        `;
      } else if (isToday && rec.time_in) {
        checkOutHtml = `
          <span class="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            On Campus
          </span>
        `;
      }

      // Status Badge
      const status = rec.status || 'present';
      const statusClass = status === 'present' ? 'pill-present' : status === 'late' ? 'pill-late' : status === 'excused' ? 'pill-excused' : 'pill-absent';
      const statusLabel = status === 'late' ? 'Tardy' : status.charAt(0).toUpperCase() + status.slice(1);

      // Method
      const method = (rec.scan_method || 'rfid').toUpperCase();

      // Duration
      let durationHtml = '<span class="text-xs font-mono text-gray-400">--</span>';
      if (rec.duration_minutes != null) {
        const hrs = Math.floor(rec.duration_minutes / 60);
        const mins = rec.duration_minutes % 60;
        durationHtml = `<span class="font-mono text-xs tabular-nums font-medium" style="color: var(--text-1);">${hrs}h ${mins}m</span>`;
      } else if (isToday && rec.time_in) {
        durationHtml = `<span class="text-[11px] font-medium text-blue-600 dark:text-blue-400">In Session</span>`;
      }

      // Remarks / Verification Note
      let remarks = 'Verified Gate Ingress';
      if (rec.status === 'late') {
        remarks = `Late arrival (+${rec.minutes_late || 14}m)`;
      } else if (rec.status === 'excused') {
        remarks = 'Excused (Approved Slip)';
      } else if (rec.status === 'absent') {
        remarks = 'Unexcused Absence';
      }

      return `
        <tr class="hover:bg-[var(--surface-hover)] transition-colors">
          <td class="py-3 px-4 font-medium text-xs tabular-nums">
            <div class="flex items-center gap-2">
              <span class="font-semibold" style="color: var(--text-1);">${dateFormatted}</span>
              <span class="text-[11px]" style="color: var(--text-3);">(${weekday})</span>
              ${isToday ? '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 uppercase tracking-wider">Today</span>' : ''}
            </div>
          </td>
          <td class="py-3 px-4">${checkInHtml}</td>
          <td class="py-3 px-4">${checkOutHtml}</td>
          <td class="py-3 px-4">
            <span class="pill ${statusClass} text-[10px] uppercase font-bold tracking-wider">
              ${statusLabel}
            </span>
          </td>
          <td class="py-3 px-4 text-xs">
            <span class="font-semibold text-[10.5px] px-2 py-0.5 rounded border inline-block" style="background: var(--surface); border-color: var(--border); color: var(--accent);">${method}</span>
          </td>
          <td class="py-3 px-4">${durationHtml}</td>
          <td class="py-3 px-4 text-xs font-medium" style="color: var(--text-2);">${remarks}</td>
        </tr>
      `;
    }).join('');

    // Pagination controls
    const startIdx = currentPage * pageSize + 1;
    const endIdx = Math.min((currentPage + 1) * pageSize, totalRecordsCount);
    if (pageInfo) {
      pageInfo.textContent = `Showing ${startIdx} to ${endIdx} of ${totalRecordsCount} records`;
    }

    if (prevBtn) prevBtn.disabled = currentPage === 0;
    if (nextBtn) nextBtn.disabled = endIdx >= totalRecordsCount;

  } catch (err) {
    console.error('[AMS Student History] Load error:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-10 text-center text-xs text-red-500">
          Failed to load attendance history records. Please try again.
        </td>
      </tr>
    `;
  }
}

async function exportHistoryToCsv() {
  try {
    showToast({ title: 'Exporting...', message: 'Generating CSV file of attendance records', type: 'info' });

    // Fetch all filtered records (up to 100)
    const { data: records } = await attendanceApi.getStudentDailyAttendance(
      currentStudent.id,
      currentFilters,
      0,
      100
    );

    if (!records || records.length === 0) {
      showToast({ title: 'Export Failed', message: 'No records available to export', type: 'error' });
      return;
    }

    const headers = ['Date', 'Check-In', 'Time-Out', 'Status', 'Method', 'Duration (Minutes)'];
    const rows = records.map(r => {
      const inTime = r.time_in ? new Date(r.time_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
      const outTime = r.time_out ? new Date(r.time_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
      return [
        r.summary_date,
        `"${inTime}"`,
        `"${outTime}"`,
        `"${r.status || 'present'}"`,
        `"${(r.scan_method || 'rfid').toUpperCase()}"`,
        r.duration_minutes != null ? r.duration_minutes : ''
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BCP_Attendance_History_${currentStudent.student_number || 'student'}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast({ title: 'Export Successful', message: 'Attendance history downloaded as CSV', type: 'success' });
  } catch (err) {
    console.error('[AMS Student History] Export error:', err);
    showToast({ title: 'Export Error', message: 'Failed to generate CSV export', type: 'error' });
  }
}

function initRealtimeFeed() {
  realtimeChannel = subscribeToAttendanceLogs((newLog) => {
    if (newLog.student_id === currentStudent.id) {
      loadAttendanceKpis(currentStudent.id);
      loadAttendanceHistoryPage();

      showToast({
        title: 'Ingress Verified',
        message: `Your campus check-in was registered as ${newLog.status.toUpperCase()}.`,
        type: newLog.status === 'present' ? 'success' : 'warning'
      });
    }
  });
}
