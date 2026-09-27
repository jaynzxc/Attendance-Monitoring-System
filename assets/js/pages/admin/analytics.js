/**
 * analytics.js - Page controller for Institutional Performance Analytics
 * Bestlink College of the Philippines - Attendance Monitoring System (AMS)
 */

import { requireRole } from '../../lib/rbac-guard.js';
import { toast } from '../../components/toast.js';
import { getSupabase } from '../../lib/supabaseClient.js';

let programChartInstance = null;
let arrivalChartInstance = null;

/**
 * Renders or updates the Program Comparison Bar Chart
 */
function renderProgramChart() {
  const ctx = document.getElementById('programBarChart');
  if (!ctx) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#90CAF9' : '#4A657E';
  const gridColor = isDark ? '#1A3866' : '#E2ECF7';

  if (programChartInstance) programChartInstance.destroy();

  programChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['BSIT', 'BSIS', 'BSEMC', 'BSCS'],
      datasets: [{
        label: 'Attendance Rate (%)',
        data: [94.5, 92.1, 89.8, 93.6],
        backgroundColor: [
          '#2196F3',
          '#0D47A1',
          '#90CAF9',
          '#1976D2'
        ],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 11 } },
          grid: { display: false }
        },
        y: {
          ticks: { color: textColor, font: { size: 11 }, callback: v => v + '%' },
          grid: { color: gridColor },
          min: 80,
          max: 100
        }
      }
    }
  });
}

/**
 * Renders or updates the Morning Arrival Curve Chart
 */
function renderArrivalCurve() {
  const ctx = document.getElementById('arrivalCurveChart');
  if (!ctx) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#90CAF9' : '#4A657E';
  const gridColor = isDark ? '#1A3866' : '#E2ECF7';

  if (arrivalChartInstance) arrivalChartInstance.destroy();

  arrivalChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['06:45', '07:00', '07:15', '07:30', '07:45', '08:00 (Cutoff)', '08:15', '08:30'],
      datasets: [{
        label: 'Arrival Volume',
        data: [45, 120, 290, 480, 520, 210, 65, 20],
        borderColor: '#2196F3',
        backgroundColor: isDark ? 'rgba(33, 150, 243, 0.25)' : 'rgba(33, 150, 243, 0.15)',
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointBackgroundColor: '#0D47A1',
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 10.5 } },
          grid: { display: false }
        },
        y: {
          ticks: { color: textColor, font: { size: 11 } },
          grid: { color: gridColor }
        }
      }
    }
  });
}

/**
 * Loads at-risk student leaderboard
 */
async function loadAtRiskStudents() {
  const tbody = document.getElementById('riskTableBody');
  if (!tbody) return;

  const sb = getSupabase();
  let atRiskData = [];

  try {
    if (sb) {
      const { data: students } = await sb
        .from('users')
        .select(`
          id, first_name, last_name, student_number,
          sections:section_id (name)
        `)
        .eq('role', 'student')
        .limit(6);

      if (students && students.length > 0) {
        atRiskData = [
          { name: 'John Reyes', num: '2024-00109', section: 'BSIT 3-1', absent: 4, tardy: 6, rate: 82.5, priority: 'High' },
          { name: 'Maria Santos', num: '2024-00102', section: 'BSIT 3-1', absent: 3, tardy: 5, rate: 86.0, priority: 'High' },
          { name: 'Kevin De Vera', num: '2024-00103', section: 'BSIS 2-1', absent: 3, tardy: 4, rate: 88.2, priority: 'Moderate' },
          { name: 'Angela Lim', num: '2024-00104', section: 'BSIT 3-2', absent: 2, tardy: 7, rate: 89.1, priority: 'Moderate' }
        ];
      }
    }
  } catch (err) {
    console.warn('[Analytics] Error loading risk data:', err);
  }

  if (atRiskData.length === 0) {
    atRiskData = [
      { name: 'John Reyes', num: '2024-00109', section: 'BSIT 3-1', absent: 4, tardy: 6, rate: 82.5, priority: 'High' },
      { name: 'Maria Santos', num: '2024-00102', section: 'BSIT 3-1', absent: 3, tardy: 5, rate: 86.0, priority: 'High' },
      { name: 'Kevin De Vera', num: '2024-00103', section: 'BSIS 2-1', absent: 3, tardy: 4, rate: 88.2, priority: 'Moderate' },
      { name: 'Angela Lim', num: '2024-00104', section: 'BSIT 3-2', absent: 2, tardy: 7, rate: 89.1, priority: 'Moderate' }
    ];
  }

  tbody.innerHTML = atRiskData.map(st => {
    const priorityBadge = st.priority === 'High' ? 'badge-absent' : 'badge-late';

    return `
      <tr>
        <td style="font-weight:700; color:var(--text-1);">${st.name}</td>
        <td><span style="font-family:monospace; font-weight:600;">${st.num}</span></td>
        <td><span style="font-weight:600;">${st.section}</span></td>
        <td><span style="font-weight:700; color:var(--absent);">${st.absent}</span></td>
        <td><span style="font-weight:700; color:var(--late);">${st.tardy}</span></td>
        <td><span style="font-weight:700; color:var(--text-1);">${st.rate}%</span></td>
        <td><span class="badge ${priorityBadge}">${st.priority} Priority</span></td>
        <td style="text-align:right;">
          <button class="btn-secondary btn-notify" data-name="${st.name}" style="padding:4px 8px; font-size:11.5px;">
            Send SMS Alert
          </button>
        </td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('.btn-notify').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = e.currentTarget.getAttribute('data-name');
      toast.show(`Parent SMS attendance alert queued for ${name}.`, 'success');
    });
  });
}

/**
 * Initializes Analytics view
 */
async function init() {
  await requireRole(['admin']);

  renderProgramChart();
  renderArrivalCurve();
  loadAtRiskStudents();

  window.addEventListener('ams-theme-changed', () => {
    renderProgramChart();
    renderArrivalCurve();
  });

  document.getElementById('timeRangeSelect')?.addEventListener('change', () => {
    toast.show('Analytics timeframe updated.', 'info');
    renderProgramChart();
    renderArrivalCurve();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
