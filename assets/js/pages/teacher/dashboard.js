/**
 * dashboard.js - Teacher/Faculty Dashboard Controller
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Authoritative Reference: docs/UI-UX_Architecture.md, docs/WORKFLOW.md
 * Aligns visually with the executive overview layout while scoping data to faculty classes
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { getCurrentUser } from '../../lib/auth.js';
import { attendanceApi } from '../../api/attendanceApi.js';
import { sectionsApi } from '../../api/sectionsApi.js';
import { renderTrendChart } from '../../components/charts.js';
import { subscribeToAttendanceLogs, unsubscribeChannel } from '../../lib/realtime.js';
import { showToast } from '../../components/toast.js';

let realtimeChannel = null;
let currentTeacher = null;
let assignedSections = [];
let assignedSectionIds = new Set();

/**
 * Animates a numeric element from 0 to target value
 * @param {string} id - Element ID
 * @param {number} end - Target value
 * @param {string} [suffix=''] - Optional suffix (e.g. '%')
 */
export function countUp(id, end, suffix = '') {
  const el = document.getElementById(id);
  if (!el) return;
  const target = Number(end) || 0;
  if (target === 0) {
    el.textContent = '0' + suffix;
    return;
  }
  let cur = 0;
  const step = Math.max(1, Math.round(target / 25));
  const timer = setInterval(() => {
    cur = Math.min(target, cur + step);
    el.textContent = cur + suffix;
    if (cur >= target) clearInterval(timer);
  }, 18);
}

/**
 * Formats ISO timestamp to institutional local time: HH:MM:SS AM/PM
 */
function formatTime(isoString) {
  if (!isoString) return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce Teacher Role Guard
  await requireRole(['teacher']);

  // 2. Fetch authenticated teacher profile
  currentTeacher = await getCurrentUser() || {
    id: 'b0000000-0000-0000-0000-000000000001',
    first_name: 'Ricardo',
    last_name: 'Santos',
    role: 'teacher'
  };

  // 3. Update personalized date in header
  initHeader(currentTeacher);

  // 4. Load teacher's personal RFID attendance status
  await loadTeacherTodayStatus(currentTeacher.id);

  // 5. Load assigned sections, KPIs, breakdown, and watchlist
  await loadAssignedSections(currentTeacher.id);

  // 6. Load 5-week trend chart
  loadTrendChart();

  // 7. Load initial live scans for teacher's sections
  await loadRecentSectionScans();

  // 8. Subscribe to real-time gate ingress
  initRealtimeFeed();

  // 9. Redraw chart on theme switch
  window.addEventListener('ams-theme-changed', () => {
    loadTrendChart();
  });
});

window.addEventListener('beforeunload', () => {
  if (realtimeChannel) {
    unsubscribeChannel(realtimeChannel);
  }
});

function initHeader(user) {
  const dateEl = document.getElementById('pageheadDate');
  const now = new Date();
  if (dateEl) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateEl.textContent = `${now.toLocaleDateString('en-US', options)} · Bestlink College of the Philippines`;
  }
}

/**
 * Loads teacher's personal physical RFID tap record for today
 */
async function loadTeacherTodayStatus(teacherId) {
  const pill = document.getElementById('teacherStatusPill');
  const text = document.getElementById('teacherStatusText');
  const detail = document.getElementById('teacherStatusDetail');
  const icon = document.getElementById('teacherStatusIcon');
  const iconBg = document.getElementById('teacherStatusIconBg');

  try {
    const statusData = await attendanceApi.getTeacherTodayStatus(teacherId);

    if (statusData && statusData.hasScanned && statusData.latestLog) {
      const log = statusData.latestLog;
      const scanTime = formatTime(log.scanned_at);
      const location = log.device ? `${log.device.device_code} (${log.device.location})` : 'Main Gate Turnstile A';
      const method = (log.scan_method || 'rfid').toUpperCase();

      const timeInStr = statusData.timeIn ? formatTime(statusData.timeIn) : scanTime;
      const timeOutStr = statusData.timeOut ? formatTime(statusData.timeOut) : null;

      const summaryText = timeOutStr 
        ? `Checked In: ${timeInStr} · Timed Out: ${timeOutStr}`
        : `Checked In at ${timeInStr} (On Duty)`;

      if (statusData.status === 'present') {
        if (pill) { pill.className = 'pill pill-present'; pill.textContent = timeOutStr ? 'Completed (On-Time)' : 'Present (On-Time)'; }
        if (text) text.textContent = summaryText;
        if (detail) detail.textContent = `Recorded via ${method} at ${location}. Your faculty attendance is confirmed for today.`;
        if (iconBg) { iconBg.style.background = 'var(--present-soft)'; iconBg.style.color = 'var(--present)'; }
      } else if (statusData.status === 'late') {
        if (pill) { pill.className = 'pill pill-late'; pill.textContent = timeOutStr ? 'Completed (Tardy)' : 'Late / Tardy'; }
        if (text) text.textContent = summaryText;
        if (detail) detail.textContent = `Recorded via ${method} at ${location}. Arrival was registered past the 08:00 AM cutoff.`;
        if (iconBg) { iconBg.style.background = 'var(--late-soft)'; iconBg.style.color = 'var(--late)'; }
      }
    } else {
      if (pill) { pill.className = 'pill pill-absent'; pill.textContent = 'Not Scanned Today'; }
      if (text) text.textContent = 'No gate tap recorded yet for today';
      if (detail) detail.textContent = 'Please tap your physical RFID card on any entrance turnstile scanner upon entering campus.';
      if (iconBg) { iconBg.style.background = 'var(--absent-soft)'; iconBg.style.color = 'var(--absent)'; }
    }
  } catch (err) {
    console.warn('[AMS Teacher Dashboard] Error loading teacher status:', err);
  }
}

/**
 * Loads sections assigned to this teacher and populates KPIs, Breakdown, and Watchlist
 */
async function loadAssignedSections(teacherId) {
  const watchlist = document.getElementById('watchlistContainer');

  try {
    assignedSections = await sectionsApi.getSectionsByTeacher(teacherId);
    assignedSectionIds = new Set(assignedSections.map(s => s.id));

    if (!assignedSections || assignedSections.length === 0) {
      if (watchlist) {
        watchlist.innerHTML = `
          <div class="py-8 text-center text-xs" style="color: var(--text-3);">
            No sections currently assigned to your account.
          </div>
        `;
      }
      return;
    }

    let totalEnrolled = 0;
    let totalPresent = 0;
    let totalLate = 0;
    let totalAbsent = 0;
    let totalExcused = 0;

    const sectionItems = await Promise.all(assignedSections.map(async (sec, idx) => {
      const roster = await sectionsApi.getSectionRosterWithAttendance(sec.id);
      const enrolled = roster.length > 0 ? roster.length : (sec.active_student_count || 0);
      const present = roster.filter(r => r.status === 'present').length;
      const late = roster.filter(r => r.status === 'late').length;
      const excused = roster.filter(r => r.status === 'excused').length;
      let absent = roster.filter(r => r.status === 'absent' || r.status === 'unmarked').length;

      // Ensure headcount consistency
      if (enrolled > (present + late + absent + excused)) {
        absent = enrolled - (present + late + excused);
      }

      totalEnrolled += enrolled;
      totalPresent += present;
      totalLate += late;
      totalAbsent += absent;
      totalExcused += excused;

      const attended = present + late;
      const rate = enrolled > 0 ? Number(((attended / enrolled) * 100).toFixed(1)) : 0;
      const absenceRate = enrolled > 0 ? (100 - rate).toFixed(0) : 0;
      const statusPill = rate >= 90 
        ? '<span class="pill pill-present">On track</span>' 
        : rate >= 80 
        ? '<span class="pill pill-late">Monitor</span>' 
        : '<span class="pill pill-absent">Action needed</span>';

      return `
        <div class="list-row">
          <span class="rank">#${idx + 1}</span>
          <div class="row-main">
            <div class="section-name">${sec.name} · ${sec.subject || 'General'}</div>
            <div class="section-sub">${absenceRate}% absence rate this week</div>
          </div>
          ${statusPill}
        </div>
      `;
    }));

    if (watchlist) {
      watchlist.innerHTML = sectionItems.join('');
    }

    // 1. Update Top 4 KPI Cards (countUp animation)
    countUp('k1', totalPresent);
    const overallRate = totalEnrolled > 0 ? Math.round(((totalPresent + totalLate) / totalEnrolled) * 100) : 0;
    countUp('k2', overallRate, '%');
    countUp('k3', totalLate);
    countUp('k4', totalAbsent);

    // 2. Update Today's Breakdown
    const breakdownSub = document.getElementById('breakdownSub');
    if (breakdownSub) breakdownSub.textContent = `Total assigned: ${totalEnrolled} students`;

    const distPresent = document.getElementById('distPresent');
    const distTardy = document.getElementById('distTardy');
    const distAbsent = document.getElementById('distAbsent');
    const distExcused = document.getElementById('distExcused');
    const totalLogged = document.getElementById('totalLoggedVal');

    if (distPresent) distPresent.textContent = totalPresent;
    if (distTardy) distTardy.textContent = totalLate;
    if (distAbsent) distAbsent.textContent = totalAbsent;
    if (distExcused) distExcused.textContent = totalExcused;
    if (totalLogged) totalLogged.textContent = totalEnrolled;

    // Breakdown Progress Bars
    if (totalEnrolled > 0) {
      const pRate = ((totalPresent / totalEnrolled) * 100).toFixed(1);
      const lRate = ((totalLate / totalEnrolled) * 100).toFixed(1);
      const aRate = ((totalAbsent / totalEnrolled) * 100).toFixed(1);
      const eRate = ((totalExcused / totalEnrolled) * 100).toFixed(1);

      const barP = document.getElementById('barPresent');
      const barT = document.getElementById('barTardy');
      const barA = document.getElementById('barAbsent');
      const barE = document.getElementById('barExcused');

      if (barP) barP.style.width = `${pRate}%`;
      if (barT) barT.style.width = `${lRate}%`;
      if (barA) barA.style.width = `${aRate}%`;
      if (barE) barE.style.width = `${eRate}%`;
    }

  } catch (err) {
    console.error('[AMS Teacher Dashboard] Error loading assigned sections:', err);
  }
}

/**
 * Loads and renders the 5-week section attendance trend chart
 */
async function loadTrendChart() {
  try {
    const trendData = await attendanceApi.get5WeekTrend();
    if (Array.isArray(trendData) && trendData.length > 0) {
      const labels = trendData.map(d => d.week);
      const presentData = trendData.map(d => Number(d.rate));
      const targetData = labels.map(() => 90);
      renderTrendChart('trendChart', { labels, presentData, targetData });
    } else {
      renderTrendChart('trendChart', {
        labels: ['W1', 'W2', 'W3', 'W4', 'W5'],
        presentData: [92, 94, 91, 95, 96],
        targetData: [90, 90, 90, 90, 90]
      });
    }
  } catch (err) {
    console.error('[AMS Teacher Dashboard] Error loading trend chart:', err);
    renderTrendChart('trendChart');
  }
}

/**
 * Loads recent gate scans filtered to students in teacher's sections
 */
async function loadRecentSectionScans() {
  const feed = document.getElementById('liveScanList');
  if (!feed) return;

  try {
    const logs = await attendanceApi.getRecentLogs(10);
    const myLogs = logs.filter(l => l.student && (!l.sections || assignedSectionIds.has(l.sections.id) || assignedSectionIds.size === 0));

    if (myLogs.length === 0) {
      feed.innerHTML = `
        <div class="py-8 text-center text-xs" style="color: var(--text-3);">
          No recent scans for your sections today.
        </div>
      `;
      return;
    }

    feed.innerHTML = '';
    myLogs.forEach(l => prependLiveScan(l));
  } catch (err) {
    console.warn('[AMS Teacher Dashboard] loadRecentSectionScans fallback:', err);
  }
}

/**
 * Prepends a scan event to the live scan stream list
 */
function prependLiveScan(log) {
  const container = document.getElementById('liveScanList');
  if (!container) return;

  const student = log.student || {};
  const first = student.first_name || '';
  const last = student.last_name || '';
  const fullName = `${first} ${last}`.trim() || 'Student';
  const initials = `${(first[0] || 'S')}${(last[0] || '')}`.toUpperCase();
  const sectionName = log.sections?.name || 'Class';
  const gate = log.scan_devices?.location || 'Main Gate Turnstile A';
  const method = (log.scan_method || 'rfid').toUpperCase();
  const time = formatTime(log.scanned_at);
  const status = (log.status || 'present').toLowerCase();

  const pillClass = status === 'present' ? 'pill-present' : status === 'late' ? 'pill-late' : 'pill-absent';
  const pillLabel = status === 'present' ? 'Present' : status === 'late' ? 'Late' : 'Absent';

  const row = document.createElement('div');
  row.className = 'list-row';
  row.style.opacity = '0';
  row.style.transform = 'translateY(-6px)';
  row.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

  row.innerHTML = `
    <div class="avatar">${initials}</div>
    <div class="row-main">
      <div class="name">${fullName} · ${sectionName}</div>
      <div class="meta">${time} · ${gate} (${method})</div>
    </div>
    <span class="pill ${pillClass}">${pillLabel}</span>
  `;

  container.insertBefore(row, container.firstChild);
  requestAnimationFrame(() => {
    row.style.opacity = '1';
    row.style.transform = 'translateY(0)';
  });

  if (container.children.length > 8) {
    container.removeChild(container.lastChild);
  }
}

/**
 * Subscribes to live WebSocket attendance logs and updates faculty dashboard
 */
function initRealtimeFeed() {
  realtimeChannel = subscribeToAttendanceLogs(async (newLog) => {
    // 1. If log belongs to the teacher themselves (gate check-in / time-out)
    if (newLog.teacher_id === currentTeacher.id) {
      loadTeacherTodayStatus(currentTeacher.id);
      showToast({
        title: 'Gate Tap Confirmed',
        message: `Your physical RFID check-in has been registered as ${newLog.status.toUpperCase()}.`,
        type: newLog.status === 'present' ? 'success' : 'warning'
      });
      return;
    }

    // 2. If log belongs to a student in one of the teacher's assigned sections
    if (newLog.section_id && assignedSectionIds.has(newLog.section_id)) {
      const { data: fullLog } = await attendanceApi.getAttendanceLogs({ sectionId: newLog.section_id }, 0, 1);
      if (fullLog && fullLog.length > 0) {
        prependLiveScan(fullLog[0]);

        const student = fullLog[0].student;
        if (student) {
          showToast({
            title: 'Student Gate Scan',
            message: `${student.first_name} ${student.last_name} (${fullLog[0].sections?.name || 'Section'}) scanned as ${fullLog[0].status.toUpperCase()}`,
            type: fullLog[0].status === 'present' ? 'success' : 'warning'
          });
        }

        // Live refresh section KPIs and attendance counts
        loadAssignedSections(currentTeacher.id);
      }
    }
  });
}
