/**
 * my-logs.js - Teacher Personal Attendance History Controller
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Authoritative Reference: docs/UI-UX_Architecture.md, docs/WORKFLOW.md, docs/Security.md
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getCurrentUser } from '../../lib/auth.js';
import { attendanceApi } from '../../api/attendanceApi.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { subscribeToAttendanceLogs, unsubscribeChannel } from '../../lib/realtime.js';
import { showToast } from '../../components/toast.js';
import { renderNumberedPagination } from '../../components/pagination.js';

let currentTeacher = null;
let currentPage = 0;
const pageSize = 15;
let totalCount = 0;
let realtimeChannel = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce Teacher Role Guard
  await requireRole(['teacher']);

  // 2. Fetch authenticated teacher profile
  currentTeacher = await getCurrentUser() || {
    id: 'b0000000-0000-0000-0000-000000000001',
    first_name: 'Ricardo',
    last_name: 'Santos',
    employee_number: 'EMP-2018-042',
    role: 'teacher'
  };

  // 3. Populate Header & Credential Card
  initCredentialProfile(currentTeacher);

  // 4. Set Default Date Filter (Start of current month to today)
  initDateFilters();

  // 5. Load Personal Daily Paired Attendance Records
  await loadPersonalLogs();

  // 6. Setup Event Listeners
  initListeners();

  // 7. Subscribe to Real-Time Gate Ingress
  initRealtimeFeed();
});

window.addEventListener('beforeunload', () => {
  if (realtimeChannel) {
    unsubscribeChannel(realtimeChannel);
  }
});

function initCredentialProfile(user) {
  const nameEl = document.getElementById('facultyNameDisplay');
  const initialsEl = document.getElementById('facultyInitials');
  const empEl = document.getElementById('facultyEmpNum');
  const rfidEl = document.getElementById('facultyRfidUid');

  if (nameEl) nameEl.textContent = `Prof. ${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Prof. Faculty';
  if (empEl) empEl.textContent = user.employee_number || 'EMP-2018-042';

  const initials = `${(user.first_name || 'P')[0]}${(user.last_name || 'T')[0] || ''}`.toUpperCase();
  if (initialsEl) initialsEl.textContent = initials;

  // Fetch assigned RFID UID from database if available
  loadFacultyRfidUid(user.id, rfidEl);
}

async function loadFacultyRfidUid(userId, rfidEl) {
  const sb = getSupabase();
  if (!sb) {
    if (rfidEl) rfidEl.textContent = '99887766';
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

    if (rfidEl) {
      rfidEl.textContent = data ? data.card_uid : '99887766';
    }
  } catch (err) {
    if (rfidEl) rfidEl.textContent = '99887766';
  }
}

function initDateFilters() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  const dateFrom = document.getElementById('filterDateFrom');
  const dateTo = document.getElementById('filterDateTo');

  if (dateFrom) dateFrom.value = firstDay;
  if (dateTo) dateTo.value = today;
}

function initListeners() {
  const filterBtn = document.getElementById('applyFilterBtn');
  const refreshBtn = document.getElementById('refreshLogsBtn');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');

  if (filterBtn) {
    filterBtn.addEventListener('click', () => {
      currentPage = 0;
      loadPersonalLogs();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadPersonalLogs();
      showToast({
        title: 'Logs Refreshed',
        message: 'Your personal attendance records are up-to-date.',
        type: 'info'
      });
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 0) {
        currentPage--;
        loadPersonalLogs();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if ((currentPage + 1) * pageSize < totalCount) {
        currentPage++;
        loadPersonalLogs();
      }
    });
  }
}

async function loadPersonalLogs() {
  const tbody = document.getElementById('personalLogsTableBody');
  const dateFrom = document.getElementById('filterDateFrom')?.value;
  const dateTo = document.getElementById('filterDateTo')?.value;
  const status = document.getElementById('filterStatus')?.value;

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-12 text-center text-sm" style="color: var(--text-3);">
          Loading your personal daily attendance records...
        </td>
      </tr>
    `;
  }

  try {
    const filters = {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      status: status || undefined
    };

    // Use paired daily attendance API
    const { data: records, count } = await attendanceApi.getTeacherDailyAttendance(currentTeacher.id, filters, currentPage, pageSize);
    totalCount = count || 0;

    renderLogsTable(records);
    updatePaginationControls();
    updateMonthlyKpiStats(records);
  } catch (err) {
    console.error('[AMS Teacher MyLogs] Error loading logs:', err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-12 text-center text-sm text-red-500">
            Failed to load attendance logs. Please try again.
          </td>
        </tr>
      `;
    }
  }
}

function renderLogsTable(records) {
  const tbody = document.getElementById('personalLogsTableBody');
  if (!tbody) return;

  if (!records || records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-12 text-center text-sm" style="color: var(--text-3);">
          No attendance records found for this period.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = records.map(record => {
    // 1. Date Formatting
    const dateObj = new Date(record.summary_date + 'T00:00:00');
    const dateFormatted = dateObj.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });

    // 2. Time-In Formatting
    let timeInFormatted = '--:--';
    if (record.time_in) {
      timeInFormatted = new Date(record.time_in).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      });
    }

    // 3. Time-Out Formatting (Paired)
    let timeOutHtml = `<span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">Pending (On Duty)</span>`;
    if (record.time_out) {
      const timeOutStr = new Date(record.time_out).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      });
      timeOutHtml = `<span class="font-mono text-xs tabular-nums font-semibold" style="color: var(--text-1);">${timeOutStr}</span>`;
    }

    // 4. Duration Formatting
    let durationHtml = '--';
    if (record.duration_minutes != null) {
      const hrs = Math.floor(record.duration_minutes / 60);
      const mins = record.duration_minutes % 60;
      durationHtml = `<span class="font-mono text-xs font-semibold tabular-nums" style="color: var(--text-1);">${hrs}h ${mins}m</span>`;
    } else if (record.time_in && !record.time_out) {
      durationHtml = `<span class="text-xs font-medium text-blue-600 dark:text-blue-400">In Progress</span>`;
    }

    // 5. Status Pill
    const rawStatus = (record.status || 'present').toLowerCase();
    let statusPillClass = 'pill-present';
    let statusLabel = 'Present';

    if (rawStatus === 'late') {
      statusPillClass = 'pill-late';
      statusLabel = 'Late';
    } else if (rawStatus === 'absent') {
      statusPillClass = 'pill-absent';
      statusLabel = 'Absent';
    } else if (rawStatus === 'excused') {
      statusPillClass = 'pill-excused';
      statusLabel = 'Excused';
    } else {
      statusPillClass = 'pill-present';
      statusLabel = 'Present';
    }

    // 6. Ingress Method
    const rawMethod = (record.scan_method || record.method || '').toUpperCase();
    let methodBadge = `<span class="px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">RFID</span>`;
    if (record.is_manual || rawMethod.includes('MANUAL') || rawMethod.includes('OVERRIDE')) {
      methodBadge = `<span class="px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">MANUAL</span>`;
    } else if (rawMethod.includes('QR')) {
      methodBadge = `<span class="px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">QR</span>`;
    }

    // 7. Drop device location — single ESP32, column removed

    return `
      <tr class="hover:bg-[var(--surface-hover)] transition-colors">
        <td class="py-3 px-4 font-medium text-xs tabular-nums">${dateFormatted}</td>
        <td class="py-3 px-4 font-mono text-xs tabular-nums font-semibold" style="color: var(--text-1);">${timeInFormatted}</td>
        <td class="py-3 px-4">${timeOutHtml}</td>
        <td class="py-3 px-4">
          <span class="pill ${statusPillClass} text-[11px] uppercase font-bold tracking-wider">
            ${statusLabel}
          </span>
        </td>
        <td class="py-3 px-4">
          ${methodBadge}
        </td>
        <td class="py-3 px-4">${durationHtml}</td>
      </tr>
    `;
  }).join('');
}

function updateMonthlyKpiStats(records) {
  const daysPresentEl = document.getElementById('myDaysPresent');
  const punctualityEl = document.getElementById('myPunctualityRate');
  const daysLateEl = document.getElementById('myDaysLate');
  const latestTapEl = document.getElementById('myLatestTap');

  if (!records || records.length === 0) {
    if (daysPresentEl) daysPresentEl.textContent = '0';
    if (punctualityEl) punctualityEl.textContent = '100%';
    if (daysLateEl) daysLateEl.textContent = '0';
    if (latestTapEl) latestTapEl.textContent = 'No Taps';
    return;
  }

  let onTimeCount = 0;
  let lateCount = 0;

  records.forEach(r => {
    if (r.status === 'present') onTimeCount++;
    else if (r.status === 'late') lateCount++;
  });

  const totalDays = onTimeCount + lateCount || records.length;
  const punctualityRate = totalDays > 0 ? Math.round((onTimeCount / totalDays) * 100) : 100;

  if (daysPresentEl) daysPresentEl.textContent = onTimeCount;
  if (punctualityEl) punctualityEl.textContent = `${punctualityRate}%`;
  if (daysLateEl) daysLateEl.textContent = lateCount;

  const latest = records[0];
  if (latest && latestTapEl) {
    const timeRef = latest.time_out || latest.time_in;
    if (timeRef) {
      const timeStr = new Date(timeRef).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: true
      });
      const dateStr = new Date(latest.summary_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const action = latest.time_out ? 'Time-Out' : 'Time-In';
      latestTapEl.textContent = `${dateStr} · ${timeStr} (${action})`;
    }
  }
}

function updatePaginationControls() {
  renderNumberedPagination({
    containerId: 'pageNumbersContainer',
    prevBtnId: 'prevPageBtn',
    nextBtnId: 'nextPageBtn',
    infoTextId: 'pageInfoText',
    totalRecords: totalCount,
    pageSize,
    currentPage,
    onPageChange: (newPage) => {
      currentPage = newPage;
      loadPersonalLogs();
    }
  });
}


/**
 * Real-time subscription to catch instant gate taps made by this teacher
 */
function initRealtimeFeed() {
  realtimeChannel = subscribeToAttendanceLogs((newLog) => {
    if (newLog.teacher_id === currentTeacher.id) {
      // Reload logs table to show new record immediately
      loadPersonalLogs();
      const action = newLog.event_type === 'time_out' ? 'Time-Out' : 'Time-In';
      showToast({
        title: `${action} Registered`,
        message: `Your campus attendance punch was registered as ${newLog.status.toUpperCase()}.`,
        type: newLog.status === 'present' ? 'success' : 'warning'
      });
    }
  });
}

