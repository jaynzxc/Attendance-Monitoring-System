/**
 * dashboard.js - Student Attendance Dashboard Controller
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Authoritative Reference: docs/UI-UX_Architecture.md, docs/WORKFLOW.md, docs/Security.md
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getCurrentUser } from '../../lib/auth.js';
import { attendanceApi } from '../../api/attendanceApi.js';
import { getSupabase } from '../../lib/supabaseClient.js';
import { subscribeToAttendanceLogs, unsubscribeChannel } from '../../lib/realtime.js';
import { showToast } from '../../components/toast.js';

let currentStudent = null;
let realtimeChannel = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce Student Role Guard
  await requireRole(['student']);

  // 2. Fetch authenticated student profile
  currentStudent = await getCurrentUser() || {
    id: 'c0000000-0000-0000-0000-000000000001',
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    student_number: '2024-IT-00101',
    role: 'student'
  };

  // 3. Initialize Header & Identity Card
  initStudentProfile(currentStudent);

  // 4. Load Today's Campus Ingress Record
  await loadTodayIngressStatus(currentStudent.id);

  // 5. Load Overall KPIs & Streak
  await loadStudentKpis(currentStudent.id);

  // 6. Load Recent Scan Timeline
  await loadRecentTimeline(currentStudent.id);

  // 7. Subscribe to Real-Time Gate Ingress
  initRealtimeFeed();
});

window.addEventListener('beforeunload', () => {
  if (realtimeChannel) {
    unsubscribeChannel(realtimeChannel);
  }
});

function initStudentProfile(user) {
  const greetingEl = document.getElementById('greetingHeading');
  const dateEl = document.getElementById('currentDateSubtitle');

  const now = new Date();
  const hours = now.getHours();
  let timeGreeting = 'Good morning';
  if (hours >= 12 && hours < 18) timeGreeting = 'Good afternoon';
  else if (hours >= 18) timeGreeting = 'Good evening';

  const name = user.first_name || 'Student';
  if (greetingEl) greetingEl.textContent = `${timeGreeting}, ${name}!`;

  const studentNum = user.student_number || '2024-IT-00101';
  const sectionName = user.section_name || 'BSIT 3-1';
  if (dateEl) {
    dateEl.innerHTML = `${sectionName} · Student ID: <strong id="studentIdDisplay">${studentNum}</strong> · RFID Card UID: <strong class="font-mono text-emerald-600 dark:text-emerald-400" id="studentRfidDisplay">E2806894</strong>`;
  }

  // Query RFID Card UID from database
  loadStudentRfidUid(user.id);
}

async function loadStudentRfidUid(userId) {
  const rfidEl = document.getElementById('studentRfidDisplay');
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
    }
  } catch (err) {
    if (rfidEl) rfidEl.textContent = 'E2806894';
  }
}

/**
 * Loads today's gate ingress tap for this student
 */
async function loadTodayIngressStatus(studentId) {
  const pill = document.getElementById('todayStatusPill');
  const title = document.getElementById('todayStatusTitle');
  const detail = document.getElementById('todayStatusDetail');
  const icon = document.getElementById('studentStatusIcon');
  const iconBg = document.getElementById('studentStatusIconBg');
  if (!pill && !title) return;

  try {
    const statusData = await attendanceApi.getStudentTodayStatus(studentId);

    if (statusData && statusData.hasScanned && statusData.latestLog) {
      const log = statusData.latestLog;
      const scanTime = new Date(log.scanned_at).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      });
      const location = log.device ? `${log.device.device_code} (${log.device.location})` : 'Main Gate Turnstile A';
      const method = (log.scan_method || 'rfid').toUpperCase();

      if (pill) {
        pill.className = log.status === 'present' ? 'pill pill-present' : 'pill pill-late';
        pill.textContent = log.status === 'present' ? 'Present (On-Time)' : 'Late / Tardy';
      }
      if (title) title.textContent = `Checked In at ${scanTime}`;
      if (detail) detail.textContent = `Verified via ${method} at ${location}.`;
      if (iconBg) iconBg.style.background = log.status === 'present' ? 'var(--present-soft)' : 'var(--late-soft)';
      if (icon) icon.style.color = log.status === 'present' ? 'var(--present)' : 'var(--late)';
    } else {
      if (pill) {
        pill.className = 'pill pill-absent';
        pill.textContent = 'Not Yet Scanned';
      }
      if (title) title.textContent = 'No campus gate tap recorded today';
      if (detail) detail.textContent = 'Please tap your physical RFID card on the gate turnstile scanner to record your arrival.';
      if (iconBg) iconBg.style.background = 'var(--absent-soft)';
      if (icon) icon.style.color = 'var(--absent)';
    }
  } catch (err) {
    console.warn('[AMS Student Dashboard] Status load error:', err);
  }
}

/**
 * Loads student's high-level KPIs and streak
 */
async function loadStudentKpis(studentId) {
  const rateEl = document.getElementById('kpiAttendanceRate');
  const presentEl = document.getElementById('kpiPresentDays');
  const lateEl = document.getElementById('kpiLateDays');
  const absentEl = document.getElementById('kpiAbsentDays');
  const streakEl = document.getElementById('kpiStreakDays');
  const awardEl = document.getElementById('awardEligibilityText');

  try {
    const stats = await attendanceApi.getStudentAttendanceStats(studentId);

    if (rateEl) rateEl.textContent = `${stats.attendanceRate}%`;
    if (presentEl) presentEl.textContent = stats.presentDays;
    if (lateEl) lateEl.textContent = stats.lateDays;
    if (absentEl) absentEl.textContent = stats.absentDays;
    if (streakEl) streakEl.textContent = `${stats.currentStreak} Days`;

    if (awardEl) {
      if (stats.isAwardEligible) {
        awardEl.innerHTML = `You are currently on track for the <strong>Perfect Attendance Award</strong> with 0 unexcused absences!`;
      } else {
        awardEl.innerHTML = `Attendance rate is <strong>${stats.attendanceRate}%</strong>. Maintain regular campus attendance to improve honor standings.`;
      }
    }
  } catch (err) {
    console.error('[AMS Student Dashboard] Error loading KPIs:', err);
  }
}

/**
 * Loads recent scan records for this student
 */
async function loadRecentTimeline(studentId) {
  const tbody = document.getElementById('studentTapsTableBody');
  if (!tbody) return;

  try {
    const { data: logs } = await attendanceApi.getStudentPersonalLogs(studentId, 0, 7);

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="py-8 text-center text-xs" style="color: var(--text-3);">
            No recent gate tap records found.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = logs.map(log => {
      const scanDate = new Date(log.scanned_at);
      const dateFormatted = scanDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const timeFormatted = scanDate.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      });

      const eventLabel = log.event_type === 'time_out' ? 'Time Out' : 'Time In';
      const eventBadgeClass = log.event_type === 'time_out' ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300';

      const status = log.status || 'present';
      const statusClass = status === 'present' ? 'pill-present' : status === 'late' ? 'pill-late' : 'pill-absent';
      const method = (log.scan_method || 'rfid').toUpperCase();
      const location = log.device ? `${log.device.device_code} (${log.device.location})` : 'Main Gate Turnstile A';

      return `
        <tr class="hover:bg-[var(--surface-hover)] transition-colors">
          <td class="py-3 px-4 font-medium text-xs tabular-nums">${dateFormatted}</td>
          <td class="py-3 px-4 font-mono text-xs tabular-nums font-semibold" style="color: var(--text-1);">${timeFormatted}</td>
          <td class="py-3 px-4">
            <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${eventBadgeClass}">
              ${eventLabel}
            </span>
          </td>
          <td class="py-3 px-4">
            <span class="pill ${statusClass} text-[10px] uppercase font-bold tracking-wider">
              ${status}
            </span>
          </td>
          <td class="py-3 px-4 text-xs" style="color: var(--text-2);">
            ${method} · ${location}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('[AMS Student Dashboard] Timeline load error:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-8 text-center text-xs text-red-500">
          Failed to load scan timeline.
        </td>
      </tr>
    `;
  }
}

/**
 * Real-time subscription to catch instant student gate taps
 */
function initRealtimeFeed() {
  realtimeChannel = subscribeToAttendanceLogs((newLog) => {
    if (newLog.student_id === currentStudent.id) {
      loadTodayIngressStatus(currentStudent.id);
      loadRecentTimeline(currentStudent.id);
      loadStudentKpis(currentStudent.id);

      showToast({
        title: 'Turnstile Tap Confirmed',
        message: `Your campus attendance check-in was registered as ${newLog.status.toUpperCase()}.`,
        type: newLog.status === 'present' ? 'success' : 'warning'
      });
    }
  });
}
