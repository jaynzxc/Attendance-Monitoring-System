/**
 * dashboard.js - Page controller for Admin Overview Dashboard
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 * Subsystem of SMS 1
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { renderTrendChart } from '../../components/charts.js';
import { attendanceApi } from '../../api/attendanceApi.js';

let donutChartInstance = null;

/**
 * Animates a numeric element from 0 to target value
 * @param {string} id - Element ID
 * @param {number} end - Target value
 * @param {string} [suffix=''] - Optional suffix (e.g. '%')
 */
export function countUp(id, end, suffix = '') {
  const el = document.getElementById(id);
  if (!el) return;
  let cur = 0;
  const step = Math.max(1, Math.round(end / 30));
  const timer = setInterval(() => {
    cur = Math.min(end, cur + step);
    el.textContent = cur + suffix;
    if (cur >= end) clearInterval(timer);
  }, 16);
}

/**
 * Formats ISO timestamp to institutional local time: HH:MM:SS AM/PM
 */
function formatTime(isoString) {
  if (!isoString) return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Renders (or re-renders on theme change) the Today's Status Breakdown donut chart.
 * @param {{present:number, late:number, absent:number, excused:number}} counts
 */
function renderStatusDonut(counts = { present: 1042, late: 37, absent: 28, excused: 16 }) {
  const ctx = document.getElementById('statusDonutChart');
  if (!ctx) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  if (donutChartInstance) donutChartInstance.destroy();

  donutChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Present', 'Late / Tardy', 'Absent', 'Excused'],
      datasets: [{
        data: [counts.present, counts.late, counts.absent, counts.excused],
        backgroundColor: ['#10B981', '#F59E0B', '#EF4444', '#0288D1'],
        borderColor: isDark ? '#0C1D38' : '#FFFFFF',
        borderWidth: 3,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString()}`
          }
        }
      }
    }
  });

  // Update legend values
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val.toLocaleString();
  };
  set('donut-present', counts.present);
  set('donut-late', counts.late);
  set('donut-absent', counts.absent);
  set('donut-excused', counts.excused);
}

/**
 * Loads and renders live KPI summary counters
 */
async function loadKpis() {
  try {
    const kpis = await attendanceApi.getDailyKpis();
    countUp('k1', kpis.present_today);
    countUp('k2', Math.round(kpis.attendance_rate), '%');
    countUp('k3', kpis.late_today);
    countUp('k4', kpis.absent_today);

    // Update distribution breakdown numbers if present
    const distPresent = document.querySelector('.distrow:nth-child(1) .val');
    const distTardy   = document.querySelector('.distrow:nth-child(2) .val');
    const distAbsent  = document.querySelector('.distrow:nth-child(3) .val');
    const distExcused = document.querySelector('.distrow:nth-child(4) .val');
    const totalBox    = document.querySelector('.totalbox .t-val');

    if (distPresent) distPresent.textContent = kpis.present_today.toLocaleString();
    if (distTardy)   distTardy.textContent   = kpis.late_today.toLocaleString();
    if (distAbsent)  distAbsent.textContent  = kpis.absent_today.toLocaleString();
    if (distExcused) distExcused.textContent = kpis.excused_today.toLocaleString();
    if (totalBox)    totalBox.textContent    = (kpis.present_today + kpis.late_today + kpis.absent_today + kpis.excused_today).toLocaleString();

    // Drive the donut chart with live data
    renderStatusDonut({
      present: kpis.present_today,
      late:    kpis.late_today,
      absent:  kpis.absent_today,
      excused: kpis.excused_today
    });
  } catch (err) {
    console.error('[Dashboard] Error loading KPIs:', err);
    // Render donut with placeholder data so it isn't blank
    renderStatusDonut();
  }
}

/**
 * Loads and renders 5-week trend chart
 */
async function loadTrendChart() {
  try {
    const trendData = await attendanceApi.get5WeekTrend();
    if (Array.isArray(trendData) && trendData.length > 0) {
      const labels = trendData.map(d => d.week);
      const presentData = trendData.map(d => Number(d.rate));
      const targetData = labels.map(() => 92);
      renderTrendChart('trendChart', { labels, presentData, targetData });
    } else {
      renderTrendChart('trendChart');
    }
  } catch (err) {
    console.error('[Dashboard] Error loading trend chart:', err);
    renderTrendChart('trendChart');
  }
}

/**
 * Loads initial recent scans and subscribes to Realtime websocket
 */
async function setupLiveScanStream() {
  const container = document.getElementById('liveScanList');
  if (!container) return;

  try {
    const recentLogs = await attendanceApi.getRecentLogs(6);
    if (recentLogs && recentLogs.length > 0) {
      container.innerHTML = '';
      recentLogs.forEach(log => {
        const person = log.student || log.teacher || {};
        const isTeacher = !!log.teacher_id || person.role === 'teacher';
        const first = person.first_name || '';
        const last = person.last_name || '';
        const fullName = `${first} ${last}`.trim() || (isTeacher ? 'Faculty Member' : 'Student');
        const initials = `${(first[0] || (isTeacher ? 'T' : 'S'))}${(last[0] || '')}`.toUpperCase();
        const gate = log.scan_devices?.location || 'Gate Scanner';
        const time = formatTime(log.scanned_at);
        const status = log.status || 'present';
        const roleLabel = isTeacher ? 'Faculty' : (log.sections?.name || 'Student');

        prependLiveScan({
          initials,
          name: `${fullName} · ${roleLabel}`,
          time,
          gate: `${gate} (${(log.scan_method || 'rfid').toUpperCase()})`,
          status
        });
      });
    }
  } catch (err) {
    console.error('[Dashboard] Error loading initial scans:', err);
  }

  // Subscribe to Realtime INSERTs
  realtimeChannel = subscribeToAttendanceLogs(async (newLog) => {
    const isTeacher = !!newLog.teacher_id;
    const time = formatTime(newLog.scanned_at);
    prependLiveScan({
      initials: isTeacher ? 'FC' : 'ST',
      name: isTeacher ? 'Faculty Check-in · Gate Ingress' : 'Student Tap · Gate Ingress',
      time,
      gate: (newLog.scan_method || 'RFID').toUpperCase(),
      status: newLog.status || 'present'
    });

    // Increment current Present count smoothly if on-time
    const k1 = document.getElementById('k1');
    if (k1 && (newLog.status || 'present').toLowerCase() === 'present') {
      const current = parseInt(k1.textContent, 10) || 0;
      k1.textContent = current + 1;
    }
  });
}

/**
 * Loads Section Watchlist into the watchlistContainer
 */
async function loadSectionWatchlist() {
  const watchlist = await attendanceApi.getSectionsWatchlist(5);
  const container = document.getElementById('watchlistContainer');
  if (!container || !watchlist || watchlist.length === 0) return;

  container.innerHTML = watchlist.map((item) => `
    <div class="list-row">
      <span class="rank">#${item.rank}</span>
      <div class="row-main">
        <div class="section-name">${item.name}</div>
        <div class="section-sub">${item.absenceRate}% absence rate this week</div>
      </div>
      <span class="pill ${item.statusClass}">${item.statusText}</span>
    </div>
  `).join('');
}

async function init() {
  // 1. Enforce RBAC guard
  await requireRole(['admin']);

  // 2. Set current Philippine date in header
  const dateEl = document.querySelector('.pagehead p');
  if (dateEl) {
    const today = new Date();
    const formattedDate = today.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
    dateEl.textContent = `${formattedDate} · Bestlink College of the Philippines`;
  }

  // 3. Render placeholder donut immediately so canvas isn't blank
  renderStatusDonut();

  // 4. Load analytical data & widgets
  loadKpis();
  loadTrendChart();
  loadSectionWatchlist();

  // 5. Redraw charts on theme change
  window.addEventListener('ams-theme-changed', () => {
    loadTrendChart();
    renderStatusDonut();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
